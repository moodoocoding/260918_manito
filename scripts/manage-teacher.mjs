import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const options = Object.fromEntries(process.argv.slice(2).map((part) => {
  const match = /^--([^=]+)=(.+)$/.exec(part);
  if (!match) throw new Error("Use --project=ID --uid=UID --status=verified|suspended --operator=NAME");
  return [match[1], match[2]];
}));
if (!options.project || !options.uid || !options.operator ||
  !["verified", "suspended"].includes(options.status) ||
  !/^[A-Za-z0-9_-]{6,128}$/.test(options.uid)) {
  throw new Error("Use --project=ID --uid=UID --status=verified|suspended --operator=NAME");
}
if (options.project !== "manito-938cc" && options.project !== "demo-manitto") {
  throw new Error("This tool is restricted to the known development and emulator projects.");
}
if (options.project === "demo-manitto" && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Emulator project requires FIREBASE_AUTH_EMULATOR_HOST.");
}

initializeApp({ projectId: options.project, credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();
const user = await auth.getUser(options.uid);
if (user.disabled) throw new Error("Disabled Auth user cannot be approved.");
const ref = db.doc(`teachers/${options.uid}`);
const auditRef = db.collection("operatorAuditLogs").doc();
const claims = user.customClaims ?? {};

if (options.status === "suspended") {
  // Fail closed while Auth claims are being changed.
  await ref.set({ verificationStatus: "suspended", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await auth.setCustomUserClaims(options.uid, { ...claims, role: "teacher", teacherVerified: false });
} else {
  await ref.set({
    displayName: user.displayName ?? "",
    verificationStatus: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await auth.setCustomUserClaims(options.uid, { ...claims, role: "teacher", teacherVerified: true });
  await ref.set({ verificationStatus: "verified", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
await auditRef.set({
  action: options.status === "verified" ? "teacher.verified" : "teacher.suspended",
  actor: options.operator,
  teacherUid: options.uid,
  createdAt: FieldValue.serverTimestamp(),
});
console.log(`Teacher ${options.uid} status: ${options.status} in ${options.project}`);
