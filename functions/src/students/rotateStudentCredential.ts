import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  credentialLookupDigest,
  generateStudentCard,
  hashSecret,
} from "../auth/codes.js";
import { cardPrintKey, encryptCardCode } from "../auth/printableCards.js";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import {
  requireDocumentId,
  requireRecord,
  requireRequestId,
} from "../shared/validation.js";

export const rotateStudentCredential = onCall(
  { secrets: [cardPrintKey] },
  async (request): Promise<{ studentUid: string; cardCode: string }> => {
    const teacherUid = await requireVerifiedTeacher(request);
    const input = requireRecord(request.data);
    const classId = requireDocumentId(input.classId, "학급");
    const studentUid = requireDocumentId(input.studentUid, "학생");
    const requestId = requireRequestId(input.requestId);
    const fingerprint = inputFingerprint({ classId, studentUid });
    const classRef = db.doc(`classes/${classId}`);
    const memberRef = classRef.collection("members").doc(studentUid);
    const credentialRef = db.doc(`studentCredentials/${studentUid}`);
    const commandRef = classRef.collection("commands").doc(requestId);

    const [classBefore, existing] = await Promise.all([classRef.get(), commandRef.get()]);
    assertClassTeacher(classBefore.data(), teacherUid);
    if (existing.exists) {
      assertSameCommand(existing.data(), "rotateStudentCredential", teacherUid, fingerprint);
      throw new HttpsError(
        "failed-precondition",
        "이미 재발급된 요청이에요. 새 카드를 다시 재발급해 주세요.",
      );
    }

    const card = generateStudentCard();
    const lookupDigest = credentialLookupDigest(classId, card.loginId);
    const { secretHash, secretSalt } = await hashSecret(card.secret);
    const encryptedCardCode = encryptCardCode(card.cardCode);
    const newLookupRef = db.doc(`studentCredentialLookups/${lookupDigest}`);

    await db.runTransaction(async (transaction) => {
      const [classSnapshot, memberSnapshot, credentialSnapshot, commandSnapshot, newLookup] =
        await Promise.all([
          transaction.get(classRef),
          transaction.get(memberRef),
          transaction.get(credentialRef),
          transaction.get(commandRef),
          transaction.get(newLookupRef),
        ]);
      assertClassTeacher(classSnapshot.data(), teacherUid);
      if (commandSnapshot.exists) {
        assertSameCommand(commandSnapshot.data(), "rotateStudentCredential", teacherUid, fingerprint);
        throw new HttpsError("failed-precondition", "이미 재발급된 요청이에요. 새 카드를 다시 재발급해 주세요.");
      }
      if (!memberSnapshot.exists || !credentialSnapshot.exists) {
        throw new HttpsError("not-found", "학생 계정을 찾지 못했어요.");
      }
      if (newLookup.exists) {
        throw new HttpsError("aborted", "로그인 카드가 겹쳤어요. 다시 시도해 주세요.");
      }

      const oldLookupDigest = String(credentialSnapshot.get("lookupDigest"));
      const nextSessionVersion = Number(memberSnapshot.get("sessionVersion")) + 1;
      transaction.delete(db.doc(`studentCredentialLookups/${oldLookupDigest}`));
      transaction.create(newLookupRef, {
        classId,
        studentUid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(credentialRef, {
        lookupDigest,
        secretHash,
        secretSalt,
        encryptedCardCode,
        codeVersion: Number(credentialSnapshot.get("codeVersion") ?? 1) + 1,
        failedAttempts: 0,
        lockedUntil: null,
        sessionVersion: nextSessionVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(memberRef, {
        sessionVersion: nextSessionVersion,
        printableCardAvailable: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(commandRef, {
        type: "rotateStudentCredential",
        status: "succeeded",
        requestedBy: teacherUid,
        inputFingerprint: fingerprint,
        result: { studentUid },
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(classRef.collection("auditLogs").doc(), {
        action: "student.credential_rotated",
        actorUid: teacherUid,
        studentUid,
        requestId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { studentUid, cardCode: card.cardCode };
  },
);
