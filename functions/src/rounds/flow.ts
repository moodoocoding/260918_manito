import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { requireDocumentId, requireRecord, requireRequestId } from "../shared/validation.js";
import { matchParticipants, pairKey, type PairHistory } from "./matching.js";
import { koreaDate, parseRoundInput, requireTeacherRound, type RoundSettings } from "./common.js";
import { missionText } from "./missions.js";

function roundRefs(classId: string, roundId: string) {
  const classRef = db.doc(`classes/${classId}`);
  const roundRef = classRef.collection("rounds").doc(roundId);
  return { classRef, roundRef, settingsRef: classRef.collection("roundSettings").doc(roundId) };
}

async function selectedMissionTexts(
  tx: FirebaseFirestore.Transaction, classRef: FirebaseFirestore.DocumentReference,
  gradeBand: string, missionIds: string[],
): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  for (const id of missionIds) {
    const builtIn = missionText(gradeBand, id);
    if (builtIn) { texts.set(id, builtIn); continue; }
    if (!/^custom_[A-Za-z0-9]{20}$/.test(id)) {
      throw new HttpsError("invalid-argument", "학년군에 맞는 미션을 선택해 주세요.");
    }
    const custom = await tx.get(classRef.collection("customMissions").doc(id.slice(7)));
    if (!custom.exists) throw new HttpsError("invalid-argument", "우리 반 미션을 찾을 수 없어요.");
    texts.set(id, custom.get("text") as string);
  }
  return texts;
}

export const listRounds = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const classRef = db.doc(`classes/${classId}`);
  const classDoc = await classRef.get();
  assertClassTeacher(classDoc.data(), teacherUid);
  const [rounds, members] = await Promise.all([
    classRef.collection("rounds").get(), classRef.collection("members").get(),
  ]);
  return {
    rounds: rounds.docs.map((doc) => ({ roundId: doc.id, ...doc.data(),
      startsAt: doc.get("startsAt")?.toDate()?.toISOString(),
      endsAt: doc.get("endsAt")?.toDate()?.toISOString(),
      createdAt: undefined, updatedAt: undefined,
    })).sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt))),
    members: members.docs.map((doc) => ({ studentUid: doc.id,
      displayName: doc.get("displayName"), accessStatus: doc.get("accessStatus") })),
  };
});

export const getRoundSettingsForTeacher = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const { classRef } = await requireTeacherRound(teacherUid, classId, roundId);
  const settings = await classRef.collection("roundSettings").doc(roundId).get();
  if (!settings.exists) throw new HttpsError("not-found", "회차 설정을 찾지 못했어요.");
  await classRef.collection("auditLogs").add({ action: "round.settings_read", actorUid: teacherUid,
    roundId, createdAt: FieldValue.serverTimestamp() });
  return { participantIds: settings.get("participantIds"), excludedPairs: settings.get("excludedPairs"),
    missionIds: settings.get("missionIds"), activityDates: settings.get("activityDates") };
});

export const createRound = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const requestId = requireRequestId(input.requestId);
  const data = parseRoundInput(input);
  const fingerprint = inputFingerprint({ classId, ...data, startsAt: data.startsAt.toISOString(), endsAt: data.endsAt.toISOString() });
  const { classRef } = roundRefs(classId, "unused");
  const commandRef = classRef.collection("commands").doc(requestId);
  const roundRef = classRef.collection("rounds").doc();
  const settingsRef = classRef.collection("roundSettings").doc(roundRef.id);
  return db.runTransaction(async (tx) => {
    const [classDoc, command, members] = await Promise.all([
      tx.get(classRef), tx.get(commandRef),
      Promise.all(data.participantIds.map((id) => tx.get(classRef.collection("members").doc(id)))),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "createRound", teacherUid, fingerprint);
      return command.get("result") as { roundId: string };
    }
    if (members.some((doc) => !doc.exists || doc.get("accessStatus") !== "active")) {
      throw new HttpsError("failed-precondition", "입장 가능한 학생만 참가자로 선택해 주세요.");
    }
    const result = { roundId: roundRef.id };
    tx.create(roundRef, {
      title: data.title, status: "draft", startsAt: Timestamp.fromDate(data.startsAt),
      endsAt: Timestamp.fromDate(data.endsAt), activityDates: data.activityDates,
      allowFreeTextMessages: data.allowFreeTextMessages, participantCount: data.participantIds.length,
      rosterVersion: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(settingsRef, { participantIds: data.participantIds,
      excludedPairs: data.excludedPairs.map(([a, b]) => ({a, b})),
      missionIds: data.missionIds, activityDates: data.activityDates, rosterVersion: 1 });
    tx.create(commandRef, { type: "createRound", status: "succeeded", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "round.created", actorUid: teacherUid,
      roundId: roundRef.id, requestId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const updateRound = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const requestId = requireRequestId(input.requestId);
  const data = parseRoundInput(input);
  const fingerprint = inputFingerprint({ classId, roundId, ...data,
    startsAt: data.startsAt.toISOString(), endsAt: data.endsAt.toISOString() });
  const { classRef, roundRef, settingsRef } = roundRefs(classId, roundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  return db.runTransaction(async (tx) => {
    const [classDoc, roundDoc, settingsDoc, command, members] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(settingsRef), tx.get(commandRef),
      Promise.all(data.participantIds.map((id) => tx.get(classRef.collection("members").doc(id)))),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "updateRound", teacherUid, fingerprint);
      return { roundId };
    }
    if (!roundDoc.exists || !settingsDoc.exists || !["draft", "ready"].includes(roundDoc.get("status"))) {
      throw new HttpsError("failed-precondition", "준비 중인 회차만 수정할 수 있어요.");
    }
    if (members.some((doc) => !doc.exists || doc.get("accessStatus") !== "active")) {
      throw new HttpsError("failed-precondition", "입장 가능한 학생만 참가자로 선택해 주세요.");
    }
    const rosterVersion = Number(settingsDoc.get("rosterVersion")) + 1;
    tx.update(roundRef, { title: data.title, status: "draft", startsAt: Timestamp.fromDate(data.startsAt),
      endsAt: Timestamp.fromDate(data.endsAt), activityDates: data.activityDates,
      allowFreeTextMessages: data.allowFreeTextMessages, participantCount: data.participantIds.length,
      rosterVersion, updatedAt: FieldValue.serverTimestamp() });
    tx.update(settingsRef, { participantIds: data.participantIds,
      excludedPairs: data.excludedPairs.map(([a, b]) => ({a, b})),
      missionIds: data.missionIds, activityDates: data.activityDates, rosterVersion });
    tx.create(commandRef, { type: "updateRound", requestedBy: teacherUid, inputFingerprint: fingerprint,
      result: { roundId }, createdAt: FieldValue.serverTimestamp() });
    return { roundId };
  });
});

export const prepareRound = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const { classRef, roundRef, settingsRef } = roundRefs(classId, roundId);
  return db.runTransaction(async (tx) => {
    const [classDoc, roundDoc, settingsDoc] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(settingsRef),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (!roundDoc.exists || !settingsDoc.exists || !["draft", "ready"].includes(roundDoc.get("status"))) {
      throw new HttpsError("failed-precondition", "준비 중인 회차가 아니에요.");
    }
    const settings = settingsDoc.data() as RoundSettings;
    const members = await Promise.all(settings.participantIds.map((id) => tx.get(classRef.collection("members").doc(id))));
    if (members.some((doc) => !doc.exists || doc.get("accessStatus") !== "active")) {
      throw new HttpsError("failed-precondition", "참가자 중 입장할 수 없는 학생이 있어요.");
    }
    if (!matchParticipants(settings.participantIds, settings.excludedPairs.map(({a,b}) => [a,b]), [], null)) {
      throw new HttpsError("failed-precondition", "이 제외 조건으로는 모두를 배정할 수 없어요.");
    }
    const gradeBand = classDoc.get("gradeBand") as string;
    await selectedMissionTexts(tx, classRef, gradeBand, settings.missionIds);
    tx.update(roundRef, { status: "ready", rosterVersion: settings.rosterVersion,
      updatedAt: FieldValue.serverTimestamp() });
    return { roundId, status: "ready", rosterVersion: settings.rosterVersion };
  });
});

export const startRound = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const requestId = requireRequestId(input.requestId);
  const rosterVersion = input.rosterVersion;
  if (!Number.isInteger(rosterVersion)) throw new HttpsError("invalid-argument", "명단 버전이 필요해요.");
  const { classRef, roundRef, settingsRef } = roundRefs(classId, roundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({ classId, roundId, rosterVersion });
  return db.runTransaction(async (tx) => {
    const [classDoc, roundDoc, settingsDoc, command, historyDocs] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(settingsRef), tx.get(commandRef),
      tx.get(classRef.collection("pairHistory")),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "startRound", teacherUid, fingerprint);
      return command.get("result") as { roundId: string; status: string };
    }
    if (!roundDoc.exists || !settingsDoc.exists || roundDoc.get("status") !== "ready"
      || classDoc.get("activeRoundId") !== null
      || roundDoc.get("rosterVersion") !== rosterVersion
      || settingsDoc.get("rosterVersion") !== rosterVersion) {
      throw new HttpsError("failed-precondition", "준비 상태, 명단 버전 또는 진행 중인 회차를 확인해 주세요.");
    }
    const now = new Date();
    if (roundDoc.get("startsAt").toDate() > now) {
      throw new HttpsError("failed-precondition", "시작일이 되면 시즌을 시작할 수 있어요.");
    }
    if (roundDoc.get("endsAt").toDate() <= now) {
      throw new HttpsError("failed-precondition", "종료 시각이 지난 회차는 시작할 수 없어요.");
    }
    const settings = settingsDoc.data() as RoundSettings;
    const members = await Promise.all(settings.participantIds.map((id) => tx.get(classRef.collection("members").doc(id))));
    if (members.some((doc) => !doc.exists || doc.get("accessStatus") !== "active")) {
      throw new HttpsError("failed-precondition", "참가자 명단이 바뀌었어요. 다시 준비해 주세요.");
    }
    const history = historyDocs.docs.map((doc) => doc.data() as PairHistory);
    const assignments = matchParticipants(settings.participantIds, settings.excludedPairs.map(({a,b}) => [a,b]),
      history, classDoc.get("lastRoundId") ?? null);
    if (!assignments) throw new HttpsError("failed-precondition", "제외 조건을 만족하는 배정이 없어요.");
    const gradeBand = classDoc.get("gradeBand") as string;
    const missionIds = settings.missionIds.length > 0 ? settings.missionIds
      : [1, 2, 3].map((index) => `${gradeBand}-${String(index).padStart(2, "0")}`);
    const missionTexts = await selectedMissionTexts(tx, classRef, gradeBand, missionIds);
    const missionPlan = missionIds.map((missionId) => ({missionId, text: missionTexts.get(missionId)!}));
    for (const [giverUid, receiverUid] of assignments) {
      tx.create(roundRef.collection("assignmentSecrets").doc(giverUid), {
        giverUid, receiverUid, createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(roundRef.collection("participants").doc(giverUid), {
        participationStatus: "active", joinedAt: FieldValue.serverTimestamp(),
      });
      tx.create(roundRef.collection("studentData").doc(giverUid), {
        createdAt: FieldValue.serverTimestamp(),
      });
      const historyRef = classRef.collection("pairHistory").doc(Buffer.from(pairKey(giverUid, receiverUid)).toString("base64url"));
      const prior = history.find((item) => item.giverUid === giverUid && item.receiverUid === receiverUid);
      tx.set(historyRef, { giverUid, receiverUid, count: (prior?.count ?? 0) + 1,
        lastRoundId: roundId, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(roundRef, { status: "active", missionPlan, startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp() });
    tx.update(classRef, { activeRoundId: roundId, lastRoundId: roundId,
      updatedAt: FieldValue.serverTimestamp() });
    const result = { roundId, status: "active" };
    tx.create(commandRef, { type: "startRound", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "round.started", actorUid: teacherUid,
      roundId, requestId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const changeRoundStatus = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const requestId = requireRequestId(input.requestId);
  const action = input.action;
  const transitions: Record<string, [string[], string]> = {
    pause: [["active"], "paused"], resume: [["paused"], "active"],
    end: [["active", "paused"], "reveal_pending"],
    cancel: [["draft", "ready", "active", "paused"], "cancelled"],
    archive: [["revealed", "cancelled"], "archived"],
  };
  if (typeof action !== "string" || !transitions[action]) {
    throw new HttpsError("invalid-argument", "회차 작업이 올바르지 않아요.");
  }
  const { classRef, roundRef } = roundRefs(classId, roundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({ classId, roundId, action });
  return db.runTransaction(async (tx) => {
    const [classDoc, roundDoc, command] = await Promise.all([tx.get(classRef), tx.get(roundRef), tx.get(commandRef)]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "changeRoundStatus", teacherUid, fingerprint);
      return command.get("result") as { roundId: string; status: string };
    }
    const [allowed, next] = transitions[action];
    if (!roundDoc.exists || !allowed.includes(roundDoc.get("status"))) {
      throw new HttpsError("failed-precondition", "현재 상태에서는 이 작업을 할 수 없어요.");
    }
    if (["resume", "pause", "end"].includes(action) && classDoc.get("activeRoundId") !== roundId) {
      throw new HttpsError("failed-precondition", "진행 중인 회차가 아니에요.");
    }
    if (["pause", "resume"].includes(action) && roundDoc.get("endsAt").toDate() <= new Date()) {
      throw new HttpsError("failed-precondition", "종료 시각이 지난 뒤에는 재개할 수 없어요.");
    }
    tx.update(roundRef, { status: next, updatedAt: FieldValue.serverTimestamp() });
    if (action === "cancel" && classDoc.get("activeRoundId") === roundId) {
      tx.update(classRef, { activeRoundId: null, updatedAt: FieldValue.serverTimestamp() });
    }
    if (action === "archive" && classDoc.get("activeRoundId") === roundId) {
      tx.update(classRef, { activeRoundId: null, updatedAt: FieldValue.serverTimestamp() });
    }
    const result = { roundId, status: next };
    tx.create(commandRef, { type: "changeRoundStatus", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: `round.${action}`, actorUid: teacherUid,
      roundId, requestId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const extendRound = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const requestId = requireRequestId(input.requestId);
  const endsAt = new Date(String(input.endsAt));
  if (!Number.isFinite(endsAt.getTime()) || !Array.isArray(input.activityDates)
    || input.activityDates.length < 3 || input.activityDates.length > 20
    || input.activityDates.some((date) => typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(new Date(`${date}T00:00:00Z`).getTime())
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    || new Set(input.activityDates).size !== input.activityDates.length) {
    throw new HttpsError("invalid-argument", "연장 기간과 수업일을 확인해 주세요.");
  }
  const activityDates = [...input.activityDates].sort() as string[];
  const fingerprint = inputFingerprint({ classId, roundId, endsAt: endsAt.toISOString(), activityDates });
  const { classRef, roundRef, settingsRef } = roundRefs(classId, roundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  return db.runTransaction(async (tx) => {
    const [classDoc, round, settings, command] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(settingsRef), tx.get(commandRef),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "extendRound", teacherUid, fingerprint);
      return command.get("result") as {roundId: string; status: string};
    }
    const now = new Date();
    if (round.get("status") !== "paused" || classDoc.get("activeRoundId") !== roundId
      || round.get("endsAt").toDate() <= now || endsAt <= round.get("endsAt").toDate()
      || endsAt.getTime() - round.get("startsAt").toDate().getTime() > 30 * 86400_000
      || !settings.exists || !(round.get("activityDates") as string[]).every((date) => activityDates.includes(date))
      || activityDates[0] < koreaDate(round.get("startsAt").toDate())
      || activityDates.at(-1)! > koreaDate(endsAt)) {
      throw new HttpsError("failed-precondition", "종료 전 일시정지 회차에서 기존 수업일을 유지하며 연장해 주세요.");
    }
    tx.update(roundRef, { endsAt: Timestamp.fromDate(endsAt), activityDates,
      updatedAt: FieldValue.serverTimestamp() });
    tx.update(settingsRef, { activityDates });
    const result = { roundId, status: "paused" };
    tx.create(commandRef, {type:"extendRound", requestedBy:teacherUid, inputFingerprint:fingerprint,
      result, createdAt:FieldValue.serverTimestamp()});
    tx.create(classRef.collection("auditLogs").doc(), { action:"round.extended", actorUid:teacherUid,
      roundId, requestId, createdAt:FieldValue.serverTimestamp() });
    return result;
  });
});

export const getAssignmentsForTeacher = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const { classRef, roundRef } = await requireTeacherRound(teacherUid, classId, roundId);
  const [assignments, members] = await Promise.all([
    roundRef.collection("assignmentSecrets").get(), classRef.collection("members").get(),
  ]);
  const names = new Map(members.docs.map((doc) => [doc.id, doc.get("displayName") as string]));
  await classRef.collection("auditLogs").add({ action: "assignment.teacher_read", actorUid: teacherUid,
    roundId, createdAt: FieldValue.serverTimestamp() });
  return { assignments: assignments.docs.map((doc) => ({ giverUid: doc.id,
    giverName: names.get(doc.id), receiverUid: doc.get("receiverUid"),
    receiverName: names.get(doc.get("receiverUid")) })) };
});
