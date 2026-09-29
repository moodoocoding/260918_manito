import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { credentialLookupDigest, generateStudentCard, hashSecret } from "../auth/codes.js";
import { cardPrintKey, decryptCardCode, encryptCardCode } from "../auth/printableCards.js";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { requireDocumentId, requireRecord, requireRequestId } from "../shared/validation.js";

function requestedStudents(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    throw new HttpsError("invalid-argument", "학생을 1~40명 선택해 주세요.");
  }
  const ids = value.map((id) => requireDocumentId(id, "학생"));
  if (new Set(ids).size !== ids.length) {
    throw new HttpsError("invalid-argument", "학생을 한 번씩만 선택해 주세요.");
  }
  return ids;
}

export const getPrintableCards = onCall({ secrets: [cardPrintKey] }, async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const studentUids = requestedStudents(input.studentUids);
  const classRef = db.doc(`classes/${classId}`);
  return db.runTransaction(async (tx) => {
    const [classDoc, ...pairs] = await Promise.all([
      tx.get(classRef),
      ...studentUids.map(async (uid) => Promise.all([
        tx.get(classRef.collection("members").doc(uid)),
        tx.get(db.doc(`studentCredentials/${uid}`)),
      ])),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    const cards: Array<{studentUid: string; displayName: string; cardCode: string}> = [];
    const missingStudentUids: string[] = [];
    for (const [index, pair] of pairs.entries()) {
      const [member, credential] = pair;
      if (!member.exists || !credential.exists || credential.get("classId") !== classId) {
        throw new HttpsError("permission-denied", "이 학급의 학생만 출력할 수 있어요.");
      }
      if (member.get("accessStatus") !== "active") {
        throw new HttpsError("failed-precondition", "입장 가능한 학생만 출력할 수 있어요.");
      }
      if (member.get("sessionVersion") !== credential.get("sessionVersion")) {
        throw new HttpsError("failed-precondition", "카드 상태를 새로고침한 뒤 다시 시도해 주세요.");
      }
      const encrypted = credential.get("encryptedCardCode");
      if (typeof encrypted !== "string") {
        missingStudentUids.push(studentUids[index]);
      } else {
        cards.push({ studentUid: studentUids[index], displayName: String(member.get("displayName")),
          cardCode: decryptCardCode(encrypted) });
      }
    }
    tx.create(classRef.collection("auditLogs").doc(), {
      action: missingStudentUids.length ? "student.cards_print_unavailable" : "student.cards_print_read",
      actorUid: teacherUid, studentUids, studentCount: studentUids.length,
      createdAt: FieldValue.serverTimestamp(),
    });
    return {cards, missingStudentUids};
  });
});

export const reissueMissingCards = onCall(
  { timeoutSeconds: 120, memory: "512MiB", secrets: [cardPrintKey] },
  async (request): Promise<{studentUids: string[]}> => {
    const teacherUid = await requireVerifiedTeacher(request);
    const input = requireRecord(request.data);
    const classId = requireDocumentId(input.classId, "학급");
    const studentUids = requestedStudents(input.studentUids);
    const requestId = requireRequestId(input.requestId);
    const classRef = db.doc(`classes/${classId}`);
    const commandRef = classRef.collection("commands").doc(requestId);
    const fingerprint = inputFingerprint({classId, studentUids});
    const [classBefore, existing] = await Promise.all([classRef.get(), commandRef.get()]);
    assertClassTeacher(classBefore.data(), teacherUid);
    if (existing.exists) {
      assertSameCommand(existing.data(), "reissueMissingCards", teacherUid, fingerprint);
      return {studentUids};
    }

    const usedLoginIds = new Set<string>();
    const plans: Array<{studentUid: string; lookupDigest: string; encryptedCardCode: string;
      secretHash: string; secretSalt: string}> = [];
    for (const studentUid of studentUids) {
      let card = generateStudentCard();
      while (usedLoginIds.has(card.loginId)) card = generateStudentCard();
      usedLoginIds.add(card.loginId);
      const lookupDigest = credentialLookupDigest(classId, card.loginId);
      const hashes = await hashSecret(card.secret);
      plans.push({studentUid, lookupDigest, encryptedCardCode: encryptCardCode(card.cardCode), ...hashes});
    }

    return db.runTransaction(async (tx) => {
      const [classDoc, command, ...rows] = await Promise.all([
        tx.get(classRef), tx.get(commandRef),
        ...plans.map(async (plan) => Promise.all([
          tx.get(classRef.collection("members").doc(plan.studentUid)),
          tx.get(db.doc(`studentCredentials/${plan.studentUid}`)),
          tx.get(db.doc(`studentCredentialLookups/${plan.lookupDigest}`)),
        ])),
      ]);
      assertClassTeacher(classDoc.data(), teacherUid);
      if (command.exists) {
        assertSameCommand(command.data(), "reissueMissingCards", teacherUid, fingerprint);
        return {studentUids};
      }
      for (const [index, row] of rows.entries()) {
        const [member, credential, newLookup] = row;
        if (!member.exists || !credential.exists || credential.get("classId") !== classId
          || member.get("accessStatus") !== "active") {
          throw new HttpsError("permission-denied", "입장 가능한 이 학급 학생만 재발급할 수 있어요.");
        }
        if (typeof credential.get("encryptedCardCode") === "string" || newLookup.exists
          || member.get("sessionVersion") !== credential.get("sessionVersion")) {
          throw new HttpsError("failed-precondition", "카드 상태가 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.");
        }
        const plan = plans[index];
        const nextSessionVersion = Number(member.get("sessionVersion")) + 1;
        tx.delete(db.doc(`studentCredentialLookups/${String(credential.get("lookupDigest"))}`));
        tx.create(db.doc(`studentCredentialLookups/${plan.lookupDigest}`), {
          classId, studentUid: plan.studentUid, createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(credential.ref, {
          lookupDigest: plan.lookupDigest, secretHash: plan.secretHash, secretSalt: plan.secretSalt,
          encryptedCardCode: plan.encryptedCardCode,
          codeVersion: Number(credential.get("codeVersion") ?? 1) + 1,
          failedAttempts: 0, lockedUntil: null, sessionVersion: nextSessionVersion,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(member.ref, {sessionVersion: nextSessionVersion, printableCardAvailable: true,
          updatedAt: FieldValue.serverTimestamp()});
      }
      tx.create(commandRef, {type:"reissueMissingCards", status:"succeeded", requestedBy:teacherUid,
        inputFingerprint:fingerprint, result:{studentUids}, createdAt:FieldValue.serverTimestamp()});
      tx.create(classRef.collection("auditLogs").doc(), {action:"student.cards_reissued_for_print",
        actorUid:teacherUid, studentUids, studentCount:studentUids.length, requestId,
        createdAt:FieldValue.serverTimestamp()});
      return {studentUids};
    });
  },
);

export const reissueStudentCards = onCall(
  { timeoutSeconds: 120, memory: "512MiB", secrets: [cardPrintKey] },
  async (request): Promise<{ reissuedCount: number; cards: Array<{ studentUid: string; displayName: string; cardCode: string }> }> => {
    const teacherUid = await requireVerifiedTeacher(request);
    const input = requireRecord(request.data);
    const classId = requireDocumentId(input.classId, "학급");
    const studentUids = requestedStudents(input.studentUids);
    const requestId = requireRequestId(input.requestId);
    const classRef = db.doc(`classes/${classId}`);
    const commandRef = classRef.collection("commands").doc(requestId);
    const fingerprint = inputFingerprint({ classId, studentUids });
    const [classBefore, existing] = await Promise.all([classRef.get(), commandRef.get()]);
    assertClassTeacher(classBefore.data(), teacherUid);
    if (existing.exists) {
      assertSameCommand(existing.data(), "reissueStudentCards", teacherUid, fingerprint);
      const cached = existing.data()?.result as { reissuedCount: number; cards: Array<{ studentUid: string; displayName: string; cardCode: string }> };
      if (cached) return cached;
    }

    const usedLoginIds = new Set<string>();
    const plans: Array<{
      studentUid: string;
      cardCode: string;
      lookupDigest: string;
      encryptedCardCode: string;
      secretHash: string;
      secretSalt: string;
    }> = [];
    for (const studentUid of studentUids) {
      let card = generateStudentCard();
      while (usedLoginIds.has(card.loginId)) card = generateStudentCard();
      usedLoginIds.add(card.loginId);
      const lookupDigest = credentialLookupDigest(classId, card.loginId);
      const hashes = await hashSecret(card.secret);
      plans.push({
        studentUid,
        cardCode: card.cardCode,
        lookupDigest,
        encryptedCardCode: encryptCardCode(card.cardCode),
        ...hashes,
      });
    }

    return db.runTransaction(async (tx) => {
      const [classDoc, command, ...rows] = await Promise.all([
        tx.get(classRef),
        tx.get(commandRef),
        ...plans.map(async (plan) => Promise.all([
          tx.get(classRef.collection("members").doc(plan.studentUid)),
          tx.get(db.doc(`studentCredentials/${plan.studentUid}`)),
          tx.get(db.doc(`studentCredentialLookups/${plan.lookupDigest}`)),
        ])),
      ]);
      assertClassTeacher(classDoc.data(), teacherUid);
      if (command.exists) {
        assertSameCommand(command.data(), "reissueStudentCards", teacherUid, fingerprint);
        const cached = command.data()?.result as { reissuedCount: number; cards: Array<{ studentUid: string; displayName: string; cardCode: string }> };
        if (cached) return cached;
      }
      const cards: Array<{ studentUid: string; displayName: string; cardCode: string }> = [];
      for (const [index, row] of rows.entries()) {
        const [member, credential, newLookup] = row;
        if (!member.exists || !credential.exists || credential.get("classId") !== classId
          || member.get("accessStatus") !== "active") {
          throw new HttpsError("permission-denied", "입장 가능한 이 학급 학생만 재발급할 수 있어요.");
        }
        if (newLookup.exists) {
          throw new HttpsError("aborted", "새 카드 코드가 겹쳤어요. 다시 시도해 주세요.");
        }
        const plan = plans[index];
        const oldLookupDigest = credential.get("lookupDigest");
        if (typeof oldLookupDigest === "string" && oldLookupDigest) {
          tx.delete(db.doc(`studentCredentialLookups/${oldLookupDigest}`));
        }
        const nextSessionVersion = Number(member.get("sessionVersion") ?? 0) + 1;
        tx.create(db.doc(`studentCredentialLookups/${plan.lookupDigest}`), {
          classId,
          studentUid: plan.studentUid,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(credential.ref, {
          lookupDigest: plan.lookupDigest,
          secretHash: plan.secretHash,
          secretSalt: plan.secretSalt,
          encryptedCardCode: plan.encryptedCardCode,
          codeVersion: Number(credential.get("codeVersion") ?? 1) + 1,
          failedAttempts: 0,
          lockedUntil: null,
          sessionVersion: nextSessionVersion,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(member.ref, {
          sessionVersion: nextSessionVersion,
          printableCardAvailable: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
        cards.push({
          studentUid: plan.studentUid,
          displayName: String(member.get("displayName")),
          cardCode: plan.cardCode,
        });
      }
      const result = { reissuedCount: cards.length, cards };
      tx.create(commandRef, {
        type: "reissueStudentCards",
        status: "succeeded",
        requestedBy: teacherUid,
        inputFingerprint: fingerprint,
        result,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(classRef.collection("auditLogs").doc(), {
        action: "student.cards_batch_reissued",
        actorUid: teacherUid,
        studentUids,
        studentCount: studentUids.length,
        requestId,
        createdAt: FieldValue.serverTimestamp(),
      });
      return result;
    });
  },
);
