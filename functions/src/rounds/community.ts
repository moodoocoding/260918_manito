import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { requireStudentRound } from "../shared/student.js";
import { requireDocumentId, requireRecord, requireRequestId } from "../shared/validation.js";
import { requireTeacherRound } from "./common.js";

const examples = [
  "친구의 말을 끝까지 들어 보세요.",
  "함께 쓰는 자리를 사용한 뒤 정리해 보세요.",
];

function validateNotice(value: unknown): string {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", "안내 문구를 입력해 주세요.");
  const text = value.trim();
  if (!text || [...text].length > 140 || /[<>]|https?:\/\/|www\./i.test(text)) {
    throw new HttpsError("invalid-argument", "안내는 링크·HTML 없이 140자 이내 평문으로 적어 주세요.");
  }
  return text;
}

export const getStudentCommunity = onCall(async (request) => {
  const input = request.data === null || request.data === undefined ? {} : requireRecord(request.data);
  const roundId = typeof input.roundId === "string" ? requireDocumentId(input.roundId, "시즌") : undefined;
  const student = await requireStudentRound(request, roundId);
  const doc = await student.classRef.collection("roundCommunity").doc(student.roundId).get();
  return {roundId: student.roundId, state: "contentOnly", examples,
    teacherNotice: doc.get("postedText") ?? null,
    postedAt: doc.get("postedAt")?.toDate()?.toISOString() ?? null};
});

export const getTeacherCommunity = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "시즌");
  const {classRef} = await requireTeacherRound(teacherUid, classId, roundId);
  const doc = await classRef.collection("roundCommunity").doc(roundId).get();
  return {roundId, draftText: doc.get("draftText") ?? "", postedText: doc.get("postedText") ?? null,
    postedAt: doc.get("postedAt")?.toDate()?.toISOString() ?? null};
});

export const updateRoundCommunity = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "시즌");
  const requestId = requireRequestId(input.requestId);
  const action = input.action;
  if (action !== "save" && action !== "publish" && action !== "unpublish") {
    throw new HttpsError("invalid-argument", "안내 동작을 확인해 주세요.");
  }
  const text = action === "save" ? validateNotice(input.text) : null;
  const {classRef, roundRef} = await requireTeacherRound(teacherUid, classId, roundId);
  const communityRef = classRef.collection("roundCommunity").doc(roundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({classId, roundId, action, text});
  return db.runTransaction(async (tx) => {
    const [classDoc, roundDoc, community, command] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(communityRef), tx.get(commandRef),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "updateRoundCommunity", teacherUid, fingerprint);
      return command.get("result") as {roundId: string; action: string};
    }
    if (!roundDoc.exists || ["cancelled", "archived"].includes(roundDoc.get("status"))) {
      throw new HttpsError("failed-precondition", "이 시즌의 안내는 변경할 수 없어요.");
    }
    if (action === "publish" && !community.get("draftText")) {
      throw new HttpsError("failed-precondition", "안내 초안을 먼저 저장해 주세요.");
    }
    const result = {roundId, action};
    const version = Number(community.get("version") ?? 0) + 1;
    const update = {version, updatedBy: teacherUid, updatedAt: FieldValue.serverTimestamp(),
      ...(action === "save" ? {draftText: text} : {}),
      ...(action === "publish" ? {postedText: community.get("draftText"), postedAt: FieldValue.serverTimestamp()} : {}),
      ...(action === "unpublish" ? {postedText: null, postedAt: null} : {})};
    tx.set(communityRef, update, {merge:true});
    tx.create(commandRef, {type:"updateRoundCommunity", requestedBy:teacherUid,
      inputFingerprint:fingerprint, result, createdAt:FieldValue.serverTimestamp()});
    tx.create(classRef.collection("auditLogs").doc(), {action:`community.${action}`, actorUid:teacherUid,
      roundId, requestId, version, createdAt:FieldValue.serverTimestamp()});
    return result;
  });
});
