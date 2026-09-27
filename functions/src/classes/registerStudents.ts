import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
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
  requireText,
} from "../shared/validation.js";

interface StudentCardResult {
  studentUid: string;
  displayName: string;
  cardCode: string;
}

export const registerStudents = onCall(
  { timeoutSeconds: 60, secrets: [cardPrintKey] },
  async (request): Promise<{ students: StudentCardResult[]; requiresCredentialRotation: boolean }> => {
    const teacherUid = await requireVerifiedTeacher(request);
    const input = requireRecord(request.data);
    const classId = requireDocumentId(input.classId, "학급");
    const requestId = requireRequestId(input.requestId);

    if (!Array.isArray(input.displayNames) || input.displayNames.length < 1 || input.displayNames.length > 40) {
      throw new HttpsError("invalid-argument", "학생은 한 번에 1명 이상 40명 이하로 등록해 주세요.");
    }
    const displayNames = input.displayNames.map((name) => requireText(name, "학생 이름", 20));
    const fingerprint = inputFingerprint({ classId, displayNames });
    const classRef = db.doc(`classes/${classId}`);
    const commandRef = classRef.collection("commands").doc(requestId);
    const [classBefore, existing] = await Promise.all([classRef.get(), commandRef.get()]);
    assertClassTeacher(classBefore.data(), teacherUid);
    if (existing.exists) {
      assertSameCommand(existing.data(), "registerStudents", teacherUid, fingerprint);
      return {
        students: (existing.get("result.students") ?? []).map(
          (student: { studentUid: string; displayName: string }) => ({ ...student, cardCode: "" }),
        ),
        requiresCredentialRotation: true,
      };
    }

    const usedLoginIds = new Set<string>();
    const cards = displayNames.map(() => {
      let card = generateStudentCard();
      while (usedLoginIds.has(card.loginId)) card = generateStudentCard();
      usedLoginIds.add(card.loginId);
      return card;
    });
    const attemptId = randomUUID();
    const plans: Array<{
      studentUid: string;
      displayName: string;
      card: ReturnType<typeof generateStudentCard>;
      lookupDigest: string;
      secretHash: string;
      secretSalt: string;
      encryptedCardCode: string;
    }> = [];
    // scrypt is deliberately memory-hard. Hash sequentially so a 40-student
    // import stays within the function's memory limit.
    for (const [index, displayName] of displayNames.entries()) {
      const studentUid = db.collection("studentIds").doc().id;
      const card = cards[index];
      const lookupDigest = credentialLookupDigest(classId, card.loginId);
      const hashes = await hashSecret(card.secret);
      plans.push({ studentUid, displayName, card, lookupDigest,
        encryptedCardCode: encryptCardCode(card.cardCode), ...hashes });
    }

    await db.runTransaction(async (transaction) => {
      const [classSnapshot, commandSnapshot, ...lookupSnapshots] = await Promise.all([
        transaction.get(classRef),
        transaction.get(commandRef),
        ...plans.map((plan) => transaction.get(db.doc(`studentCredentialLookups/${plan.lookupDigest}`))),
      ]);
      assertClassTeacher(classSnapshot.data(), teacherUid);
      if (commandSnapshot.exists) {
        assertSameCommand(commandSnapshot.data(), "registerStudents", teacherUid, fingerprint);
        return;
      }

      const currentCount = Number(classSnapshot.get("memberCount") ?? 0);
      if (currentCount + plans.length > 40) {
        throw new HttpsError("failed-precondition", "한 학급에는 최대 40명까지 등록할 수 있어요.");
      }
      if (lookupSnapshots.some((snapshot) => snapshot.exists)) {
        throw new HttpsError("aborted", "로그인 카드가 겹쳤어요. 다시 시도해 주세요.");
      }

      for (const plan of plans) {
        transaction.create(classRef.collection("members").doc(plan.studentUid), {
          displayName: plan.displayName,
          displayNameSortKey: plan.displayName.toLocaleLowerCase("ko-KR"),
          accessStatus: "active",
          sessionVersion: 1,
          printableCardAvailable: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(db.doc(`studentCredentials/${plan.studentUid}`), {
          classId,
          studentUid: plan.studentUid,
          lookupDigest: plan.lookupDigest,
          secretHash: plan.secretHash,
          secretSalt: plan.secretSalt,
          encryptedCardCode: plan.encryptedCardCode,
          codeVersion: 1,
          failedAttempts: 0,
          lockedUntil: null,
          sessionVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(db.doc(`studentCredentialLookups/${plan.lookupDigest}`), {
          classId,
          studentUid: plan.studentUid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      const safeStudents = plans.map(({ studentUid, displayName }) => ({ studentUid, displayName }));
      transaction.update(classRef, {
        memberCount: currentCount + plans.length,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(commandRef, {
        type: "registerStudents",
        status: "succeeded",
        requestedBy: teacherUid,
        inputFingerprint: fingerprint,
        result: { students: safeStudents },
        attemptId,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(classRef.collection("auditLogs").doc(), {
        action: "students.registered",
        actorUid: teacherUid,
        studentCount: plans.length,
        requestId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const committedCommand = await commandRef.get();
    if (committedCommand.get("attemptId") !== attemptId) {
      return {
        students: (committedCommand.get("result.students") ?? []).map(
          (student: { studentUid: string; displayName: string }) => ({ ...student, cardCode: "" }),
        ),
        requiresCredentialRotation: true,
      };
    }

    return {
      students: plans.map(({ studentUid, displayName, card }) => ({
        studentUid,
        displayName,
        cardCode: card.cardCode,
      })),
      requiresCredentialRotation: false,
    };
  },
);
