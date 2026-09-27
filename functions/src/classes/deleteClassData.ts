import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { auth, db } from "../shared/firebase.js";
import { requireVerifiedTeacher } from "../shared/authorization.js";
import { requireDocumentId, requireRecord, requireRequestId } from "../shared/validation.js";

type DeletionJob = { ownerUid: string; studentUids: string[]; lookupDigests: string[];
  classCodes: string[]; status: "deleting" | "complete" };

export const deleteClassData = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const requestId = requireRequestId(input.requestId);
  const classRef = db.doc(`classes/${classId}`);
  const jobRef = db.doc(`deletionJobs/${classId}`);
  const jobBefore = await jobRef.get();
  if (!jobBefore.exists) {
    const [classDoc, members, rounds, codes] = await Promise.all([
      classRef.get(), classRef.collection("members").get(), classRef.collection("rounds").get(),
      db.collection("classCodes").where("classId", "==", classId).get(),
    ]);
    if (!classDoc.exists || classDoc.get("ownerUid") !== teacherUid || classDoc.get("status") !== "active") {
      throw new HttpsError("permission-denied", "이 학급의 삭제 권한이 없어요.");
    }
    if (classDoc.get("activeRoundId") !== null
      || rounds.docs.some((doc) => !["archived", "cancelled"].includes(doc.get("status")))) {
      throw new HttpsError("failed-precondition", "모든 회차를 보관하거나 취소한 뒤 삭제할 수 있어요.");
    }
    const credentials = await Promise.all(members.docs.map((doc) => db.doc(`studentCredentials/${doc.id}`).get()));
    const job: DeletionJob = { ownerUid: teacherUid, studentUids: members.docs.map((doc) => doc.id),
      lookupDigests: credentials.filter((doc) => doc.exists).map((doc) => doc.get("lookupDigest") as string),
      classCodes: codes.docs.map((doc) => doc.id), status: "deleting" };
    await db.runTransaction(async (tx) => {
      const [currentClass, currentJob, currentRounds] = await Promise.all([
        tx.get(classRef), tx.get(jobRef), tx.get(classRef.collection("rounds")),
      ]);
      if (currentJob.exists) return;
      if (currentClass.get("ownerUid") !== teacherUid || currentClass.get("status") !== "active"
        || currentClass.get("activeRoundId") !== null
        || currentClass.get("memberCount") !== members.size
        || currentRounds.docs.some((doc) => !["archived", "cancelled"].includes(doc.get("status")))) {
        throw new HttpsError("failed-precondition", "학급 상태가 변경됐어요.");
      }
      tx.create(jobRef, { ...job, requestId, createdAt: FieldValue.serverTimestamp() });
      tx.update(classRef, { status: "deleting", updatedAt: FieldValue.serverTimestamp() });
    });
  }
  const jobDoc = await jobRef.get();
  const job = jobDoc.data() as DeletionJob;
  if (job.ownerUid !== teacherUid) throw new HttpsError("permission-denied", "삭제 작업 권한이 없어요.");
  if (job.status === "complete") return { classId, status: "complete" };

  // The job record survives interrupted runs. Every cleanup step is safe to retry.
  for (const uid of job.studentUids) {
    await auth.deleteUser(uid).catch((error: { code?: string }) => {
      if (error.code !== "auth/user-not-found") throw error;
    });
  }
  const externalRefs = [
    ...job.studentUids.map((uid) => db.doc(`studentCredentials/${uid}`)),
    ...job.lookupDigests.map((digest) => db.doc(`studentCredentialLookups/${digest}`)),
    ...job.classCodes.map((code) => db.doc(`classCodes/${code}`)),
  ];
  for (let offset = 0; offset < externalRefs.length; offset += 400) {
    const batch = db.batch();
    for (const ref of externalRefs.slice(offset, offset + 400)) batch.delete(ref);
    await batch.commit();
  }
  await db.recursiveDelete(classRef);
  await jobRef.update({ studentUids: [], lookupDigests: [], classCodes: [], status: "complete",
    completedAt: FieldValue.serverTimestamp() });
  await db.collection("operatorAuditLogs").add({ action: "class.deleted", actorUid: teacherUid,
    classId, createdAt: FieldValue.serverTimestamp() });
  return { classId, status: "complete" };
});
