import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { assertStudentTransaction, requireStudentRound } from "../shared/student.js";
import { requireDocumentId, requireRecord, requireRequestId, requireText } from "../shared/validation.js";
import { requireTeacherRound, type RoundSettings } from "./common.js";

export const stopRoundParticipation = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const studentUid = requireDocumentId(input.studentUid, "학생");
  const requestId = requireRequestId(input.requestId);
  const { classRef, roundRef } = await requireTeacherRound(teacherUid, classId, roundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const participantRef = roundRef.collection("participants").doc(studentUid);
  const fingerprint = inputFingerprint({ classId, roundId, studentUid });
  return db.runTransaction(async (tx) => {
    const [classDoc, round, participant, command] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(participantRef), tx.get(commandRef),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "stopRoundParticipation", teacherUid, fingerprint);
      return { studentUid, status: "stopped" };
    }
    if (!["active", "paused", "reveal_pending"].includes(round.get("status"))
      || !participant.exists || participant.get("participationStatus") !== "active") {
      throw new HttpsError("failed-precondition", "참여를 중단할 수 없어요.");
    }
    tx.update(participantRef, { participationStatus: "stopped", stoppedAt: FieldValue.serverTimestamp() });
    tx.create(commandRef, { type: "stopRoundParticipation", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result: { studentUid, status: "stopped" }, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "participation.stopped", actorUid: teacherUid,
      roundId, studentUid, requestId, createdAt: FieldValue.serverTimestamp() });
    return { studentUid, status: "stopped" };
  });
});

export const revealRound = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const requestId = requireRequestId(input.requestId);
  const { classRef, roundRef } = await requireTeacherRound(teacherUid, classId, roundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({ classId, roundId });
  return db.runTransaction(async (tx) => {
    const [classDoc, round, command, helps, messages, assignments, participants, members] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(commandRef),
      tx.get(roundRef.collection("helpSecrets")), tx.get(roundRef.collection("messageSecrets")),
      tx.get(roundRef.collection("assignmentSecrets")), tx.get(roundRef.collection("participants")),
      tx.get(classRef.collection("members")),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "revealRound", teacherUid, fingerprint);
      return { roundId, status: "revealed" };
    }
    if (round.get("status") !== "reveal_pending" || classDoc.get("activeRoundId") !== roundId) {
      throw new HttpsError("failed-precondition", "공개 대기 중인 회차가 아니에요.");
    }
    if (helps.docs.some((doc) => doc.get("status") === "open")
      || messages.docs.some((doc) => doc.get("status") === "pending")) {
      throw new HttpsError("failed-precondition", "도움 요청과 쪽지 검토를 먼저 마쳐 주세요.");
    }
    const active = new Set(participants.docs.filter((doc) => doc.get("participationStatus") === "active").map((doc) => doc.id));
    const names = new Map(members.docs.map((doc) => [doc.id, doc.get("displayName") as string]));
    for (const assignment of assignments.docs) {
      const giverUid = assignment.id;
      const receiverUid = assignment.get("receiverUid") as string;
      if (active.has(giverUid) && active.has(receiverUid)) {
        tx.update(roundRef.collection("studentData").doc(giverUid), {
          targetDisplayName: names.get(receiverUid) ?? null, revealedAt: FieldValue.serverTimestamp(),
        });
        tx.update(roundRef.collection("studentData").doc(receiverUid), {
          incomingDisplayName: names.get(giverUid) ?? null, revealedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    tx.update(roundRef, { status: "revealed", revealedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp() });
    tx.update(classRef, { activeRoundId: null, updatedAt: FieldValue.serverTimestamp() });
    tx.create(commandRef, { type: "revealRound", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result: { roundId, status: "revealed" },
      createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "round.revealed", actorUid: teacherUid,
      roundId, requestId, createdAt: FieldValue.serverTimestamp() });
    return { roundId, status: "revealed" };
  });
});

export const sendThankYou = onCall(async (request) => {
  const input = requireRecord(request.data);
  const requestId = requireRequestId(input.requestId);
  const text = requireText(input.text, "감사 인사", 50);
  const choices = ["고마워!", "나를 챙겨 줘서 고마워!", "함께해서 즐거웠어!"];
  if (!choices.includes(text)) throw new HttpsError("invalid-argument", "준비된 감사 인사를 선택해 주세요.");
  const student = await requireStudentRound(request, typeof input.roundId === "string"
    ? requireDocumentId(input.roundId, "회차") : undefined);
  if (student.roundDoc.get("status") !== "revealed") throw new HttpsError("failed-precondition", "공개 후에 인사를 보낼 수 있어요.");
  const thankRef = student.roundRef.collection("thankYouSecrets").doc(student.uid);
  const commandRef = student.roundRef.collection("studentCommands").doc(`${student.uid}_${requestId}`);
  const fingerprint = inputFingerprint({ text });
  return db.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId, false);
    const [round, thank, command, assignments, participants] = await Promise.all([
      tx.get(student.roundRef), tx.get(thankRef), tx.get(commandRef),
      tx.get(student.roundRef.collection("assignmentSecrets")),
      tx.get(student.roundRef.collection("participants")),
    ]);
    if (command.exists) {
      assertSameCommand(command.data(), "sendThankYou", student.uid, fingerprint);
      return { status: "sent" };
    }
    const giver = assignments.docs.find((doc) => doc.get("receiverUid") === student.uid)?.id;
    const active = new Set(participants.docs.filter((doc) => doc.get("participationStatus") === "active").map((doc) => doc.id));
    if (round.get("status") !== "revealed" || thank.exists || !giver
      || !active.has(student.uid) || !active.has(giver)) {
      throw new HttpsError("failed-precondition", "감사 인사를 보낼 수 없어요.");
    }
    tx.create(thankRef, { senderUid: student.uid, receiverUid: giver, text, createdAt: FieldValue.serverTimestamp() });
    tx.create(student.roundRef.collection("studentData").doc(giver).collection("inboxItems").doc(`thanks_${student.uid}`), {
      text, type: "thanks", hidden: false, reported: false, createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(commandRef, { type: "sendThankYou", requestedBy: student.uid,
      inputFingerprint: fingerprint, result: { status: "sent" }, createdAt: FieldValue.serverTimestamp() });
    return { status: "sent" };
  });
});

export const saveReflection = onCall(async (request) => {
  const input = requireRecord(request.data);
  const text = requireText(input.text, "돌아보기", 300);
  const student = await requireStudentRound(request, typeof input.roundId === "string"
    ? requireDocumentId(input.roundId, "회차") : undefined);
  if (student.roundDoc.get("status") !== "revealed") throw new HttpsError("failed-precondition", "공개 후에 돌아볼 수 있어요.");
  const ref = student.roundRef.collection("studentData").doc(student.uid).collection("reflection").doc("mine");
  return db.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId, false);
    const [round, participant] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)),
    ]);
    if (round.get("status") !== "revealed" || participant.get("participationStatus") !== "active") {
      throw new HttpsError("failed-precondition", "돌아보기를 저장할 수 없어요.");
    }
    tx.set(ref, { text, updatedAt: FieldValue.serverTimestamp() });
    return { saved: true };
  });
});

export const copyRoundSettings = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const sourceRoundId = requireDocumentId(input.sourceRoundId, "이전 회차");
  const requestId = requireRequestId(input.requestId);
  const title = requireText(input.title, "회차 주제", 60);
  const startsAt = new Date(String(input.startsAt));
  const endsAt = new Date(String(input.endsAt));
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt
    || endsAt.getTime() - startsAt.getTime() > 30 * 86400_000) {
    throw new HttpsError("invalid-argument", "새 회차 기간이 올바르지 않아요.");
  }
  const { classRef } = await requireTeacherRound(teacherUid, classId, sourceRoundId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const newRoundRef = classRef.collection("rounds").doc();
  const sourceSettingsRef = classRef.collection("roundSettings").doc(sourceRoundId);
  const fingerprint = inputFingerprint({ classId, sourceRoundId, title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  return db.runTransaction(async (tx) => {
    const [classDoc, source, settings, command] = await Promise.all([
      tx.get(classRef), tx.get(classRef.collection("rounds").doc(sourceRoundId)),
      tx.get(sourceSettingsRef), tx.get(commandRef),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "copyRoundSettings", teacherUid, fingerprint);
      return command.get("result") as { roundId: string };
    }
    if (!settings.exists || !["revealed", "archived", "cancelled"].includes(source.get("status"))) {
      throw new HttpsError("failed-precondition", "끝난 회차의 설정만 복사할 수 있어요.");
    }
    const prior = settings.data() as RoundSettings;
    const result = { roundId: newRoundRef.id };
    tx.create(newRoundRef, { title, status: "draft", startsAt: Timestamp.fromDate(startsAt),
      endsAt: Timestamp.fromDate(endsAt), activityDates: [],
      allowFreeTextMessages: source.get("allowFreeTextMessages") === true,
      participantCount: prior.participantIds.length, rosterVersion: 1,
      copiedFromRoundId: sourceRoundId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("roundSettings").doc(newRoundRef.id), {
      participantIds: prior.participantIds, excludedPairs: prior.excludedPairs,
      missionIds: prior.missionIds, activityDates: [], rosterVersion: 1,
    });
    tx.create(commandRef, { type: "copyRoundSettings", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});
