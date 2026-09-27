import { initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

if (process.env.GCLOUD_PROJECT !== "demo-manitto" ||
  !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("This fixture runs only with demo-manitto emulators.");
}
initializeAdminApp({ projectId: "demo-manitto" });
const adminAuth = getAdminAuth();
const db = getFirestore();
const teacherUid = `demo-teacher-${Date.now()}`;
await adminAuth.createUser({ uid: teacherUid, email: `${teacherUid}@example.test` });
await adminAuth.setCustomUserClaims(teacherUid, { role: "teacher", teacherVerified: true });
await db.doc(`teachers/${teacherUid}`).set({
  displayName: "가상 선생님", verificationStatus: "verified",
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
});
const app = initializeApp({ projectId: "demo-manitto", apiKey: "demo-key" });
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const functions = getFunctions(app, "asia-northeast3");
connectFunctionsEmulator(functions, "127.0.0.1", 5001);
await signInWithCustomToken(auth, await adminAuth.createCustomToken(teacherUid, {
  role: "teacher", teacherVerified: true,
}));
const classroom = (await httpsCallable(functions, "createClass")({
  name: "가상 별빛반", schoolYear: new Date().getFullYear(), gradeBand: "middle",
  requestId: `fixture_${Date.now()}`,
})).data;
const registration = (await httpsCallable(functions, "registerStudents")({
  classId: classroom.classId, displayNames: ["가람", "나래", "다온", "라온"],
  requestId: `fixture_students_${Date.now()}`,
})).data;
console.log(JSON.stringify({ classCode: classroom.classCode, studentCard: registration.students[0].cardCode }));
await deleteApp(app);
