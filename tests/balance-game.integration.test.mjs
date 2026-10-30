import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { db } from '../functions/lib/shared/firebase.js';
import { Timestamp } from 'firebase-admin/firestore';
import { completeMatching, getStudentBalanceGame, submitBalanceGameChoices, retryStudentBalanceMatching } from '../functions/lib/rounds/balanceGame.js';

const createdClasses=[];
after(async()=>Promise.all(createdClasses.map(id=>db.recursiveDelete(db.doc(`classes/${id}`)))));
const request=(classId,uid='student-a',version=1,choices)=>({data:{...(choices?{choices}:{}),roundId:'expired-legacy-round'},auth:{uid,token:{role:'student',classId,memberId:uid,sessionVersion:version}}});
async function seed(state='collecting',count=2,existing=true,attemptId='attempt-1') {
 const classId=`balance-test-${randomUUID().replaceAll('-','')}`;createdClasses.push(classId);
 const classRef=db.doc(`classes/${classId}`);
 const uids=Array.from({length:count},(_,i)=>`student-${String.fromCharCode(97+i)}`);
 const names=Object.fromEntries(uids.map((id,i)=>[id,`가상 학생 ${i+1}`]));
 const participantKeys=Object.fromEntries(uids.map((id,i)=>[id,`anon-${String.fromCharCode(97+i)}`]));
 const sessionRef=classRef.collection('balanceGameSecrets').doc('current');
 const publicRef=classRef.collection('balanceGamePublic').doc('progress');
 await classRef.set({status:'active',memberCount:count});
 await Promise.all(uids.map(uid=>classRef.collection('members').doc(uid).set({displayName:names[uid],accessStatus:'active',sessionVersion:1})));
 if(existing){
  await sessionRef.set({state,matchingAttemptId:attemptId,participantUids:uids,participantKeys,names,choicesSubmitted:state==='collecting'?0:count});
  await publicRef.set({state,participantCount:count,completedCount:state==='collecting'?0:count,completedNames:state==='collecting'?[]:Object.values(names)});
  if(state!=='collecting')await Promise.all(uids.map((uid,i)=>sessionRef.collection('submissions').doc(uid).set({choices:i===0?Array(10).fill('A'):[...Array(9).fill('A'),'B']})));
 }
 return {classId,classRef,sessionRef,publicRef,uids};
}

test('a class with no Manitto round receives all ten questions and starts its own activity',async()=>{
 const {classId,classRef,sessionRef}=await seed('collecting',2,false);
 const before=(await classRef.get()).data();
 const game=await getStudentBalanceGame.run(request(classId));
 assert.equal(game.questions.length,10);assert.equal(game.canSubmit,true);assert.equal(game.gameId,'current');
 assert.deepEqual((await classRef.get()).data(),before);
 assert.equal((await sessionRef.get()).get('roundId'),undefined);
});

for(const status of ['active','paused','reveal_pending','archived'])test(`Manitto ${status} and its expired date do not block balance questions`,async()=>{
 const {classId,classRef}=await seed('collecting',2,false);
 const round=classRef.collection('rounds').doc('expired-legacy-round');
 await round.set({status,rosterVersion:1,endsAt:Timestamp.fromMillis(Date.now()-86_400_000)});
 await classRef.update({activeRoundId:round.id,lastRoundId:round.id});
 const before=(await round.get()).data();
 const game=await getStudentBalanceGame.run(request(classId));
 assert.equal(game.questions.length,10);assert.equal(game.canSubmit,true);
 assert.deepEqual((await round.get()).data(),before);
 await submitBalanceGameChoices.run(request(classId,'student-a',1,Array(10).fill('A')));
 assert.deepEqual((await round.get()).data(),before);
});

for(const count of [1,3])test(`${count} active members can browse ten questions without submission or an automatic exclusion`,async()=>{
 const {classId,sessionRef}=await seed('collecting',count,false);
 const game=await getStudentBalanceGame.run(request(classId));
 assert.equal(game.questions.length,10);assert.equal(game.canSubmit,false);assert.equal(game.progress,null);assert.equal(game.gameId,null);
 assert.match(game.availabilityMessage,/짝수/);assert.equal((await sessionRef.get()).exists,false);
 await assert.rejects(()=>submitBalanceGameChoices.run(request(classId,'student-a',1,Array(10).fill('A'))),e=>e.code==='failed-precondition');
});

test('duplicate submissions stay single; another student cannot receive the answers or pair map',async()=>{
 const {classId,sessionRef,publicRef}=await seed();
 await Promise.all([submitBalanceGameChoices.run(request(classId,'student-a',1,Array(10).fill('A'))),submitBalanceGameChoices.run(request(classId,'student-a',1,Array(10).fill('A')))]);
 assert.equal((await sessionRef.collection('submissions').get()).size,1);assert.equal((await publicRef.get()).get('completedCount'),1);
 const own=await getStudentBalanceGame.run(request(classId));const other=await getStudentBalanceGame.run(request(classId,'student-b'));
 assert.deepEqual(own.choices,Array(10).fill('A'));assert.equal(other.choices,null);assert.equal(other.partnerName,null);assert.equal('assignments' in other,false);
});

test('reissued cards and another class membership cannot read or submit this activity',async()=>{
 const {classId,classRef}=await seed();
 await classRef.collection('members').doc('student-a').update({sessionVersion:2});
 for(const callable of [getStudentBalanceGame,submitBalanceGameChoices,retryStudentBalanceMatching]){
  await assert.rejects(()=>callable.run(request(classId,'student-a',1,Array(10).fill('A'))),e=>e.code==='permission-denied');
  await assert.rejects(()=>callable.run(request(classId,'outside-student',1,Array(10).fill('A'))),e=>e.code==='permission-denied');
 }
});

test('anonymous matching stores a validated own pair once and records a private audit event',async()=>{
 const {classId,classRef,sessionRef,publicRef}=await seed('matching');let calls=0;
 await completeMatching({classId},sessionRef,'attempt-1',async entries=>{
  calls++;assert.deepEqual(entries,[{id:'anon-a',choices:Array(10).fill('A')},{id:'anon-b',choices:[...Array(9).fill('A'),'B']}]);
  assert.equal(JSON.stringify(entries).includes('가상'),false);return [{a:'anon-a',b:'anon-b',score:9}];
 });
 assert.equal(calls,1);assert.equal((await sessionRef.get()).get('assignments.student-a'),'student-b');
 assert.equal((await publicRef.get()).get('assignments'),undefined);assert.equal((await classRef.collection('auditLogs').get()).size,1);
 const own=await getStudentBalanceGame.run(request(classId));assert.equal(own.partnerName,'가상 학생 2');assert.equal('assignments' in own,false);
});

for(const change of ['class-archived','new-member','removed-member','blocked-member'])test(`a class or roster change prevents publishing an in-flight AI pair: ${change}`,async()=>{
 const {classId,classRef,sessionRef,publicRef}=await seed('matching');
 await assert.rejects(()=>completeMatching({classId},sessionRef,'attempt-1',async()=>{
  if(change==='class-archived')await classRef.update({status:'archived'});
  if(change==='new-member')await classRef.collection('members').doc('student-c').set({accessStatus:'active',sessionVersion:1,displayName:'가상 학생 3'});
  if(change==='removed-member')await classRef.collection('members').doc('student-a').delete();
  if(change==='blocked-member')await classRef.collection('members').doc('student-a').update({accessStatus:'blocked'});
  return [{a:'anon-a',b:'anon-b',score:9}];
 }),/짝을 만들지 못했어요/);
 assert.equal((await sessionRef.get()).get('assignments'),undefined);assert.equal((await publicRef.get()).get('state'),'failed');
});

test('a changed locked roster still returns questions with a preparation reason and no new session',async()=>{
 const {classId,classRef,sessionRef}=await seed();
 await Promise.all(['student-c','student-d'].map(uid=>classRef.collection('members').doc(uid).set({accessStatus:'active',sessionVersion:1,displayName:'가상 새 학생'})));
 const before=(await sessionRef.get()).data();const game=await getStudentBalanceGame.run(request(classId));
 assert.equal(game.questions.length,10);assert.equal(game.canSubmit,false);assert.match(game.availabilityMessage,/명단/);
 assert.deepEqual((await sessionRef.get()).data(),before);
});

test('a stale matching worker does not call AI or overwrite the current lock',async()=>{
 const {classId,sessionRef}=await seed('matching',2,true,'new-attempt');let calls=0;
 await completeMatching({classId},sessionRef,'old-attempt',async()=>{calls++;return [{a:'anon-a',b:'anon-b',score:9}];});
 assert.equal(calls,0);assert.equal((await sessionRef.get()).get('matchingAttemptId'),'new-attempt');
});

test('provider failures preserve saved choices and remain retryable without publishing a pair',async()=>{
 const {classId,sessionRef,publicRef}=await seed('matching');
 await assert.rejects(()=>completeMatching({classId},sessionRef,'attempt-1',async()=>{throw new Error('mock failure');}),/짝을 만들지 못했어요/);
 assert.equal((await sessionRef.get()).get('state'),'failed');assert.equal((await sessionRef.collection('submissions').get()).size,2);
 const game=await getStudentBalanceGame.run(request(classId));assert.equal(game.canRetry,true);assert.equal((await publicRef.get()).get('assignments'),undefined);
});
