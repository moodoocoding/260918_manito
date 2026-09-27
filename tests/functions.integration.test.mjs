import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const projectId = "demo-manitto";
const region = "asia-northeast3";
const teacherUid = `teacher-integration-${crypto.randomUUID().slice(0, 8)}`;
const otherTeacherUid = `teacher-other-${crypto.randomUUID().slice(0, 8)}`;
let teacherApp;
let studentApp;
let otherTeacherApp;
let teacherAuth;
let studentAuth;
let otherTeacherAuth;
let teacherFunctions;
let studentFunctions;
let otherTeacherFunctions;
let adminAuth;
let adminDb;

before(async () => {
  if (getAdminApps().length === 0) {
    initializeAdminApp({ projectId });
  }
  adminAuth = getAdminAuth();
  adminDb = getAdminFirestore();

  await adminAuth.createUser({ uid: teacherUid, email: `${teacherUid}@example.test` }).catch((error) => {
    if (error.code !== "auth/uid-already-exists") throw error;
  });
  await adminAuth.setCustomUserClaims(teacherUid, {
    role: "teacher",
    teacherVerified: true,
  });
  await adminDb.doc(`teachers/${teacherUid}`).set({
    displayName: "테스트 선생님",
    verificationStatus: "verified",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await adminAuth.createUser({ uid: otherTeacherUid, email: `${otherTeacherUid}@example.test` }).catch((error) => {
    if (error.code !== "auth/uid-already-exists") throw error;
  });
  await adminAuth.setCustomUserClaims(otherTeacherUid, { role: "teacher", teacherVerified: true });
  await adminDb.doc(`teachers/${otherTeacherUid}`).set({ verificationStatus: "verified" });

  teacherApp = initializeApp({ projectId, apiKey: "demo-key" }, "teacher-test");
  studentApp = initializeApp({ projectId, apiKey: "demo-key" }, "student-test");
  otherTeacherApp = initializeApp({ projectId, apiKey: "demo-key" }, "other-teacher-test");
  teacherAuth = getAuth(teacherApp);
  studentAuth = getAuth(studentApp);
  otherTeacherAuth = getAuth(otherTeacherApp);
  connectAuthEmulator(teacherAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectAuthEmulator(studentAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectAuthEmulator(otherTeacherAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  teacherFunctions = getFunctions(teacherApp, region);
  studentFunctions = getFunctions(studentApp, region);
  otherTeacherFunctions = getFunctions(otherTeacherApp, region);
  connectFunctionsEmulator(teacherFunctions, "127.0.0.1", 5001);
  connectFunctionsEmulator(studentFunctions, "127.0.0.1", 5001);
  connectFunctionsEmulator(otherTeacherFunctions, "127.0.0.1", 5001);
  connectFirestoreEmulator(getFirestore(teacherApp), "127.0.0.1", 8080);
  connectFirestoreEmulator(getFirestore(studentApp), "127.0.0.1", 8080);

  const teacherToken = await adminAuth.createCustomToken(teacherUid, {
    role: "teacher",
    teacherVerified: true,
  });
  await signInWithCustomToken(teacherAuth, teacherToken);
  await signInWithCustomToken(otherTeacherAuth, await adminAuth.createCustomToken(otherTeacherUid, {
    role: "teacher", teacherVerified: true,
  }));
});

after(async () => {
  await Promise.allSettled([
    signOut(teacherAuth),
    signOut(studentAuth),
    signOut(otherTeacherAuth),
  ]);
  await Promise.all([deleteApp(teacherApp), deleteApp(studentApp), deleteApp(otherTeacherApp)]);
});

test("teacher creates a class, registers students, and rotates a student card", async () => {
  const createClass = httpsCallable(teacherFunctions, "createClass");
  const classResponse = await createClass({
    name: "별빛반",
    schoolYear: new Date().getUTCFullYear(),
    gradeBand: "middle",
    requestId: "class_req_001",
  });
  const { classId, classCode } = classResponse.data;
  const classInfo = await httpsCallable(teacherFunctions, "getClassAccessInfo")({ classId });
  assert.equal(classInfo.data.classCode, classCode);
  assert.equal((await httpsCallable(teacherFunctions, "listClasses")()).data.classes.length, 1);
  assert.match(classId, /^[A-Za-z0-9_-]{10,}$/);
  assert.match(classCode, /^[A-Z2-9]{8}$/);
  const repeatedClassResponse = await createClass({
    name: "별빛반",
    schoolYear: new Date().getUTCFullYear(),
    gradeBand: "middle",
    requestId: "class_req_001",
  });
  assert.deepEqual(repeatedClassResponse.data, classResponse.data);
  await assert.rejects(createClass({
    name: "다른 이름", schoolYear: new Date().getUTCFullYear(),
    gradeBand: "middle", requestId: "class_req_001",
  }), { code: "functions/already-exists" });

  const registerStudents = httpsCallable(teacherFunctions, "registerStudents");
  const registration = await registerStudents({
    classId,
    displayNames: ["가람", "나래"],
    requestId: "students_req_001",
  });
  assert.equal(registration.data.students.length, 2);
  await assert.rejects(httpsCallable(otherTeacherFunctions, "registerStudents")({
    classId, displayNames: ["가람", "나래"], requestId: "students_req_001",
  }), { code: "functions/permission-denied" });
  assert.equal(registration.data.requiresCredentialRotation, false);
  const firstStudent = registration.data.students[0];
  assert.match(firstStudent.cardCode, /^[A-Z2-9]{4}-[A-Z2-9]{8}$/);
  const repeatedRegistration = await registerStudents({
    classId,
    displayNames: ["가람", "나래"],
    requestId: "students_req_001",
  });
  assert.equal(repeatedRegistration.data.requiresCredentialRotation, true);
  assert.equal(repeatedRegistration.data.students[0].cardCode, "");
  await assert.rejects(registerStudents({
    classId, displayNames: ["다른 이름"], requestId: "students_req_001",
  }), { code: "functions/already-exists" });

  const loginStudent = httpsCallable(studentFunctions, "loginStudent");
  const login = await loginStudent({ classCode, cardCode: firstStudent.cardCode });
  await signInWithCustomToken(studentAuth, login.data.customToken);
  const getStudentHome = httpsCallable(studentFunctions, "getStudentHome");
  assert.deepEqual((await getStudentHome()).data, {
    displayName: "가람", className: "별빛반", round: null,
  });

  const studentDb = getFirestore(studentApp);
  const ownMember = doc(studentDb, `classes/${classId}/members/${firstStudent.studentUid}`);
  assert.equal((await getDoc(ownMember)).data().displayName, "가람");
  await assert.rejects(
    setDoc(doc(studentDb, `classes/${classId}/members/forbidden-write`), { displayName: "안됨" }),
  );

  const rotate = httpsCallable(teacherFunctions, "rotateStudentCredential");
  const [racingLogin, racingRotation] = await Promise.allSettled([
    loginStudent({ classCode, cardCode: firstStudent.cardCode }),
    rotate({ classId, studentUid: firstStudent.studentUid, requestId: "rotate_req_001" }),
  ]);
  assert.equal(racingRotation.status, "fulfilled");
  const rotated = racingRotation.value;
  if (racingLogin.status === "fulfilled") {
    const payload = JSON.parse(Buffer.from(racingLogin.value.data.customToken.split(".")[1], "base64url").toString("utf8"));
    assert.equal(payload.claims.sessionVersion, 1, "old card must never receive the rotated version");
  }
  assert.notEqual(rotated.data.cardCode, firstStudent.cardCode);

  await assert.rejects(getDoc(ownMember));
  await assert.rejects(getStudentHome(), { code: "functions/permission-denied" });
  await assert.rejects(loginStudent({ classCode, cardCode: firstStudent.cardCode }));
  const newLogin = await loginStudent({ classCode, cardCode: rotated.data.cardCode });
  await signInWithCustomToken(studentAuth, newLogin.data.customToken);
  assert.equal((await getDoc(ownMember)).data().displayName, "가람");
  assert.equal((await getStudentHome()).data.displayName, "가람");

  const setStudentAccess = httpsCallable(teacherFunctions, "setStudentAccess");
  await assert.rejects(setStudentAccess({ classId, studentUid: firstStudent.studentUid,
    status: "blocked", requestId: "students_req_001" }), { code: "functions/already-exists" });
  const blocked = await setStudentAccess({ classId, studentUid: firstStudent.studentUid,
    status: "blocked", requestId: "block_req_001" });
  assert.equal(blocked.data.status, "blocked");
  await assert.rejects(getStudentHome(), { code: "functions/permission-denied" });
  await assert.rejects(loginStudent({ classCode, cardCode: rotated.data.cardCode }));
  const unblocked = await setStudentAccess({ classId, studentUid: firstStudent.studentUid,
    status: "active", requestId: "unblock_req_001" });
  assert.equal(unblocked.data.status, "active");
  await assert.rejects(getStudentHome(), { code: "functions/permission-denied" });
  const resumed = await loginStudent({ classCode, cardCode: rotated.data.cardCode });
  await signInWithCustomToken(studentAuth, resumed.data.customToken);
  assert.equal((await getStudentHome()).data.displayName, "가람");

  await adminDb.doc(`teachers/${teacherUid}`).update({ verificationStatus: "suspended" });
  assert.equal((await httpsCallable(teacherFunctions, "getTeacherStatus")()).data.status, "suspended");
  await assert.rejects(httpsCallable(teacherFunctions, "listClasses")(), {
    code: "functions/permission-denied",
  });
});
