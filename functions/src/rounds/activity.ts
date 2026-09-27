import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { assertStudentTransaction, requireStudentRound } from "../shared/student.js";
import { requireDocumentId, requireRecord, requireRequestId, requireText } from "../shared/validation.js";
import { koreaDate, requireTeacherRound } from "./common.js";

const presetMessages = [
  "오늘도 응원해!", "함께해서 즐거웠어.", "네 생각이 참 좋았어.",
  "고마워!", "잘하고 있어!", "오늘 수고했어.",
];

function activeForSubmission(round: FirebaseFirestore.DocumentSnapshot): boolean {
  return round.get("status") === "active" && round.get("endsAt")?.toDate() > new Date();
}

export const getStudentActivity = onCall(async (request) => {
  const student = await requireStudentRound(request);
  const dataRef = student.roundRef.collection("studentData").doc(student.uid);
  const [missions, inbox, sent, help] = await Promise.all([
    dataRef.collection("missions").get(), dataRef.collection("inboxItems").get(),
    dataRef.collection("sentMessages").get(), dataRef.collection("helpRequests").get(),
  ]);
  return {
    roundId: student.roundId, status: student.roundDoc.get("status"),
    activityDates: student.roundDoc.get("activityDates") as string[],
    canSubmit: activeForSubmission(student.roundDoc),
    allowFreeTextMessages: student.roundDoc.get("allowFreeTextMessages") === true,
    presetMessages,
    missions: missions.docs.map((doc) => ({ missionId: doc.id, text: doc.get("text"), status: doc.get("status") })),
    inbox: inbox.docs.map((doc) => ({ messageId: doc.id, text: doc.get("text"), hidden: doc.get("hidden") === true,
      reported: doc.get("reported") === true, type: doc.get("type") })),
    sent: sent.docs.map((doc) => ({ messageId: doc.id, text: doc.get("text"), status: doc.get("status"),
      date: doc.get("date") })),
    help: help.docs.map((doc) => ({ helpId: doc.id, status: doc.get("status"),
      category: doc.get("category"), createdAt: doc.get("createdAt")?.toDate()?.toISOString() })),
  };
});

export const sendMessage = onCall(async (request) => {
  const input = requireRecord(request.data);
  const requestId = requireRequestId(input.requestId);
  const kind = input.kind;
  if (kind !== "preset" && kind !== "free") throw new HttpsError("invalid-argument", "쪽지 방식이 올바르지 않아요.");
  const text = requireText(input.text, "쪽지", kind === "free" ? 200 : 30);
  if (kind === "preset" && !presetMessages.includes(text)) {
    throw new HttpsError("invalid-argument", "검토된 문구를 선택해 주세요.");
  }
  const student = await requireStudentRound(request);
  const date = koreaDate();
  const dayRef = student.roundRef.collection("messageDays").doc(`${student.uid}_${date}`);
  const commandRef = student.roundRef.collection("studentCommands").doc(`${student.uid}_${requestId}`);
  const messageRef = student.roundRef.collection("messageSecrets").doc();
  const assignmentRef = student.roundRef.collection("assignmentSecrets").doc(student.uid);
  const fingerprint = inputFingerprint({ kind, text, date });
  return db.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId);
    const [round, participant, assignment, command, day] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)),
      tx.get(assignmentRef), tx.get(commandRef), tx.get(dayRef),
    ]);
    if (command.exists) {
      assertSameCommand(command.data(), "sendMessage", student.uid, fingerprint);
      return command.get("result") as { messageId: string; status: string };
    }
    if (!activeForSubmission(round) || participant.get("participationStatus") !== "active"
      || !(round.get("activityDates") as string[]).includes(date)) {
      throw new HttpsError("failed-precondition", "오늘은 쪽지를 보낼 수 있는 수업일이 아니에요.");
    }
    if (kind === "free" && round.get("allowFreeTextMessages") !== true) {
      throw new HttpsError("permission-denied", "이 회차는 선택형 쪽지만 사용할 수 있어요.");
    }
    if (!assignment.exists || day.exists) {
      throw new HttpsError("failed-precondition", "오늘의 쪽지는 이미 보냈거나 배정을 확인할 수 없어요.");
    }
    const receiverUid = assignment.get("receiverUid") as string;
    const receiver = await tx.get(student.roundRef.collection("participants").doc(receiverUid));
    if (receiver.get("participationStatus") !== "active") {
      throw new HttpsError("failed-precondition", "쪽지를 전달할 수 없어요. 선생님께 알려 주세요.");
    }
    const status = kind === "free" ? "pending" : "delivered";
    const result = { messageId: messageRef.id, status };
    tx.create(dayRef, { senderUid: student.uid, date, messageId: messageRef.id,
      createdAt: FieldValue.serverTimestamp() });
    tx.create(messageRef, { senderUid: student.uid, receiverUid, text, kind, status,
      date, createdAt: FieldValue.serverTimestamp() });
    tx.create(student.roundRef.collection("studentData").doc(student.uid).collection("sentMessages").doc(messageRef.id), {
      text, kind, status, date, createdAt: FieldValue.serverTimestamp(),
    });
    if (status === "delivered") {
      tx.create(student.roundRef.collection("studentData").doc(receiverUid).collection("inboxItems").doc(messageRef.id), {
        text, type: "encouragement", hidden: false, reported: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.create(commandRef, { type: "sendMessage", requestedBy: student.uid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const reviewMessage = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const messageId = requireDocumentId(input.messageId, "쪽지");
  const requestId = requireRequestId(input.requestId);
  if (input.decision !== "approve" && input.decision !== "reject") {
    throw new HttpsError("invalid-argument", "승인 또는 반려를 선택해 주세요.");
  }
  const { classRef, roundRef } = await requireTeacherRound(teacherUid, classId, roundId);
  const messageRef = roundRef.collection("messageSecrets").doc(messageId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({ classId, roundId, messageId, decision: input.decision });
  return db.runTransaction(async (tx) => {
    const [classDoc, roundDoc, message, command] = await Promise.all([
      tx.get(classRef), tx.get(roundRef), tx.get(messageRef), tx.get(commandRef),
    ]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "reviewMessage", teacherUid, fingerprint);
      return command.get("result") as { messageId: string; status: string };
    }
    if (!message.exists || message.get("kind") !== "free" || message.get("status") !== "pending"
      || !["active", "paused", "reveal_pending"].includes(roundDoc.get("status"))) {
      throw new HttpsError("failed-precondition", "검토 대기 중인 쪽지가 아니에요.");
    }
    const senderUid = message.get("senderUid") as string;
    const receiverUid = message.get("receiverUid") as string;
    const [sender, receiver] = await Promise.all([
      tx.get(roundRef.collection("participants").doc(senderUid)),
      tx.get(roundRef.collection("participants").doc(receiverUid)),
    ]);
    const approved = input.decision === "approve" && sender.get("participationStatus") === "active"
      && receiver.get("participationStatus") === "active";
    const status = approved ? "delivered" : "rejected";
    if (approved) {
      tx.create(roundRef.collection("studentData").doc(receiverUid).collection("inboxItems").doc(messageId), {
        text: message.get("text"), type: "encouragement", hidden: false, reported: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(messageRef, { status, reviewedBy: teacherUid, reviewedAt: FieldValue.serverTimestamp() });
    tx.update(roundRef.collection("studentData").doc(senderUid).collection("sentMessages").doc(messageId), { status });
    const result = { messageId, status };
    tx.create(commandRef, { type: "reviewMessage", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: `message.${status}`, actorUid: teacherUid,
      roundId, messageId, requestId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const hideMessage = onCall(async (request) => {
  const input = requireRecord(request.data);
  const messageId = requireDocumentId(input.messageId, "쪽지");
  const student = await requireStudentRound(request);
  const ref = student.roundRef.collection("studentData").doc(student.uid).collection("inboxItems").doc(messageId);
  const item = await ref.get();
  if (!item.exists) throw new HttpsError("not-found", "쪽지를 찾지 못했어요.");
  await ref.update({ hidden: true, updatedAt: FieldValue.serverTimestamp() });
  return { messageId, hidden: true };
});

export const createHelpRequest = onCall(async (request) => {
  const input = requireRecord(request.data);
  const requestId = requireRequestId(input.requestId);
  const category = input.category;
  if (!["uncomfortable", "message", "other"].includes(String(category))) {
    throw new HttpsError("invalid-argument", "도움 종류를 선택해 주세요.");
  }
  const note = input.note === undefined || input.note === "" ? "" : requireText(input.note, "도움 설명", 300);
  const messageId = input.messageId === undefined ? null : requireDocumentId(input.messageId, "쪽지");
  const student = await requireStudentRound(request);
  const commandRef = student.roundRef.collection("studentCommands").doc(`${student.uid}_${requestId}`);
  const helpRef = student.roundRef.collection("helpSecrets").doc();
  const fingerprint = inputFingerprint({ category, note, messageId });
  return db.runTransaction(async (tx) => {
    await assertStudentTransaction(tx, student.classId, student.uid, request.auth?.token.sessionVersion, student.roundId);
    const [round, participant, command, inbox] = await Promise.all([
      tx.get(student.roundRef), tx.get(student.roundRef.collection("participants").doc(student.uid)),
      tx.get(commandRef), messageId ? tx.get(student.roundRef.collection("studentData").doc(student.uid).collection("inboxItems").doc(messageId)) : Promise.resolve(null),
    ]);
    if (command.exists) {
      assertSameCommand(command.data(), "createHelpRequest", student.uid, fingerprint);
      return command.get("result") as { helpId: string };
    }
    if (!["active", "paused", "reveal_pending"].includes(round.get("status"))
      || participant.get("participationStatus") !== "active" || (messageId && !inbox?.exists)) {
      throw new HttpsError("failed-precondition", "도움 요청을 보낼 수 없어요.");
    }
    const result = { helpId: helpRef.id };
    tx.create(helpRef, { studentUid: student.uid, category, note, messageId,
      status: "open", createdAt: FieldValue.serverTimestamp() });
    tx.create(student.roundRef.collection("studentData").doc(student.uid).collection("helpRequests").doc(helpRef.id), {
      category, status: "open", createdAt: FieldValue.serverTimestamp(),
    });
    if (messageId && inbox) tx.update(inbox.ref, { hidden: true, reported: true });
    tx.create(commandRef, { type: "createHelpRequest", requestedBy: student.uid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const resolveHelpRequest = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const helpId = requireDocumentId(input.helpId, "도움 요청");
  const requestId = requireRequestId(input.requestId);
  const resolution = requireText(input.resolution, "처리 내용", 300);
  const { classRef, roundRef } = await requireTeacherRound(teacherUid, classId, roundId);
  const helpRef = roundRef.collection("helpSecrets").doc(helpId);
  const commandRef = classRef.collection("commands").doc(requestId);
  const fingerprint = inputFingerprint({ classId, roundId, helpId, resolution });
  return db.runTransaction(async (tx) => {
    const [classDoc, help, command] = await Promise.all([tx.get(classRef), tx.get(helpRef), tx.get(commandRef)]);
    assertClassTeacher(classDoc.data(), teacherUid);
    if (command.exists) {
      assertSameCommand(command.data(), "resolveHelpRequest", teacherUid, fingerprint);
      return { helpId, status: "resolved" };
    }
    if (!help.exists || help.get("status") !== "open") {
      throw new HttpsError("failed-precondition", "처리 대기 중인 요청이 아니에요.");
    }
    tx.update(helpRef, { status: "resolved", resolution, resolvedBy: teacherUid,
      resolvedAt: FieldValue.serverTimestamp() });
    tx.update(roundRef.collection("studentData").doc(help.get("studentUid")).collection("helpRequests").doc(helpId), {
      status: "resolved",
    });
    tx.create(commandRef, { type: "resolveHelpRequest", requestedBy: teacherUid,
      inputFingerprint: fingerprint, result: { helpId, status: "resolved" }, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "help.resolved", actorUid: teacherUid,
      roundId, helpId, requestId, createdAt: FieldValue.serverTimestamp() });
    return { helpId, status: "resolved" };
  });
});

export const getTeacherRoundOverview = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "회차");
  const { classRef, roundRef, roundDoc } = await requireTeacherRound(teacherUid, classId, roundId);
  const [helps, messages, participants, members] = await Promise.all([
    roundRef.collection("helpSecrets").get(), roundRef.collection("messageSecrets").get(),
    roundRef.collection("participants").get(), classRef.collection("members").get(),
  ]);
  const names = new Map(members.docs.map((doc) => [doc.id, doc.get("displayName") as string]));
  await classRef.collection("auditLogs").add({ action: "round.teacher_overview", actorUid: teacherUid,
    roundId, createdAt: FieldValue.serverTimestamp() });
  return {
    roundId, status: roundDoc.get("status"), activityDates: roundDoc.get("activityDates"),
    helps: helps.docs.filter((doc) => doc.get("status") === "open").map((doc) => ({
      helpId: doc.id, studentName: names.get(doc.get("studentUid")), category: doc.get("category"),
      note: doc.get("note"), messageId: doc.get("messageId"),
    })),
    pendingMessages: messages.docs.filter((doc) => doc.get("status") === "pending").map((doc) => ({
      messageId: doc.id, senderName: names.get(doc.get("senderUid")),
      receiverName: names.get(doc.get("receiverUid")), text: doc.get("text"),
    })),
    participation: participants.docs.map((doc) => ({ studentUid: doc.id,
      displayName: names.get(doc.id), status: doc.get("participationStatus") })),
  };
});
