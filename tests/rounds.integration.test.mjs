import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const projectId = "demo-manitto";
const authPort = Number(process.env.MANITTO_TEST_AUTH_PORT ?? 9099);
const functionsPort = Number(process.env.MANITTO_TEST_FUNCTIONS_PORT ?? 5001);
const firestorePort = Number(process.env.MANITTO_TEST_FIRESTORE_PORT ?? 8080);
const admin = initializeAdminApp({projectId}, "round-admin");
const adminAuth = getAdminAuth(admin);
const adminDb = getAdminFirestore(admin);
const apps = [];
function client(name) {
  const app = initializeApp({projectId, apiKey:"demo-key"}, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, {disableWarnings:true});
  const functions = getFunctions(app, "asia-northeast3");
  connectFunctionsEmulator(functions, "127.0.0.1", functionsPort);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", firestorePort);
  return {app, auth, functions, db, call: (name, data) => httpsCallable(functions, name)(data).then((r) => r.data)};
}
const teacher = client("round-teacher");
const other = client("round-other");
const students = [0,1,2,3].map((i) => client(`round-student-${i}`));
const runId = crypto.randomUUID().slice(0, 8);
const uid = `teacher-rounds-${runId}`;
const otherUid = `teacher-rounds-other-${runId}`;
const rid = () => crypto.randomUUID();
function dates() {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const date = new Date(today.getTime() + i * 86400_000);
    dates.push(new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit"}).format(date));
  }
  return dates;
}
function roundInput(classId, ids, title, excludedPairs=[]) {
  return {classId, title, startsAt:new Date(Date.now()-3600_000).toISOString(),
    endsAt:new Date(Date.now()+12*86400_000).toISOString(), activityDates:dates(),
    participantIds:ids, excludedPairs, missionIds:["middle-01","middle-02","middle-03"],
    allowFreeTextMessages:true, requestId:rid()};
}
before(async () => {
  for (const id of [uid, otherUid]) {
    await adminAuth.createUser({uid:id, email:`${id}@example.test`});
    await adminAuth.setCustomUserClaims(id, {role:"teacher", teacherVerified:true});
    await adminDb.doc(`teachers/${id}`).set({verificationStatus:"verified", displayName:id,
      createdAt:FieldValue.serverTimestamp()});
  }
  await signInWithCustomToken(teacher.auth, await adminAuth.createCustomToken(uid,
    {role:"teacher", teacherVerified:true}));
  await signInWithCustomToken(other.auth, await adminAuth.createCustomToken(otherUid,
    {role:"teacher", teacherVerified:true}));
});
after(async () => {
  await Promise.allSettled([teacher, other, ...students].map((c) => signOut(c.auth)));
  await Promise.all(apps.map(deleteApp));
});

test("four students complete two isolated rounds with review, help, reveal and history", async () => {
  const {classId, classCode} = await teacher.call("createClass", {name:"두 회차 시뮬레이션반",
    schoolYear:new Date().getUTCFullYear(), gradeBand:"middle", requestId:rid()});
  const registration = await teacher.call("registerStudents", {classId,
    displayNames:["가람","나래","다온","라온"], requestId:rid()});
  const cards = registration.students;
  const ids = cards.map((c) => c.studentUid);
  const catalog = await teacher.call("getMissionCatalog",{classId,gradeBand:"middle"});
  assert.equal(catalog.missions.length,40);
  for (const category of catalog.categories) {
    assert.equal(catalog.missions.filter((mission)=>mission.category===category).length,10);
  }
  assert.equal(catalog.missions.find((mission)=>mission.missionId==="middle-01")?.category,"경청과 대화");
  assert.equal(catalog.missions.find((mission)=>mission.missionId==="middle-02")?.category,"인사와 칭찬");
  await assert.rejects(other.call("getMissionCatalog",{classId,gradeBand:"middle"}),
    {code:"functions/permission-denied"});
  const customRequestId = rid();
  const custom = await teacher.call("createCustomMission",{classId,
    text:"친구의 의견을 차분히 들어주기",requestId:customRequestId});
  assert.deepEqual(await teacher.call("createCustomMission",{classId,
    text:"친구의 의견을 차분히 들어주기",requestId:customRequestId}),custom);
  await assert.rejects(other.call("createCustomMission",{classId,text:"다른 미션",requestId:rid()}),
    {code:"functions/permission-denied"});
  for (let i=0;i<4;i++) {
    const login = await students[i].call("loginStudent", {classCode, cardCode:cards[i].cardCode});
    await signInWithCustomToken(students[i].auth, login.customToken);
  }
  const rightsId = rid();
  const rights = await students[0].call("createRightsRequest", {
    kind:"access",note:"제 기록을 확인하고 싶어요.",requestId:rightsId,
  });
  assert.deepEqual(await students[0].call("createRightsRequest", {
    kind:"access",note:"제 기록을 확인하고 싶어요.",requestId:rightsId,
  }),rights);
  await assert.rejects(students[0].call("createRightsRequest", {
    kind:"deletion",requestId:rightsId,
  }),{code:"functions/already-exists"});
  assert.equal((await students[0].call("listMyRightsRequests",null)).requests.length,1);
  assert.equal((await students[1].call("listMyRightsRequests",null)).requests.length,0);
  assert.equal((await teacher.call("getRightsRequestsForTeacher",{classId})).requests[0].note,
    "제 기록을 확인하고 싶어요.");
  await assert.rejects(other.call("getRightsRequestsForTeacher",{classId}),
    {code:"functions/permission-denied"});
  await assert.rejects(other.call("listRounds", {classId}), {code:"functions/permission-denied"});
  const futureDates = Array.from({length:5},(_,i)=>new Date(Date.now()+(i+2)*86400_000))
    .map((date)=>new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul",year:"numeric",
      month:"2-digit",day:"2-digit"}).format(date));
  const future = await teacher.call("createRound",{...roundInput(classId,ids,"미래 시즌"),
    startsAt:new Date(Date.now()+86400_000).toISOString(),
    endsAt:new Date(Date.now()+10*86400_000).toISOString(),activityDates:futureDates});
  const futureReady = await teacher.call("prepareRound",{classId,roundId:future.roundId});
  await assert.rejects(teacher.call("startRound",{classId,roundId:future.roundId,
    rosterVersion:futureReady.rosterVersion,requestId:rid()}),{code:"functions/failed-precondition"});
  await teacher.call("changeRoundStatus",{classId,roundId:future.roundId,action:"cancel",requestId:rid()});
  const first = await teacher.call("createRound", {...roundInput(classId, ids, "첫 번째 작전"),
    missionIds:[custom.missionId,"middle-02","middle-03"]});
  const roundId = first.roundId;
  assert.equal((await students[0].call("getStudentHome", null)).round, null);
  const badPairs = ids.slice(1).map((id) => [ids[0], id]);
  const impossible = await teacher.call("createRound", roundInput(classId, ids, "불가능 조건", badPairs));
  await assert.rejects(teacher.call("prepareRound", {classId, roundId:impossible.roundId}),
    {code:"functions/failed-precondition"});
  assert.equal((await adminDb.doc(`classes/${classId}/rounds/${impossible.roundId}`).get()).get("status"), "draft");
  assert.equal((await adminDb.collection(`classes/${classId}/rounds/${impossible.roundId}/assignmentSecrets`).get()).size, 0);
  await teacher.call("changeRoundStatus", {classId,roundId:impossible.roundId,action:"cancel",requestId:rid()});
  const ready = await teacher.call("prepareRound", {classId, roundId});
  const starts = await Promise.allSettled([teacher.call("startRound", {classId, roundId,
    rosterVersion:ready.rosterVersion, requestId:rid()}), teacher.call("startRound", {classId, roundId,
    rosterVersion:ready.rosterVersion, requestId:rid()})]);
  assert.equal(starts.filter((r)=>r.status==="fulfilled").length,1);
  const assignments = (await teacher.call("getAssignmentsForTeacher", {classId, roundId})).assignments;
  assert.equal(assignments.length,4);
  assert.equal(new Set(assignments.map((a)=>a.receiverUid)).size,4);
  assert.ok(assignments.every((a)=>a.giverUid!==a.receiverUid));
  const firstHome = await students[0].call("getStudentHome",null);
  assert.equal(firstHome.round.status,"active");
  assert.equal(firstHome.gradeBand,"middle");
  const ownDataPath = `classes/${classId}/rounds/${roundId}/studentData/${ids[0]}`;
  await assert.rejects(getDoc(doc(students[0].db,`classes/${classId}/rounds/${roundId}/assignmentSecrets/${ids[0]}`)));
  await assert.rejects(getDoc(doc(students[0].db,`classes/${classId}/rounds/${roundId}/studentData/${ids[1]}`)));
  await assert.rejects(getDoc(doc(teacher.db,ownDataPath)));
  const activity = await students[0].call("getStudentActivity",null);
  assert.equal(activity.missions.length,3);
  assert.ok(activity.missions.some((mission)=>mission.text===custom.text));
  assert.equal(activity.thankYouSent,false);
  assert.equal(activity.reflectionText,null);
  assert.equal(typeof activity.koreaDate,"string");
  await students[0].call("setMissionStatus", {missionId:activity.missions[0].missionId,status:"done"});
  const replaceId = rid();
  await students[0].call("replaceMission", {missionId:activity.missions[1].missionId,requestId:replaceId});
  await assert.rejects(students[0].call("replaceMission", {missionId:activity.missions[2].missionId,
    requestId:replaceId}), {code:"functions/already-exists"});
  const firstMsg = await students[0].call("sendMessage", {kind:"preset",text:"오늘도 응원해!",requestId:rid()});
  assert.equal(firstMsg.status,"delivered");
  assert.equal((await students[0].call("sendMessage", {kind:"preset",text:"고마워!",requestId:rid()})).status,"delivered");
  const target0 = assignments.find((a)=>a.giverUid===ids[0]).receiverUid;
  const receiver0 = students[ids.indexOf(target0)];
  const stranger = students[ids.findIndex((id)=>id!==ids[0] && id!==target0)];
  assert.equal((await receiver0.call("getStudentActivity",null)).inbox.length,2);
  const reply = await receiver0.call("sendMessage",{kind:"free",text:"응원 고마워!",
    replyToMessageId:firstMsg.messageId,requestId:rid()});
  assert.equal(reply.status,"delivered");
  assert.ok((await students[0].call("getStudentActivity",null)).inbox.some((m)=>m.messageId===reply.messageId));
  await assert.rejects(stranger.call("sendMessage",{kind:"free",text:"허용되지 않은 답장",
    replyToMessageId:firstMsg.messageId,requestId:rid()}),{code:"functions/permission-denied"});
  const monitored = await teacher.call("listTeacherMessages",{classId,roundId});
  assert.ok(monitored.messages.some((item)=>item.messageId===reply.messageId));
  assert.equal(JSON.stringify(monitored).includes("응원 고마워!"),false);
  await assert.rejects(other.call("listTeacherMessages",{classId,roundId}),
    {code:"functions/permission-denied"});
  await teacher.call("moderateMessage",{classId,roundId,messageId:reply.messageId,requestId:rid()});
  assert.equal((await students[0].call("getStudentActivity",null)).inbox.find((m)=>m.messageId===reply.messageId).hidden,true);
  await assert.rejects(students[0].call("sendMessage",{kind:"free",text:"숨긴 쪽지 답장",
    replyToMessageId:reply.messageId,requestId:rid()}),{code:"functions/permission-denied"});
  for (let i=0;i<8;i++) await students[0].call("sendMessage",{
    kind:"preset",text:"고마워!",requestId:rid()});
  assert.equal((await students[0].call("getStudentActivity",null)).messagesSentToday,10);
  await assert.rejects(students[0].call("sendMessage",{kind:"preset",text:"고마워!",requestId:rid()}),
    {code:"functions/failed-precondition"});
  await receiver0.call("reactToMessage",{messageId:firstMsg.messageId,requestId:rid()});
  assert.equal((await students[0].call("getStudentActivity",null)).sent.find((m)=>m.messageId===firstMsg.messageId).reacted,true);
  await assert.rejects(receiver0.call("reactToMessage",{messageId:firstMsg.messageId,requestId:rid()}),
    {code:"functions/failed-precondition"});
  const free = await students[1].call("sendMessage", {kind:"free",text:"좋은 생각을 알려줘서 고마워.",requestId:rid()});
  assert.equal(free.status,"delivered");
  const overview = await teacher.call("getTeacherRoundOverview", {classId,roundId});
  assert.equal(overview.pendingMessages.length,0);
  assert.ok(overview.participation.every((item) => item.lastLoginAt));
  const summary = await teacher.call("getTeacherRoundOverview", {classId,roundId,summaryOnly:true});
  assert.equal(summary.pendingMessageCount,0);
  assert.equal(summary.participantCount,4);
  assert.equal(JSON.stringify(summary).includes("좋은 생각을 알려줘서"),false);
  assert.equal("pendingMessages" in summary,false);
  await assert.rejects(other.call("getTeacherRoundOverview",{classId,roundId,summaryOnly:true}),
    {code:"functions/permission-denied"});
  await assert.rejects(teacher.call("reviewMessage",{classId,roundId,messageId:free.messageId,
    decision:"approve",requestId:rid()}),{code:"functions/failed-precondition"});
  await receiver0.call("createHelpRequest", {category:"message",messageId:firstMsg.messageId,requestId:rid()});
  const reported = await teacher.call("getMessageForReview",{classId,roundId,messageId:firstMsg.messageId});
  assert.equal(reported.senderUid,ids[0]);
  assert.equal(reported.text,"오늘도 응원해!");
  await assert.rejects(other.call("getMessageForReview",{classId,roundId,messageId:firstMsg.messageId}),
    {code:"functions/permission-denied"});
  await receiver0.call("createHelpRequest", {category:"uncomfortable",note:"선생님과 이야기하고 싶어요.",requestId:rid()});
  await teacher.call("changeRoundStatus",{classId,roundId,action:"pause",requestId:rid()});
  await assert.rejects(students[2].call("sendMessage", {kind:"preset",text:"고마워!",requestId:rid()}),
    {code:"functions/failed-precondition"});
  await teacher.call("extendRound",{classId,roundId,endsAt:new Date(Date.now()+13*86400_000).toISOString(),
    activityDates:dates(),requestId:rid()});
  await teacher.call("changeRoundStatus",{classId,roundId,action:"resume",requestId:rid()});
  await teacher.call("changeRoundStatus",{classId,roundId,action:"end",requestId:rid()});
  await assert.rejects(students[2].call("sendMessage", {kind:"preset",text:"고마워!",requestId:rid()}),
    {code:"functions/failed-precondition"});
  await assert.rejects(teacher.call("revealRound",{classId,roundId,requestId:rid()}),
    {code:"functions/failed-precondition"});
  const helps = (await teacher.call("getTeacherRoundOverview",{classId,roundId})).helps;
  for (const help of helps) await teacher.call("resolveHelpRequest",{classId,roundId,helpId:help.helpId,
    resolution:"학생과 직접 이야기함",requestId:rid()});
  await teacher.call("revealRound",{classId,roundId,requestId:rid()});
  assert.equal((await adminDb.doc(`classes/${classId}`).get()).get("activeRoundId"),null);
  assert.equal((await students[0].call("getStudentHome",null)).round.status,"revealed");
  const thanksId = rid();
  await students[0].call("sendThankYou",{text:"고마워!",requestId:thanksId});
  await assert.rejects(students[0].call("sendThankYou",{text:"나를 챙겨 줘서 고마워!",requestId:thanksId}),
    {code:"functions/already-exists"});
  await students[0].call("saveReflection",{text:"친구의 이야기를 들어 주었다."});
  const reflected = await students[0].call("getStudentActivity",{roundId});
  assert.equal(reflected.reflectionText,"친구의 이야기를 들어 주었다.");
  assert.equal(reflected.thankYouSent,true);
  assert.equal((await students[0].call("listStudentRounds",null)).rounds[0].roundId,roundId);
  const second = await teacher.call("copyRoundSettings", {classId,sourceRoundId:roundId,
    title:"두 번째 작전",startsAt:new Date(Date.now()-3600_000).toISOString(),
    endsAt:new Date(Date.now()+12*86400_000).toISOString(),requestId:rid()});
  const copiedSettings = await teacher.call("getRoundSettingsForTeacher", {classId,roundId:second.roundId});
  assert.deepEqual(copiedSettings.participantIds,ids);
  assert.equal((await adminDb.collection(`classes/${classId}/rounds/${second.roundId}/assignmentSecrets`).get()).size,0);
  await teacher.call("updateRound", {...roundInput(classId,ids,"두 번째 작전"),
    missionIds:["middle-01"],roundId:second.roundId});
  const ready2 = await teacher.call("prepareRound",{classId,roundId:second.roundId});
  await teacher.call("startRound",{classId,roundId:second.roundId,
    rosterVersion:ready2.rosterVersion,requestId:rid()});
  assert.equal((await students[0].call("getStudentActivity",{roundId:second.roundId})).missions.length,1);
  await teacher.call("changeRoundStatus",{classId,roundId,action:"archive",requestId:rid()});
  assert.equal((await adminDb.doc(`classes/${classId}`).get()).get("activeRoundId"),second.roundId);
  assert.equal((await students[0].call("getStudentActivity",{roundId})).roundId,roundId);
  assert.equal((await students[0].call("listStudentRounds",null)).rounds[0].roundId,roundId);
  const oldHelp = await students[0].call("createHelpRequest",{roundId,category:"other",note:"지난 회차 문의",requestId:rid()});
  await teacher.call("resolveHelpRequest",{classId,roundId,helpId:oldHelp.helpId,
    resolution:"지난 회차 문의 처리",requestId:rid()});
  const assignments2 = (await teacher.call("getAssignmentsForTeacher",{classId,roundId:second.roundId})).assignments;
  assert.equal(assignments2.length,4);
  assert.ok(assignments2.every((a)=>a.giverUid!==a.receiverUid));
  assert.equal(new Set(assignments2.map((a)=>a.receiverUid)).size,4);
  assert.equal((await students[0].call("getStudentHome",null)).round.title,"두 번째 작전");
  await assert.rejects(students[0].call("sendMessage", {kind:"preset",text:"임의 문구",requestId:rid()}),
    {code:"functions/invalid-argument"});
  await assert.rejects(teacher.call("deleteClassData", {classId,requestId:rid()}),
    {code:"functions/failed-precondition"});
  await teacher.call("changeRoundStatus", {classId,roundId:second.roundId,action:"end",requestId:rid()});
  await teacher.call("revealRound", {classId,roundId:second.roundId,requestId:rid()});
  await teacher.call("changeRoundStatus", {classId,roundId:second.roundId,action:"archive",requestId:rid()});
  assert.equal((await teacher.call("deleteClassData", {classId,requestId:rid()})).status,"complete");
  assert.equal((await adminDb.doc(`classes/${classId}`).get()).exists,false);
  assert.equal((await adminDb.doc(`studentCredentials/${ids[0]}`).get()).exists,false);
  await assert.rejects(students[0].call("getStudentHome",null), {code:"functions/permission-denied"});
});

test("forty students start as one atomic one-to-one round", async () => {
  const {classId,classCode} = await teacher.call("createClass", {name:"정원 검증반",
    schoolYear:new Date().getUTCFullYear(), gradeBand:"middle", requestId:rid()});
  const registration = await teacher.call("registerStudents", {classId,
    displayNames:Array.from({length:40},(_,i)=>`가상학생${i+1}`),requestId:rid()});
  assert.equal(registration.students.length,40);
  const ids = registration.students.map((student)=>student.studentUid);
  const legacyCards = adminDb.batch();
  for (const studentUid of ids) {
    legacyCards.update(adminDb.doc(`studentCredentials/${studentUid}`),
      {encryptedCardCode:FieldValue.delete()});
    legacyCards.update(adminDb.doc(`classes/${classId}/members/${studentUid}`),
      {printableCardAvailable:false});
  }
  await legacyCards.commit();
  const missingCards = await teacher.call("getPrintableCards",{classId,studentUids:ids});
  assert.equal(missingCards.cards.length,0);
  assert.equal(missingCards.missingStudentUids.length,40);
  await teacher.call("reissueMissingCards",{classId,studentUids:ids,requestId:rid()});
  const reprintedCards = await teacher.call("getPrintableCards",{classId,studentUids:ids});
  assert.equal(reprintedCards.cards.length,40);
  assert.notEqual(reprintedCards.cards[0].cardCode,registration.students[0].cardCode);
  const activityDates = Array.from({length:20},(_,i)=>new Date(Date.now()+i*86400_000))
    .filter((date)=>![0,6].includes(date.getUTCDay()))
    .map((date)=>new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul",year:"numeric",
      month:"2-digit",day:"2-digit"}).format(date));
  const tenMissionIds = Array.from({length:10},(_,i)=>`middle-${String(i+1).padStart(2,"0")}`);
  const {roundId} = await teacher.call("createRound",{...roundInput(classId,ids,"정원 검증"),
    endsAt:new Date(Date.now()+20*86400_000).toISOString(),activityDates,
    missionIds:tenMissionIds});
  assert.ok(activityDates.length >= 14, "20-day season should accept more than 10 school days");
  const ready = await teacher.call("prepareRound",{classId,roundId});
  await teacher.call("startRound",{classId,roundId,rosterVersion:ready.rosterVersion,requestId:rid()});
  assert.equal((await adminDb.doc(`classes/${classId}/rounds/${roundId}`).get()).get("missionPlan").length,10);
  assert.equal((await adminDb.collection(`classes/${classId}/rounds/${roundId}/studentData/${ids[0]}/missions`).get()).size,0);
  const login = await students[0].call("loginStudent",{classCode,cardCode:reprintedCards.cards[0].cardCode});
  await signInWithCustomToken(students[0].auth,login.customToken);
  const tenMissions = await students[0].call("getStudentActivity",null);
  assert.equal(tenMissions.missions.length,10);
  await students[0].call("setMissionStatus",{missionId:tenMissionIds[0],status:"done"});
  assert.equal((await students[0].call("getStudentActivity",null)).missions[0].status,"done");
  const replacement = await students[0].call("replaceMission",{missionId:tenMissionIds[1],requestId:rid()});
  assert.equal(tenMissionIds.includes(replacement.missionId),false);
  assert.equal((await students[0].call("getStudentActivity",null)).missions
    .filter((mission)=>mission.status!=="replaced").length,10);
  assert.equal((await teacher.call("getTeacherRoundOverview",{classId,roundId})).participation
    .find((item)=>item.studentUid===ids[0]).hasActivity,true);
  const assignments = (await teacher.call("getAssignmentsForTeacher",{classId,roundId})).assignments;
  assert.equal(assignments.length,40);
  assert.equal(new Set(assignments.map((a)=>a.receiverUid)).size,40);
  assert.ok(assignments.every((a)=>a.giverUid!==a.receiverUid));
  await teacher.call("changeRoundStatus",{classId,roundId,action:"cancel",requestId:rid()});
  await teacher.call("deleteClassData",{classId,requestId:rid()});
  assert.equal((await adminDb.doc(`classes/${classId}`).get()).exists,false);
});
