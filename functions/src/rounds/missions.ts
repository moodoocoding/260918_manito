import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertStudentTransaction, requireStudentRound } from "../shared/student.js";
import { requireRecord, requireRequestId } from "../shared/validation.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { koreaDate } from "./common.js";

export const missionCatalog: Record<string, string[]> = {
  lower: [
    "친구에게 반갑게 인사하기", "친구가 말할 때 끝까지 듣기", "친구에게 고마웠던 일을 한 가지 말하기",
    "교실 정리를 함께 돕기", "친구에게 따뜻한 응원 한마디 전하기", "친구가 사용할 자리를 정돈해 주기",
    "친구의 좋은 생각을 칭찬하기", "친구와 놀이 규칙을 차분히 정하기", "친구가 도움이 필요한지 먼저 물어보기",
    "함께 쓴 교실 물건을 제자리에 놓기",
  ],
  middle: [
    "친구의 이야기를 끊지 않고 들어주기", "친구가 잘한 일을 구체적으로 칭찬하기",
    "모둠 활동에서 친구 의견을 한 번 더 물어보기", "교실 정리할 때 친구의 일을 나누어 돕기",
    "친구에게 응원 문장 한 줄 적기", "친구가 참여하기 편한 놀이 방법 제안하기",
    "친구가 어려워하는 활동에서 필요한 도움 묻기", "친구의 발표에서 좋았던 점 전하기",
    "공용 물건을 함께 정리하기", "친구가 고마웠던 순간을 떠올려 말하기",
  ],
  upper: [
    "친구의 의견을 듣고 이해한 내용을 되짚어 말하기", "친구의 노력에서 구체적인 장점 한 가지 전하기",
    "모둠에서 말할 기회가 적은 친구에게 의견 묻기", "친구가 부담스럽지 않은 방식으로 도움 제안하기",
    "친구에게 진심 어린 응원 문장 쓰기", "함께 쓰는 공간을 먼저 정리하고 친구와 나누기",
    "친구의 발표에서 새롭게 배운 점 전하기", "놀이에서 모두가 참여할 수 있는 규칙 제안하기",
    "친구의 고민을 판단하지 않고 들어주기", "친구에게 고마웠던 행동과 그 이유 말하기",
  ],
};

export function missionText(gradeBand: string, missionId: string): string | null {
  const match = /^(lower|middle|upper)-(\d{2})$/.exec(missionId);
  if (!match || match[1] !== gradeBand) return null;
  return missionCatalog[gradeBand]?.[Number(match[2]) - 1] ?? null;
}

function requireMissionId(value: unknown): string {
  if (typeof value !== "string" || !/^(lower|middle|upper)-\d{2}$/.test(value)) {
    throw new HttpsError("invalid-argument", "미션 값이 올바르지 않아요.");
  }
  return value;
}

export const getMissionCatalog = onCall(async (request) => {
  const { requireVerifiedTeacher } = await import("../shared/authorization.js");
  await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  if (input.gradeBand !== "lower" && input.gradeBand !== "middle" && input.gradeBand !== "upper") {
    throw new HttpsError("invalid-argument", "학년군을 선택해 주세요.");
  }
  return { missions: missionCatalog[input.gradeBand].map((text, index) => ({
    missionId: `${input.gradeBand}-${String(index + 1).padStart(2, "0")}`, text,
  })) };
});

export const setMissionStatus = onCall(async (request) => {
  const input = requireRecord(request.data);
  const missionId = requireMissionId(input.missionId);
  if (input.status !== "done" && input.status !== "skipped") {
    throw new HttpsError("invalid-argument", "완료 또는 쉬기를 선택해 주세요.");
  }
  const student = await requireStudentRound(request);
  if (student.roundDoc.get("status") !== "active" || student.roundDoc.get("endsAt").toDate() <= new Date()) {
    throw new HttpsError("failed-precondition", "지금은 미션을 기록할 수 없어요.");
  }
  const missionRef = student.roundRef.collection("studentData").doc(student.uid).collection("missions").doc(missionId);
  return student.classRef.firestore.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId);
    const [round, participant, mission] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)), tx.get(missionRef),
    ]);
    if (round.get("status") !== "active" || round.get("endsAt").toDate() <= new Date()
      || participant.get("participationStatus") !== "active" || !mission.exists) {
      throw new HttpsError("failed-precondition", "이 미션을 변경할 수 없어요.");
    }
    tx.update(missionRef, { status: input.status, updatedAt: FieldValue.serverTimestamp() });
    return { missionId, status: input.status };
  });
});

export const replaceMission = onCall(async (request) => {
  const input = requireRecord(request.data);
  const missionId = requireMissionId(input.missionId);
  const requestId = requireRequestId(input.requestId);
  const student = await requireStudentRound(request);
  const missionRef = student.roundRef.collection("studentData").doc(student.uid).collection("missions").doc(missionId);
  const commandRef = student.roundRef.collection("studentCommands").doc(`${student.uid}_${requestId}`);
  const gradeBand = student.classDoc.get("gradeBand") as string;
  const fingerprint = inputFingerprint({ missionId });
  return student.classRef.firestore.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId);
    const [round, participant, mission, command, all] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)),
      tx.get(missionRef), tx.get(commandRef), tx.get(missionRef.parent),
    ]);
    if (command.exists) {
      assertSameCommand(command.data(), "replaceMission", student.uid, fingerprint);
      return command.get("result") as { missionId: string; text: string };
    }
    if (round.get("status") !== "active" || round.get("endsAt").toDate() <= new Date()
      || participant.get("participationStatus") !== "active" || !mission.exists
      || mission.get("status") !== "todo" || Number(mission.get("replacementCount") ?? 0) >= 2) {
      throw new HttpsError("failed-precondition", "이 미션은 더 바꿀 수 없어요.");
    }
    const used = new Set(all.docs.map((doc) => doc.id));
    const candidate = missionCatalog[gradeBand]?.map((_, index) => `${gradeBand}-${String(index + 1).padStart(2, "0")}`)
      .find((id) => !used.has(id));
    if (!candidate) throw new HttpsError("failed-precondition", "교체할 미션이 없어요.");
    const text = missionText(gradeBand, candidate)!;
    const result = { missionId: candidate, text };
    tx.update(missionRef, { status: "replaced", updatedAt: FieldValue.serverTimestamp() });
    tx.create(missionRef.parent.doc(candidate), { text, status: "todo", replacementCount: Number(mission.get("replacementCount") ?? 0) + 1,
      assignedDate: koreaDate(), createdAt: FieldValue.serverTimestamp() });
    tx.create(commandRef, { type: "replaceMission", requestedBy: student.uid,
      inputFingerprint: fingerprint, missionId, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});
