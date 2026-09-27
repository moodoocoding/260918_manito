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
const admin = initializeAdminApp({projectId}, "round-admin");
const adminAuth = getAdminAuth(admin);
const adminDb = getAdminFirestore(admin);
const apps = [];
function client(name) {
  const app = initializeApp({projectId, apiKey:"demo-key"}, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings:true});
  const functions = getFunctions(app, "asia-northeast3");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
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
  for (let i=0;i<4;i++) {
    const login = await students[i].call("loginStudent", {classCode, cardCode:cards[i].cardCode});
    await signInWithCustomToken(students[i].auth, login.customToken);
  }
  await assert.rejects(other.call("listRounds", {classId}), {code:"functions/permission-denied"});
  const first = await teacher.call("createRound", roundInput(classId, ids, "첫 번째 작전"));
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
  const ownDataPath = `classes/${classId}/rounds/${roundId}/studentData/${ids[0]}`;
  await assert.rejects(getDoc(doc(students[0].db,`classes/${classId}/rounds/${roundId}/assignmentSecrets/${ids[0]}`)));
  await assert.rejects(getDoc(doc(students[0].db,`classes/${classId}/rounds/${roundId}/studentData/${ids[1]}`)));
  await assert.rejects(getDoc(doc(teacher.db,ownDataPath)));
  const activity = await students[0].call("getStudentActivity",null);
  assert.equal(activity.missions.length,3);
  await students[0].call("setMissionStatus", {missionId:activity.missions[0].missionId,status:"done"});
  const replaceId = rid();
  await students[0].call("replaceMission", {missionId:activity.missions[1].missionId,requestId:replaceId});
  await assert.rejects(students[0].call("replaceMission", {missionId:activity.missions[2].missionId,
    requestId:replaceId}), {code:"functions/already-exists"});
  const firstMsg = await students[0].call("sendMessage", {kind:"preset",text:"오늘도 응원해!",requestId:rid()});
  assert.equal(firstMsg.status,"delivered");
  await assert.rejects(students[0].call("sendMessage", {kind:"preset",text:"고마워!",requestId:rid()}),
    {code:"functions/failed-precondition"});
  const target0 = assignments.find((a)=>a.giverUid===ids[0]).receiverUid;
  const receiver0 = students[ids.indexOf(target0)];
  assert.equal((await receiver0.call("getStudentActivity",null)).inbox.length,1);
  const free = await students[1].call("sendMessage", {kind:"free",text:"좋은 생각을 알려줘서 고마워.",requestId:rid()});
  assert.equal(free.status,"pending");
  const overview = await teacher.call("getTeacherRoundOverview", {classId,roundId});
  assert.equal(overview.pendingMessages.length,1);
  await teacher.call("reviewMessage",{classId,roundId,messageId:free.messageId,decision:"approve",requestId:rid()});
  await receiver0.call("createHelpRequest", {category:"uncomfortable",note:"선생님과 이야기하고 싶어요.",requestId:rid()});
  await teacher.call("changeRoundStatus",{classId,roundId,action:"end",requestId:rid()});
  await assert.rejects(students[2].call("sendMessage", {kind:"preset",text:"고마워!",requestId:rid()}),
    {code:"functions/failed-precondition"});
  await assert.rejects(teacher.call("revealRound",{classId,roundId,requestId:rid()}),
    {code:"functions/failed-precondition"});
  const help = (await teacher.call("getTeacherRoundOverview",{classId,roundId})).helps[0];
  await teacher.call("resolveHelpRequest",{classId,roundId,helpId:help.helpId,
    resolution:"학생과 직접 이야기함",requestId:rid()});
  await teacher.call("revealRound",{classId,roundId,requestId:rid()});
  assert.equal((await students[0].call("getStudentHome",null)).round.status,"revealed");
  const thanksId = rid();
  await students[0].call("sendThankYou",{text:"고마워!",requestId:thanksId});
  await assert.rejects(students[0].call("sendThankYou",{text:"나를 챙겨 줘서 고마워!",requestId:thanksId}),
    {code:"functions/already-exists"});
  await students[0].call("saveReflection",{text:"친구의 이야기를 들어 주었다."});
  await teacher.call("changeRoundStatus",{classId,roundId,action:"archive",requestId:rid()});
  assert.equal((await adminDb.doc(`classes/${classId}`).get()).get("activeRoundId"),null);
  const second = await teacher.call("copyRoundSettings", {classId,sourceRoundId:roundId,
    title:"두 번째 작전",startsAt:new Date(Date.now()-3600_000).toISOString(),
    endsAt:new Date(Date.now()+12*86400_000).toISOString(),requestId:rid()});
  const copiedSettings = await teacher.call("getRoundSettingsForTeacher", {classId,roundId:second.roundId});
  assert.deepEqual(copiedSettings.participantIds,ids);
  assert.equal((await adminDb.collection(`classes/${classId}/rounds/${second.roundId}/assignmentSecrets`).get()).size,0);
  await teacher.call("updateRound", {...roundInput(classId,ids,"두 번째 작전"),roundId:second.roundId});
  const ready2 = await teacher.call("prepareRound",{classId,roundId:second.roundId});
  await teacher.call("startRound",{classId,roundId:second.roundId,
    rosterVersion:ready2.rosterVersion,requestId:rid()});
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
