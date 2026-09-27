import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { requireDocumentId, requireRecord, requireRequestId } from "../shared/validation.js";

export const setStudentAccess = onCall( async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const studentUid = requireDocumentId(input.studentUid, "학생");
  const requestId = requireRequestId(input.requestId);
  if (input.status !== "active" && input.status !== "blocked") {
    throw new HttpsError("invalid-argument", "학생 입장 상태가 올바르지 않아요.");
  }
  const status = input.status;
  const fingerprint = inputFingerprint({ classId, studentUid, status });
  const classRef = db.doc(`classes/${classId}`);
  const memberRef = classRef.collection("members").doc(studentUid);
  const credentialRef = db.doc(`studentCredentials/${studentUid}`);
  const commandRef = classRef.collection("commands").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [classSnapshot, member, credential, command] = await Promise.all([
      transaction.get(classRef), transaction.get(memberRef),
      transaction.get(credentialRef), transaction.get(commandRef),
    ]);
    assertClassTeacher(classSnapshot.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "setStudentAccess", teacherUid, fingerprint);
      return command.get("result") as { studentUid: string; status: string };
    }
    if (!member.exists || !credential.exists || credential.get("classId") !== classId) {
      throw new HttpsError("not-found", "학생 계정을 찾지 못했어요.");
    }
    if (member.get("accessStatus") !== "active" && member.get("accessStatus") !== "blocked") {
      throw new HttpsError("failed-precondition", "이 학생의 입장 상태를 바꿀 수 없어요.");
    }
    if (member.get("accessStatus") !== status) {
      const nextVersion = Number(member.get("sessionVersion")) + 1;
      transaction.update(memberRef, {
        accessStatus: status, sessionVersion: nextVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(credentialRef, {
        sessionVersion: nextVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const result = { studentUid, status };
    transaction.create(commandRef, {
      type: "setStudentAccess", status: "succeeded", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(classRef.collection("auditLogs").doc(), {
      action: status === "blocked" ? "student.access_blocked" : "student.access_enabled",
      actorUid: teacherUid, studentUid, requestId, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});
