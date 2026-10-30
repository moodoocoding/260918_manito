import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { signInEmulatorGoogle } from "../scripts/emulator-google-auth.mjs";

const projectId = "demo-manitto";
const suffix = crypto.randomUUID().slice(0, 8);
const classId = `mail-class-a-${suffix}`;
const otherClassId = `mail-class-b-${suffix}`;
const teacherUid = `mail-teacher-a-${suffix}`;
const otherTeacherUid = `mail-teacher-b-${suffix}`;
const studentUid = `mail-student-a-${suffix}`;
const otherStudentUid = `mail-student-b-${suffix}`;
const outsideStudentUid = `mail-student-c-${suffix}`;
const clients = [];
let adminDb;
let adminAuth;
let teacher;
let otherTeacher;
let student;
let otherStudent;
let outsideStudent;
let firstLetter;
let reportMail;

async function makeClient(uid, claims) {
  const app = initializeApp({ projectId, apiKey: "demo-key" }, `${uid}-app`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${Number(process.env.MANITTO_TEST_AUTH_PORT ?? 9099)}`, { disableWarnings: true });
  const functions = getFunctions(app, "asia-northeast3");
  connectFunctionsEmulator(functions, "127.0.0.1", Number(process.env.MANITTO_TEST_FUNCTIONS_PORT ?? 5001));
  if (claims.role === "teacher") await signInEmulatorGoogle(auth, adminAuth, uid, claims);
  else await signInWithCustomToken(auth, await adminAuth.createCustomToken(uid, claims));
  const client = { app, auth, functions, uid, claims };
  clients.push(client);
  return client;
}

const call = async (client, name, data) => (await httpsCallable(client.functions, name)(data)).data;
const denied = (work) => assert.rejects(work, (error) => error.code === "functions/permission-denied");
const requestId = () => crypto.randomUUID();

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Teacher mailbox integration tests require the demo-manitto emulators.");
  }
  const admin = initializeAdminApp({ projectId }, `teacher-mail-admin-${suffix}`);
  adminDb = getAdminFirestore(admin);
  adminAuth = getAdminAuth(admin);
  await Promise.all([
    adminDb.doc(`teachers/${teacherUid}`).set({ verificationStatus: "verified", displayName: "가상 담당 교사" }),
    adminDb.doc(`teachers/${otherTeacherUid}`).set({ verificationStatus: "verified", displayName: "다른 가상 교사" }),
    adminDb.doc(`classes/${classId}`).set({ status: "active", teacherUids: [teacherUid], ownerUid: teacherUid,
      activeRoundId: null, lastRoundId: null, memberCount: 2 }),
    adminDb.doc(`classes/${otherClassId}`).set({ status: "active", teacherUids: [otherTeacherUid], ownerUid: otherTeacherUid,
      activeRoundId: null, lastRoundId: null, memberCount: 1 }),
    adminDb.doc(`classes/${classId}/members/${studentUid}`).set({ displayName: "가상 학생 가", accessStatus: "active", sessionVersion: 1 }),
    adminDb.doc(`classes/${classId}/members/${otherStudentUid}`).set({ displayName: "가상 학생 나", accessStatus: "active", sessionVersion: 1 }),
    adminDb.doc(`classes/${otherClassId}/members/${outsideStudentUid}`).set({ displayName: "가상 학생 다", accessStatus: "active", sessionVersion: 1 }),
  ]);
  teacher = await makeClient(teacherUid, { role: "teacher", teacherVerified: true });
  otherTeacher = await makeClient(otherTeacherUid, { role: "teacher", teacherVerified: true });
  student = await makeClient(studentUid, { role: "student", memberId: studentUid, classId, sessionVersion: 1 });
  otherStudent = await makeClient(otherStudentUid, { role: "student", memberId: otherStudentUid, classId, sessionVersion: 1 });
  outsideStudent = await makeClient(outsideStudentUid, { role: "student", memberId: outsideStudentUid, classId: otherClassId, sessionVersion: 1 });
});

after(async () => {
  await Promise.allSettled(clients.map((client) => signOut(client.auth)));
  await Promise.all(clients.map((client) => deleteApp(client.app)));
  if (adminDb) {
    await Promise.allSettled([adminDb.recursiveDelete(adminDb.doc(`classes/${classId}`)),
      adminDb.recursiveDelete(adminDb.doc(`classes/${otherClassId}`)),
      adminDb.doc(`teachers/${teacherUid}`).delete(), adminDb.doc(`teachers/${otherTeacherUid}`).delete(),
      adminDb.doc(`deletionJobs/${classId}`).delete()]);
  }
  if (adminAuth) await Promise.allSettled([teacherUid, otherTeacherUid, studentUid, otherStudentUid, outsideStudentUid].map((uid) => adminAuth.deleteUser(uid)));
});

test("teacher mailbox private delivery, session guards, pagination, reporting and deletion", async (t) => {
  await t.test("a student without any round sends a paragraph-preserving letter exactly once", async () => {
    const input = { kind: "letter", letter: { subject: "가상 편지", body: "가상 첫째 문단\n\n가상 둘째 문단" }, requestId: requestId() };
    const results = await Promise.all(Array.from({ length: 3 }, () => call(student, "createTeacherMail", input)));
    firstLetter = results[0];
    assert.ok(results.every((item) => item.mailId === firstLetter.mailId));
    assert.equal(firstLetter.status, "received");
    assert.equal((await adminDb.collection(`classes/${classId}/teacherMailSecrets`).get()).size, 1);
    await assert.rejects(() => call(student, "createTeacherMail", { ...input, letter: { ...input.letter, body: "다른 가상 편지" } }),
      (error) => error.code === "functions/already-exists");
    const my = await call(student, "listMyTeacherMail", {});
    assert.equal(my.items.length, 1);
    assert.equal(my.items[0].mailId, firstLetter.mailId);
    assert.deepEqual(Object.keys(my.items[0]).sort(), ["createdAt", "kind", "mailId", "status"]);
    const list = await call(teacher, "listTeacherMail", { classId, kind: "letter", status: "received" });
    assert.equal(list.items[0].studentName, "가상 학생 가");
    assert.equal(list.items[0].letter, undefined);
    assert.equal(list.items[0].subject, undefined);
    assert.equal(list.items[0].studentUid, undefined);
    const detail = await call(teacher, "getTeacherMail", { classId, mailId: firstLetter.mailId });
    assert.equal(detail.letter.body, input.letter.body);
    assert.equal(detail.status, "received");
    assert.equal(detail.studentUid, undefined);
    assert.equal((await adminDb.doc(`classes/${classId}/teacherMailSecrets/${firstLetter.mailId}`).get()).get("status"), "received");
    const audit = await adminDb.collection(`classes/${classId}/auditLogs`).where("action", "==", "teacher_mail.read").get();
    assert.equal(audit.size, 1);
    assert.equal(audit.docs[0].get("letter"), undefined);
    assert.equal(audit.docs[0].get("studentName"), undefined);
  });

  await t.test("another student, classroom or teacher cannot access original mail", async () => {
    await denied(() => call(otherTeacher, "getTeacherMail", { classId, mailId: firstLetter.mailId }));
    await denied(() => call(otherTeacher, "listTeacherMail", { classId, kind: "letter", status: "received" }));
    await denied(() => call(otherTeacher, "resolveTeacherMail", { classId, mailId: firstLetter.mailId, resolution: "임의 처리", requestId: requestId() }));
    await denied(() => call(otherStudent, "getTeacherMail", { classId, mailId: firstLetter.mailId }));
    await denied(() => call(outsideStudent, "getTeacherMail", { classId, mailId: firstLetter.mailId }));
    assert.deepEqual((await call(otherStudent, "listMyTeacherMail", { studentUid })).items, []);
    assert.deepEqual((await call(outsideStudent, "listMyTeacherMail", { classId, studentUid })).items, []);
    await assert.rejects(() => call(otherStudent, "listMyTeacherMail", { cursor: firstLetter.mailId }),
      (error) => error.code === "functions/invalid-argument");
    const spoof = await call(student, "createTeacherMail", { kind: "letter", letter: { body: "수신자 지정 불가 가상 편지" },
      classId: otherClassId, studentUid: outsideStudentUid, recipientUid: otherStudentUid, requestId: requestId() });
    const stored = await adminDb.doc(`classes/${classId}/teacherMailSecrets/${spoof.mailId}`).get();
    assert.equal(stored.get("studentUid"), studentUid);
    assert.equal(stored.get("recipientUid"), undefined);
    assert.equal((await adminDb.doc(`classes/${otherClassId}/teacherMailSecrets/${spoof.mailId}`).get()).exists, false);
  });

  await t.test("long structured reports retain all fields and do not require unknown details", async () => {
    const report = { relatedStudents: ["가상 관련 학생 가", "가상 관련 학생 나"], occurredAt: "정확한 시각은 모르겠어요",
      location: "가상 장소", incident: "가".repeat(2999) + "\n\n" + "나".repeat(2999), reason: "이유는 모르겠어요",
      witnesses: [{ name: "가상 목격 학생", otherClass: true, className: "3학년 4반" }],
      feelings: "걱정돼요", desiredAction: "이야기를 들어 주세요", neededHelp: "안전하게 지내고 싶어요" };
    reportMail = await call(student, "createTeacherMail", { kind: "report", report, requestId: requestId() });
    const detail = await call(teacher, "getTeacherMail", { classId, mailId: reportMail.mailId });
    assert.deepEqual(detail.report, report);
    assert.equal(detail.status, "received");
    const minimal = await call(otherStudent, "createTeacherMail", { kind: "report", report: { incident: "가상 사안을 알리고 싶어요" }, requestId: requestId() });
    const minimumDetail = await call(teacher, "getTeacherMail", { classId, mailId: minimal.mailId });
    assert.deepEqual(minimumDetail.report.relatedStudents, []);
    assert.equal(minimumDetail.report.reason, "");
    await assert.rejects(() => call(student, "createTeacherMail", { kind: "report", report: { incident: "가상 사안", witnesses: [{ name: "가상 목격 학생", otherClass: true }] }, requestId: requestId() }),
      (error) => error.code === "functions/invalid-argument");
    await assert.rejects(() => call(student, "createTeacherMail", { kind: "report", report: { incident: "가".repeat(6001) }, requestId: requestId() }),
      (error) => error.code === "functions/invalid-argument");
  });

  await t.test("outdated, blocked, suspended and inactive-class access is rejected on every API boundary", async () => {
    const member = adminDb.doc(`classes/${classId}/members/${studentUid}`);
    await member.update({ sessionVersion: 2 });
    await denied(() => call(student, "listMyTeacherMail", {}));
    await denied(() => call(student, "createTeacherMail", { kind: "letter", letter: { body: "구 카드 가상 편지" }, requestId: requestId() }));
    await signOut(student.auth);
    student.claims.sessionVersion = 2;
    await signInWithCustomToken(student.auth, await adminAuth.createCustomToken(student.uid, student.claims));
    await member.update({ accessStatus: "blocked" });
    await denied(() => call(student, "listMyTeacherMail", {}));
    await denied(() => call(student, "createTeacherMail", { kind: "letter", letter: { body: "차단 가상 편지" }, requestId: requestId() }));
    await member.update({ accessStatus: "active" });
    await adminDb.doc(`teachers/${teacherUid}`).update({ verificationStatus: "suspended" });
    await denied(() => call(teacher, "listTeacherMail", { classId, kind: "report", status: "received" }));
    await denied(() => call(teacher, "getTeacherMail", { classId, mailId: reportMail.mailId }));
    await denied(() => call(teacher, "resolveTeacherMail", { classId, mailId: reportMail.mailId, resolution: "가상 처리", requestId: requestId() }));
    await adminDb.doc(`teachers/${teacherUid}`).update({ verificationStatus: "verified" });
    await adminDb.doc(`classes/${classId}`).update({ status: "deleting" });
    await denied(() => call(student, "listMyTeacherMail", {}));
    await denied(() => call(teacher, "getTeacherMail", { classId, mailId: reportMail.mailId }));
    await adminDb.doc(`classes/${classId}`).update({ status: "active" });
  });

  await t.test("twenty-item filtered pages contain no duplicate, other-kind or original content", async () => {
    await Promise.all(Array.from({ length: 22 }, (_, i) => call(student, "createTeacherMail", {
      kind: "letter", letter: { subject: `가상 제목 ${i}`, body: "페이지 검증용 가상 편지" }, requestId: requestId(),
    })));
    const first = await call(teacher, "listTeacherMail", { classId, kind: "letter", status: "received" });
    assert.equal(first.items.length, 20);
    assert.equal(typeof first.nextCursor, "string");
    const second = await call(teacher, "listTeacherMail", { classId, kind: "letter", status: "received", cursor: first.nextCursor });
    assert.ok(second.items.length > 0 && second.items.length < 20);
    assert.equal(second.nextCursor, null);
    const all = [...first.items, ...second.items];
    assert.equal(new Set(all.map((item) => item.mailId)).size, all.length);
    assert.ok(all.every((item) => item.kind === "letter" && item.status === "received" && item.letter === undefined && item.report === undefined));
    const expected = await adminDb.collection(`classes/${classId}/teacherMailSecrets`).where("kind", "==", "letter").where("status", "==", "received").get();
    assert.equal(all.length, expected.size);
    await assert.rejects(() => call(teacher, "listTeacherMail", { classId, kind: "report", status: "received", cursor: first.nextCursor }),
      (error) => error.code === "functions/invalid-argument");
    const myFirst = await call(student, "listMyTeacherMail", {});
    const mySecond = await call(student, "listMyTeacherMail", { cursor: myFirst.nextCursor });
    assert.equal(myFirst.items.length, 20);
    assert.equal(mySecond.nextCursor, null);
    assert.equal(new Set([...myFirst.items, ...mySecond.items].map((item) => item.mailId)).size, myFirst.items.length + mySecond.items.length);
    assert.ok([...myFirst.items, ...mySecond.items].every((item) => item.studentName === undefined && item.letter === undefined && item.report === undefined));
  });

  await t.test("unresolved reports block reveal even after audited viewing, and resolution is idempotent", async () => {
    const roundId = `mail-round-${suffix}`;
    await adminDb.doc(`classes/${classId}/rounds/${roundId}`).set({ status: "reveal_pending" });
    await adminDb.doc(`classes/${classId}`).update({ activeRoundId: roundId });
    await call(teacher, "getTeacherMail", { classId, mailId: reportMail.mailId });
    await assert.rejects(() => call(teacher, "revealRound", { classId, roundId, requestId: requestId() }),
      (error) => error.code === "functions/failed-precondition");
    const pending = await adminDb.collection(`classes/${classId}/teacherMailSecrets`).where("kind", "==", "report").where("status", "==", "received").get();
    for (const doc of pending.docs) {
      const input = { classId, mailId: doc.id, resolution: "가상 사안의 필요한 확인과 조치를 마쳤습니다.", requestId: requestId() };
      const results = await Promise.all([call(teacher, "resolveTeacherMail", input), call(teacher, "resolveTeacherMail", input)]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[0].status, "resolved");
      await assert.rejects(() => call(teacher, "resolveTeacherMail", { ...input, resolution: "다른 처리 기록" }),
        (error) => error.code === "functions/already-exists");
    }
    const resolved = await call(teacher, "listTeacherMail", { classId, kind: "report", status: "resolved" });
    assert.equal(resolved.items.length, pending.size);
    const my = await call(student, "listMyTeacherMail", {});
    const myNext = await call(student, "listMyTeacherMail", { cursor: my.nextCursor });
    const mine = [...my.items, ...myNext.items].find((item) => item.mailId === reportMail.mailId);
    assert.equal(mine.status, "resolved");
    assert.equal(mine.resolution, undefined);
    assert.equal(typeof mine.resolvedAt, "string");
    const revealed = await call(teacher, "revealRound", { classId, roundId, requestId: requestId() });
    assert.equal(revealed.status, "revealed");
    await adminDb.doc(`classes/${classId}/rounds/${roundId}`).update({ status: "archived" });
  });

  await t.test("class deletion removes originals, per-student receipts and idempotency records", async () => {
    const privatePath = `classes/${classId}/teacherMailSecrets/${reportMail.mailId}`;
    const receiptPath = `classes/${classId}/members/${studentUid}/teacherMailReceipts/${reportMail.mailId}`;
    assert.equal((await adminDb.doc(privatePath).get()).exists, true);
    assert.equal((await adminDb.doc(receiptPath).get()).exists, true);
    const commands = await adminDb.collection(`classes/${classId}/teacherMailCommands`).get();
    assert.ok(commands.size > 0);
    const result = await call(teacher, "deleteClassData", { classId, requestId: requestId() });
    assert.equal(result.status, "complete");
    assert.equal((await adminDb.doc(privatePath).get()).exists, false);
    assert.equal((await adminDb.doc(receiptPath).get()).exists, false);
    assert.equal((await adminDb.collection(`classes/${classId}/teacherMailCommands`).get()).size, 0);
  });
});
