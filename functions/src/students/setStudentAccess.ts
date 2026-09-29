import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { requireDocumentId, requireRecord, requireRequestId, requireText } from "../shared/validation.js";

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

export const updateStudentName = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const studentUid = requireDocumentId(input.studentUid, "학생");
  const displayName = requireText(input.displayName, "학생 이름", 20);
  const requestId = requireRequestId(input.requestId);
  const fingerprint = inputFingerprint({ classId, studentUid, displayName });
  const classRef = db.doc(`classes/${classId}`);
  const memberRef = classRef.collection("members").doc(studentUid);
  const commandRef = classRef.collection("commands").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [classSnapshot, member, command] = await Promise.all([
      transaction.get(classRef), transaction.get(memberRef), transaction.get(commandRef),
    ]);
    assertClassTeacher(classSnapshot.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "updateStudentName", teacherUid, fingerprint);
      return command.get("result") as { studentUid: string; displayName: string };
    }
    if (!member.exists) {
      throw new HttpsError("not-found", "학생 정보를 찾지 못했어요.");
    }
    transaction.update(memberRef, {
      displayName,
      displayNameSortKey: displayName.toLocaleLowerCase("ko-KR"),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = { studentUid, displayName };
    transaction.create(commandRef, {
      type: "updateStudentName", status: "succeeded", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(classRef.collection("auditLogs").doc(), {
      action: "student.name_updated", actorUid: teacherUid, studentUid,
      requestId, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});

export const removeStudentMember = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const studentUid = requireDocumentId(input.studentUid, "학생");
  const requestId = requireRequestId(input.requestId);
  const fingerprint = inputFingerprint({ classId, studentUid, action: "remove" });
  const classRef = db.doc(`classes/${classId}`);
  const memberRef = classRef.collection("members").doc(studentUid);
  const credentialRef = db.doc(`studentCredentials/${studentUid}`);
  const commandRef = classRef.collection("commands").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [classSnapshot, member, credential, command, roundsSnap, settingsSnap] = await Promise.all([
      transaction.get(classRef), transaction.get(memberRef),
      transaction.get(credentialRef), transaction.get(commandRef),
      transaction.get(classRef.collection("rounds")),
      transaction.get(classRef.collection("roundSettings")),
    ]);
    assertClassTeacher(classSnapshot.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "removeStudentMember", teacherUid, fingerprint);
      return command.get("result") as { studentUid: string; status: string };
    }
    if (!member.exists) {
      throw new HttpsError("not-found", "학생 계정을 찾지 못했어요.");
    }
    const activeRoundId = classSnapshot.get("activeRoundId") as string | null;
    if (activeRoundId) {
      const participantDoc = await transaction.get(
        classRef.collection("rounds").doc(activeRoundId).collection("participants").doc(studentUid),
      );
      if (participantDoc.exists && participantDoc.get("participationStatus") === "active") {
        throw new HttpsError(
          "failed-precondition",
          "진행 중인 시즌에 참여하고 있는 학생은 먼저 시즌을 중지하거나 상태 확인에서 학생 참여를 중단한 뒤 삭제할 수 있어요.",
        );
      }
    }
    const roundsMap = new Map(roundsSnap.docs.map((doc) => [doc.id, doc]));
    for (const settingsDoc of settingsSnap.docs) {
      const roundDoc = roundsMap.get(settingsDoc.id);
      if (!roundDoc || !["draft", "ready"].includes(String(roundDoc.get("status") ?? ""))) continue;
      const participantIds = (settingsDoc.get("participantIds") as string[] | undefined) ?? [];
      const excludedPairs = (settingsDoc.get("excludedPairs") as Array<{ a: string; b: string }> | undefined) ?? [];
      if (participantIds.includes(studentUid) || excludedPairs.some((p) => p.a === studentUid || p.b === studentUid)) {
        const nextParticipants = participantIds.filter((id) => id !== studentUid);
        const nextExcluded = excludedPairs.filter((p) => p.a !== studentUid && p.b !== studentUid);
        const nextVersion = Number(settingsDoc.get("rosterVersion") ?? 1) + 1;
        transaction.update(settingsDoc.ref, {
          participantIds: nextParticipants,
          excludedPairs: nextExcluded,
          rosterVersion: nextVersion,
        });
        transaction.update(roundDoc.ref, {
          status: "draft",
          participantCount: nextParticipants.length,
          rosterVersion: nextVersion,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    const lookupDigest = credential.exists ? (credential.get("lookupDigest") as string | undefined) : undefined;
    if (lookupDigest) {
      transaction.delete(db.doc(`studentCredentialLookups/${lookupDigest}`));
    }
    if (credential.exists) {
      transaction.delete(credentialRef);
    }
    transaction.delete(memberRef);
    const currentCount = Number(classSnapshot.get("memberCount") ?? 1);
    transaction.update(classRef, {
      memberCount: Math.max(0, currentCount - 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = { studentUid, status: "removed" };
    transaction.create(commandRef, {
      type: "removeStudentMember", status: "succeeded", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(classRef.collection("auditLogs").doc(), {
      action: "student.removed", actorUid: teacherUid, studentUid,
      requestId, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});
