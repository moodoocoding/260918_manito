import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertStudentTransaction, requireStudentRound } from "../shared/student.js";
import { requireRecord, requireRequestId } from "../shared/validation.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { requireDocumentId, requireText } from "../shared/validation.js";
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

export const missionCategories = ["인사와 칭찬", "경청과 대화", "협력과 배려", "감사와 응원"] as const;
const originalCategories: Record<string, number[]> = {
  lower: [0, 1, 3, 2, 3, 2, 0, 1, 2, 2],
  middle: [1, 0, 1, 2, 3, 2, 2, 0, 2, 3],
  upper: [1, 0, 1, 2, 3, 2, 1, 2, 1, 3],
};
const extraMissions: string[][] = [
  ["친구에게 먼저 밝게 인사하기", "친구가 새로 시도한 일을 알아봐 주기", "친구의 좋은 생각 하나를 말해 주기",
    "친구가 노력한 과정을 칭찬하기", "친구의 장점을 구체적으로 한 가지 전하기", "친구의 발표에서 좋았던 점 말하기",
    "친구가 해낸 작은 일을 함께 기뻐하기", "친구가 배려한 순간을 찾아 알려주기", "친구의 의견 중 마음에 남은 점 말하기",
    "친구에게 오늘 잘한 점을 한 가지 전하기"],
  ["친구가 말하는 동안 끼어들지 않기", "친구의 의견을 듣고 다시 확인하기", "친구에게 오늘 즐거웠던 일을 물어보기",
    "친구가 고른 놀이 방법을 들어보기", "모둠에서 친구가 말할 차례를 기다리기", "친구가 전한 생각을 한 문장으로 되짚기",
    "친구에게 어떤 도움이 편한지 물어보기", "친구가 제안한 방법을 먼저 들어보기", "친구가 말할 때 눈을 맞추고 듣기",
    "친구의 이야기에 질문 한 가지로 관심 보이기"],
  ["함께 쓰는 자리를 사용 뒤 정리하기", "모둠에서 친구의 역할을 존중하기", "친구가 원하면 정리할 일을 함께 나누기",
    "공용 물건을 다음 친구가 쓰기 좋게 두기", "친구가 어려워하는 일을 도와도 되는지 먼저 묻기",
    "함께 할 수 있는 작은 교실 일을 찾아보기", "놀이 규칙을 모두가 이해하도록 다시 말하기",
    "친구가 참여할 수 있는 순서를 함께 정하기", "모둠 활동에서 친구의 아이디어를 활용하기",
    "친구가 부담 없이 도움을 거절할 수 있게 제안하기"],
  ["친구에게 고마웠던 순간을 말하기", "친구가 해 준 일을 떠올려 감사 전하기", "친구에게 응원 한마디 건네기",
    "친구에게 힘이 된 말을 한 문장 적기", "친구의 다음 도전을 응원하기", "친구가 어려운 일을 마친 뒤 수고했다고 말하기",
    "친구의 친절한 행동에 고맙다고 말하기", "친구에게 편안한 하루를 바라는 말 전하기",
    "친구의 노력에 힘이 되는 표현 골라 전하기", "친구가 도와준 이유를 떠올려 감사하기"],
];

export function builtInMissions(gradeBand: string): Array<{missionId: string; text: string; category: string}> {
  const originals = missionCatalog[gradeBand];
  if (!originals) return [];
  const entries = originals.map((text, index) => ({missionId: `${gradeBand}-${String(index + 1).padStart(2, "0")}`,
    text, category: missionCategories[originalCategories[gradeBand][index]]}));
  for (let category = 0; category < missionCategories.length; category++) {
    const needed = 10 - entries.filter((item) => item.category === missionCategories[category]).length;
    for (const text of extraMissions[category].slice(0, needed)) {
      entries.push({missionId: `${gradeBand}-${String(entries.length + 1).padStart(2, "0")}`,
        text, category: missionCategories[category]});
    }
  }
  return entries;
}

export function missionText(gradeBand: string, missionId: string): string | null {
  const match = /^(lower|middle|upper)-(\d{2})$/.exec(missionId);
  if (!match || match[1] !== gradeBand) return null;
  return builtInMissions(gradeBand)[Number(match[2]) - 1]?.text ?? null;
}

function requireMissionId(value: unknown): string {
  if (typeof value !== "string" || !/^(?:(?:lower|middle|upper)-\d{2}|custom_[A-Za-z0-9]{20})$/.test(value)) {
    throw new HttpsError("invalid-argument", "미션 값이 올바르지 않아요.");
  }
  return value;
}

export const getMissionCatalog = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  if (input.gradeBand !== "lower" && input.gradeBand !== "middle" && input.gradeBand !== "upper") {
    throw new HttpsError("invalid-argument", "학년군을 선택해 주세요.");
  }
  const classRef = db.doc(`classes/${classId}`);
  const classDoc = await classRef.get();
  assertClassTeacher(classDoc.data(), teacherUid);
  if (classDoc.get("gradeBand") !== input.gradeBand) throw new HttpsError("invalid-argument", "학급 학년군이 달라요.");
  const custom = await classRef.collection("customMissions").get();
  return {categories: missionCategories, missions: [...builtInMissions(input.gradeBand),
    ...custom.docs.map((doc) => ({missionId: `custom_${doc.id}`, text: doc.get("text") as string,
      category: "우리 반 미션"}))]};
});

export const createCustomMission = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const text = requireText(input.text, "미션", 100);
  const requestId = requireRequestId(input.requestId);
  const classRef = db.doc(`classes/${classId}`);
  const commandRef = classRef.collection("commands").doc(requestId);
  const missionRef = classRef.collection("customMissions").doc();
  const fingerprint = inputFingerprint({classId, text});
  return db.runTransaction(async (tx) => {
    const [classDoc, command] = await Promise.all([tx.get(classRef), tx.get(commandRef)]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "createCustomMission", teacherUid, fingerprint);
      return command.get("result") as {missionId: string; text: string; category: string};
    }
    const count = Number(classDoc.get("customMissionCount") ?? 0);
    if (count >= 40) throw new HttpsError("resource-exhausted", "우리 반 미션은 40개까지 추가할 수 있어요.");
    const result = {missionId: `custom_${missionRef.id}`, text, category: "우리 반 미션"};
    tx.create(missionRef, {text, createdBy: teacherUid, createdAt: FieldValue.serverTimestamp()});
    tx.update(classRef, {customMissionCount: count + 1, updatedAt: FieldValue.serverTimestamp()});
    tx.create(commandRef, {type:"createCustomMission", requestedBy:teacherUid, inputFingerprint:fingerprint,
      result, createdAt:FieldValue.serverTimestamp()});
    return result;
  });
});

function requireCustomMissionId(value: unknown): { missionId: string; docId: string } {
  if (typeof value !== "string" || !/^custom_[A-Za-z0-9]{20}$/.test(value)) {
    throw new HttpsError("invalid-argument", "우리 반 미션만 수정하거나 삭제할 수 있어요.");
  }
  return { missionId: value, docId: value.slice(7) };
}

export const updateCustomMission = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const { missionId, docId } = requireCustomMissionId(input.missionId);
  const text = requireText(input.text, "미션", 100);
  const requestId = requireRequestId(input.requestId);
  const classRef = db.doc(`classes/${classId}`);
  const missionRef = classRef.collection("customMissions").doc(docId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({ classId, missionId, text });
  return db.runTransaction(async (tx) => {
    const [classDoc, missionDoc, command] = await Promise.all([
      tx.get(classRef), tx.get(missionRef), tx.get(commandRef),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "updateCustomMission", teacherUid, fingerprint);
      return command.get("result") as { missionId: string; text: string; category: string };
    }
    if (!missionDoc.exists) {
      throw new HttpsError("not-found", "우리 반 미션을 찾지 못했어요.");
    }
    const result = { missionId, text, category: "우리 반 미션" };
    tx.update(missionRef, { text, updatedAt: FieldValue.serverTimestamp() });
    tx.create(commandRef, { type: "updateCustomMission", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "custom_mission.updated",
      actorUid: teacherUid, missionId, requestId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const deleteCustomMission = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const { missionId, docId } = requireCustomMissionId(input.missionId);
  const requestId = requireRequestId(input.requestId);
  const classRef = db.doc(`classes/${classId}`);
  const missionRef = classRef.collection("customMissions").doc(docId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({ classId, missionId, action: "delete" });
  return db.runTransaction(async (tx) => {
    const [classDoc, missionDoc, command, roundsSnap, settingsSnap] = await Promise.all([
      tx.get(classRef), tx.get(missionRef), tx.get(commandRef),
      tx.get(classRef.collection("rounds")), tx.get(classRef.collection("roundSettings")),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "deleteCustomMission", teacherUid, fingerprint);
      return command.get("result") as { missionId: string; status: string };
    }
    if (!missionDoc.exists) {
      throw new HttpsError("not-found", "우리 반 미션을 찾지 못했어요.");
    }
    const roundsMap = new Map(roundsSnap.docs.map((doc) => [doc.id, doc]));
    for (const settingsDoc of settingsSnap.docs) {
      const roundDoc = roundsMap.get(settingsDoc.id);
      if (!roundDoc || !["draft", "ready"].includes(String(roundDoc.get("status") ?? ""))) continue;
      const missionIds = (settingsDoc.get("missionIds") as string[] | undefined) ?? [];
      if (missionIds.includes(missionId)) {
        const nextMissions = missionIds.filter((id) => id !== missionId);
        const nextVersion = Number(settingsDoc.get("rosterVersion") ?? 1) + 1;
        tx.update(settingsDoc.ref, { missionIds: nextMissions, rosterVersion: nextVersion });
        tx.update(roundDoc.ref, { status: "draft", rosterVersion: nextVersion, updatedAt: FieldValue.serverTimestamp() });
      }
    }
    const count = Math.max(0, Number(classDoc.get("customMissionCount") ?? 1) - 1);
    tx.delete(missionRef);
    tx.update(classRef, { customMissionCount: count, updatedAt: FieldValue.serverTimestamp() });
    const result = { missionId, status: "deleted" };
    tx.create(commandRef, { type: "deleteCustomMission", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "custom_mission.deleted",
      actorUid: teacherUid, missionId, requestId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
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
  const viewRef = student.roundRef.collection("studentData").doc(student.uid);
  return student.classRef.firestore.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId);
    const [round, participant, mission, view] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)),
      tx.get(missionRef), tx.get(viewRef),
    ]);
    const planned = (round.get("missionPlan") as Array<{missionId: string; text: string}> | undefined)
      ?.find((item) => item.missionId === missionId);
    if (round.get("status") !== "active" || round.get("endsAt").toDate() <= new Date()
      || participant.get("participationStatus") !== "active" || (!mission.exists && !planned)) {
      throw new HttpsError("failed-precondition", "이 미션을 변경할 수 없어요.");
    }
    if (mission.exists) tx.update(missionRef, {status: input.status, updatedAt: FieldValue.serverTimestamp()});
    else tx.create(missionRef, {text: planned!.text, status: input.status, replacementCount: 0,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    if (view.get("focusMissionId") === missionId) tx.update(viewRef, {focusMissionId: null});
    return { missionId, status: input.status };
  });
});

export const setStudentMissionFocus = onCall(async (request) => {
  const input = requireRecord(request.data);
  const roundId = requireDocumentId(input.roundId, "시즌");
  const missionId = input.missionId === null ? null : requireMissionId(input.missionId);
  const requestId = requireRequestId(input.requestId);
  const student = await requireStudentRound(request, roundId);
  const viewRef = student.roundRef.collection("studentData").doc(student.uid);
  const missionRef = missionId ? viewRef.collection("missions").doc(missionId) : null;
  const commandRef = student.roundRef.collection("studentCommands").doc(`${student.uid}_${requestId}`);
  const fingerprint = inputFingerprint({roundId, missionId});
  return db.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, roundId);
    const [round, participant, view, mission, command] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)),
      tx.get(viewRef), missionRef ? tx.get(missionRef) : Promise.resolve(null), tx.get(commandRef),
    ]);
    if (command.exists) {
      assertSameCommand(command.data(), "setStudentMissionFocus", student.uid, fingerprint);
      return command.get("result") as {missionId: string | null};
    }
    const planned = (round.get("missionPlan") as Array<{missionId: string}> | undefined)
      ?.some((item) => item.missionId === missionId);
    if (round.get("status") !== "active" || round.get("endsAt").toDate() <= new Date()
      || participant.get("participationStatus") !== "active"
      || (missionId !== null && (!mission?.exists && !planned || mission?.exists && mission.get("status") !== "todo"))) {
      throw new HttpsError("failed-precondition", "지금은 이 미션을 선택할 수 없어요.");
    }
    const result = {missionId};
    tx.update(viewRef, {focusMissionId: missionId, updatedAt: FieldValue.serverTimestamp()});
    tx.create(commandRef, {type:"setStudentMissionFocus", requestedBy:student.uid,
      inputFingerprint:fingerprint, result, createdAt:FieldValue.serverTimestamp()});
    return result;
  });
});

export const replaceMission = onCall(async (request) => {
  const input = requireRecord(request.data);
  const missionId = requireMissionId(input.missionId);
  const requestId = requireRequestId(input.requestId);
  const student = await requireStudentRound(request);
  const missionRef = student.roundRef.collection("studentData").doc(student.uid).collection("missions").doc(missionId);
  const viewRef = student.roundRef.collection("studentData").doc(student.uid);
  const commandRef = student.roundRef.collection("studentCommands").doc(`${student.uid}_${requestId}`);
  const gradeBand = student.classDoc.get("gradeBand") as string;
  const fingerprint = inputFingerprint({ missionId });
  return student.classRef.firestore.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId);
    const [round, participant, mission, command, all, view] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)),
      tx.get(missionRef), tx.get(commandRef), tx.get(missionRef.parent), tx.get(viewRef),
    ]);
    if (command.exists) {
      assertSameCommand(command.data(), "replaceMission", student.uid, fingerprint);
      return command.get("result") as { missionId: string; text: string };
    }
    const plan = round.get("missionPlan") as Array<{missionId: string; text: string}> | undefined;
    const planned = plan?.find((item) => item.missionId === missionId);
    const status = mission.exists ? mission.get("status") : planned ? "todo" : null;
    const replacementCount = Number(mission.exists ? mission.get("replacementCount") ?? 0 : 0);
    if (round.get("status") !== "active" || round.get("endsAt").toDate() <= new Date()
      || participant.get("participationStatus") !== "active" || status !== "todo"
      || replacementCount >= 2) {
      throw new HttpsError("failed-precondition", "이 미션은 더 바꿀 수 없어요.");
    }
    const used = new Set([...(plan?.map((item) => item.missionId) ?? []), ...all.docs.map((doc) => doc.id)]);
    const candidate = builtInMissions(gradeBand).map((item) => item.missionId)
      .find((id) => !used.has(id));
    if (!candidate) throw new HttpsError("failed-precondition", "교체할 미션이 없어요.");
    const text = missionText(gradeBand, candidate)!;
    const result = { missionId: candidate, text };
    if (mission.exists) tx.update(missionRef, {status: "replaced", updatedAt: FieldValue.serverTimestamp()});
    else tx.create(missionRef, {text: planned!.text, status: "replaced", replacementCount: 0,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    tx.create(missionRef.parent.doc(candidate), { text, status: "todo", replacementCount: replacementCount + 1,
      assignedDate: koreaDate(), createdAt: FieldValue.serverTimestamp() });
    if (view.get("focusMissionId") === missionId) tx.update(viewRef, {focusMissionId: null});
    tx.create(commandRef, { type: "replaceMission", requestedBy: student.uid,
      inputFingerprint: fingerprint, missionId, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});
