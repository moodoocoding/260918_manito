import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { generateClassCode, isValidClassCode, normalizeCode } from "../auth/codes.js";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import {
  requireDocumentId,
  requireGradeBand,
  requireRecord,
  requireRequestId,
  requireSchoolYear,
  requireText,
} from "../shared/validation.js";

interface CreateClassResult {
  classId: string;
  classCode: string;
}

export const createClass = onCall(
  async (request): Promise<CreateClassResult> => {
    const teacherUid = await requireVerifiedTeacher(request);
    const input = requireRecord(request.data);
    const name = requireText(input.name, "학급 이름", 40);
    const schoolYear = requireSchoolYear(input.schoolYear);
    const gradeBand = requireGradeBand(input.gradeBand);
    const requestId = requireRequestId(input.requestId);

    const isCustom = typeof input.classCode === "string" && input.classCode.trim().length > 0;
    const requestedCode = isCustom ? normalizeCode(input.classCode as string) : "";
    if (isCustom && !isValidClassCode(requestedCode)) {
      throw new HttpsError("invalid-argument", "학급 코드는 4~12자의 영문 대소문자 또는 숫자여야 해요.");
    }
    const classCode = isCustom ? requestedCode : generateClassCode();
    const fingerprint = inputFingerprint({ name, schoolYear, gradeBand, classCode });

    const commandRef = db.doc(`teacherCommands/${teacherUid}_${requestId}`);
    const existingCommand = await commandRef.get();
    if (existingCommand.exists) {
      assertSameCommand(existingCommand.data(), "createClass", teacherUid, fingerprint);
      const result = existingCommand.get("result") as CreateClassResult | undefined;
      if (result) return result;
      throw new HttpsError("aborted", "처리 중인 요청이에요. 잠시 후 다시 시도해 주세요.");
    }

    const classRef = db.collection("classes").doc();
    const classCodeRef = db.doc(`classCodes/${classCode}`);
    const result = { classId: classRef.id, classCode };

    await db.runTransaction(async (transaction) => {
      const [command, classCodeRecord] = await Promise.all([
        transaction.get(commandRef),
        transaction.get(classCodeRef),
      ]);
      if (command.exists) {
        assertSameCommand(command.data(), "createClass", teacherUid, fingerprint);
        return;
      }
      if (classCodeRecord.exists) {
        if (isCustom) {
          throw new HttpsError("already-exists", "이미 다른 학급에서 사용 중인 학급 코드예요. 다른 코드를 입력해 주세요.");
        }
        throw new HttpsError("aborted", "학급 코드를 다시 만들고 있어요. 다시 시도해 주세요.");
      }

      transaction.create(classRef, {
        name,
        schoolYear,
        gradeBand,
        ownerUid: teacherUid,
        teacherUids: [teacherUid],
        status: "active",
        activeRoundId: null,
        memberCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(classCodeRef, {
        classId: classRef.id,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(commandRef, {
        type: "createClass",
        status: "succeeded",
        requestedBy: teacherUid,
        inputFingerprint: fingerprint,
        result,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(classRef.collection("auditLogs").doc(), {
        action: "class.created",
        actorUid: teacherUid,
        requestId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const committed = await commandRef.get();
    const committedResult = committed.get("result") as CreateClassResult | undefined;
    if (!committedResult) {
      throw new HttpsError("internal", "학급 생성 결과를 확인하지 못했어요.");
    }
    return committedResult;
  },
);

export const updateClassInfo = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const name = requireText(input.name, "학급 이름", 40);
  const schoolYear = requireSchoolYear(input.schoolYear);
  const gradeBand = requireGradeBand(input.gradeBand);
  const requestId = requireRequestId(input.requestId);

  const hasCodeInput = typeof input.classCode === "string" && input.classCode.trim().length > 0;
  const newClassCode = hasCodeInput ? normalizeCode(input.classCode as string) : null;
  if (newClassCode !== null && !isValidClassCode(newClassCode)) {
    throw new HttpsError("invalid-argument", "학급 코드는 4~12자의 영문 대소문자 또는 숫자여야 해요.");
  }

  const fingerprint = inputFingerprint({ classId, name, schoolYear, gradeBand, ...(newClassCode ? { newClassCode } : {}) });
  const classRef = db.doc(`classes/${classId}`);
  const commandRef = classRef.collection("commands").doc(requestId);

  // 현재 활성 학급 코드 조회
  const existingCodesSnapshot = await db.collection("classCodes").where("classId", "==", classId).get();
  const currentActiveCodeDoc = existingCodesSnapshot.docs.find((doc) => doc.get("status") === "active");
  const currentActiveCode = currentActiveCodeDoc ? currentActiveCodeDoc.id : "";
  const codeChanged = Boolean(newClassCode && newClassCode !== currentActiveCode);

  const newClassCodeRef = newClassCode ? db.doc(`classCodes/${newClassCode}`) : null;

  return db.runTransaction(async (transaction) => {
    const gets: Array<Promise<any>> = [
      transaction.get(classRef),
      transaction.get(commandRef),
    ];
    if (codeChanged && newClassCodeRef) {
      gets.push(transaction.get(newClassCodeRef));
    }

    const [classSnapshot, command, newCodeRecord] = await Promise.all(gets);
    assertClassTeacher(classSnapshot.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "updateClassInfo", teacherUid, fingerprint);
      return command.get("result") as { classId: string; name: string; schoolYear: number; gradeBand: string; classCode: string };
    }

    if (codeChanged && newCodeRecord?.exists) {
      const existingClassId = newCodeRecord.get("classId");
      if (existingClassId !== classId) {
        throw new HttpsError("already-exists", "이미 다른 학급에서 사용 중인 학급 코드예요. 다른 코드를 입력해 주세요.");
      }
    }

    transaction.update(classRef, {
      name,
      schoolYear,
      gradeBand,
      updatedAt: FieldValue.serverTimestamp(),
    });

    let finalClassCode = currentActiveCode;
    if (codeChanged && newClassCode && newClassCodeRef) {
      // 기존 활성 코드가 있다면 비활성화
      for (const doc of existingCodesSnapshot.docs) {
        if (doc.id !== newClassCode && doc.get("status") === "active") {
          transaction.update(doc.ref, { status: "retired", retiredAt: FieldValue.serverTimestamp() });
        }
      }
      // 새 코드 등록 또는 활성화
      transaction.set(newClassCodeRef, {
        classId,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      finalClassCode = newClassCode;
    }

    const result = { classId, name, schoolYear, gradeBand, classCode: finalClassCode };
    transaction.create(commandRef, {
      type: "updateClassInfo",
      status: "succeeded",
      requestedBy: teacherUid,
      inputFingerprint: fingerprint,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(classRef.collection("auditLogs").doc(), {
      action: "class.updated",
      actorUid: teacherUid,
      requestId,
      ...(codeChanged ? { oldClassCode: currentActiveCode, newClassCode: finalClassCode } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});
