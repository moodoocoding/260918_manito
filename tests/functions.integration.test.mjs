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
let teacherApp;
let studentApp;
let teacherAuth;
let studentAuth;
let teacherFunctions;
let studentFunctions;
let adminAuth;
let adminDb;

before(async () => {
  if (getAdminApps().length === 0) {
    initializeAdminApp({ projectId });
  }
  adminAuth = getAdminAuth();
  adminDb = getAdminFirestore();

  const teacherUid = "teacher-integration";
  await adminAuth.createUser({ uid: teacherUid, email: "teacher@example.test" }).catch((error) => {
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

  teacherApp = initializeApp({ projectId, apiKey: "demo-key" }, "teacher-test");
  studentApp = initializeApp({ projectId, apiKey: "demo-key" }, "student-test");
  teacherAuth = getAuth(teacherApp);
  studentAuth = getAuth(studentApp);
  connectAuthEmulator(teacherAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectAuthEmulator(studentAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  teacherFunctions = getFunctions(teacherApp, region);
  studentFunctions = getFunctions(studentApp, region);
  connectFunctionsEmulator(teacherFunctions, "127.0.0.1", 5001);
  connectFunctionsEmulator(studentFunctions, "127.0.0.1", 5001);
  connectFirestoreEmulator(getFirestore(teacherApp), "127.0.0.1", 8080);
  connectFirestoreEmulator(getFirestore(studentApp), "127.0.0.1", 8080);

  const teacherToken = await adminAuth.createCustomToken(teacherUid, {
    role: "teacher",
    teacherVerified: true,
  });
  await signInWithCustomToken(teacherAuth, teacherToken);
});

after(async () => {
  await Promise.allSettled([
    signOut(teacherAuth),
    signOut(studentAuth),
  ]);
  await Promise.all([deleteApp(teacherApp), deleteApp(studentApp)]);
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
  assert.match(classId, /^[A-Za-z0-9_-]{10,}$/);
  assert.match(classCode, /^[A-Z2-9]{8}$/);
  const repeatedClassResponse = await createClass({
    name: "무시되는 다른 이름",
    schoolYear: new Date().getUTCFullYear(),
    gradeBand: "upper",
    requestId: "class_req_001",
  });
  assert.deepEqual(repeatedClassResponse.data, classResponse.data);

  const registerStudents = httpsCallable(teacherFunctions, "registerStudents");
  const registration = await registerStudents({
    classId,
    displayNames: ["가람", "나래"],
    requestId: "students_req_001",
  });
  assert.equal(registration.data.students.length, 2);
  assert.equal(registration.data.requiresCredentialRotation, false);
  const firstStudent = registration.data.students[0];
  assert.match(firstStudent.cardCode, /^[A-Z2-9]{4}-[A-Z2-9]{8}$/);
  const repeatedRegistration = await registerStudents({
    classId,
    displayNames: ["다른 이름"],
    requestId: "students_req_001",
  });
  assert.equal(repeatedRegistration.data.requiresCredentialRotation, true);
  assert.equal(repeatedRegistration.data.students[0].cardCode, "");

  const loginStudent = httpsCallable(studentFunctions, "loginStudent");
  const login = await loginStudent({ classCode, cardCode: firstStudent.cardCode });
  await signInWithCustomToken(studentAuth, login.data.customToken);

  const studentDb = getFirestore(studentApp);
  const ownMember = doc(studentDb, `classes/${classId}/members/${firstStudent.studentUid}`);
  assert.equal((await getDoc(ownMember)).data().displayName, "가람");
  await assert.rejects(
    setDoc(doc(studentDb, `classes/${classId}/members/forbidden-write`), { displayName: "안됨" }),
  );

  const rotate = httpsCallable(teacherFunctions, "rotateStudentCredential");
  const rotated = await rotate({
    classId,
    studentUid: firstStudent.studentUid,
    requestId: "rotate_req_001",
  });
  assert.notEqual(rotated.data.cardCode, firstStudent.cardCode);

  await assert.rejects(getDoc(ownMember));
  await assert.rejects(loginStudent({ classCode, cardCode: firstStudent.cardCode }));
  const newLogin = await loginStudent({ classCode, cardCode: rotated.data.cardCode });
  await signInWithCustomToken(studentAuth, newLogin.data.customToken);
  assert.equal((await getDoc(ownMember)).data().displayName, "가람");
});
