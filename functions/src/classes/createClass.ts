import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { generateClassCode } from "../auth/codes.js";
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
    const fingerprint = inputFingerprint({ name, schoolYear, gradeBand });

    const commandRef = db.doc(`teacherCommands/${teacherUid}_${requestId}`);
    const existingCommand = await commandRef.get();
    if (existingCommand.exists) {
      assertSameCommand(existingCommand.data(), "createClass", teacherUid, fingerprint);
      const result = existingCommand.get("result") as CreateClassResult | undefined;
      if (result) return result;
      throw new HttpsError("aborted", "처리 중인 요청이에요. 잠시 후 다시 시도해 주세요.");
    }

    const classRef = db.collection("classes").doc();
    const classCode = generateClassCode();
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
  const fingerprint = inputFingerprint({ classId, name, schoolYear, gradeBand });
  const classRef = db.doc(`classes/${classId}`);
  const commandRef = classRef.collection("commands").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const [classSnapshot, command] = await Promise.all([
      transaction.get(classRef),
      transaction.get(commandRef),
    ]);
    assertClassTeacher(classSnapshot.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "updateClassInfo", teacherUid, fingerprint);
      return command.get("result") as { classId: string; name: string; schoolYear: number; gradeBand: string };
    }
    transaction.update(classRef, {
      name,
      schoolYear,
      gradeBand,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = { classId, name, schoolYear, gradeBand };
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
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
});
