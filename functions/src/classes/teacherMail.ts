import { FieldValue, type DocumentReference, type DocumentSnapshot, type Query, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { requireActiveStudent } from "../shared/student.js";
import { requireDocumentId, requireRecord, requireRequestId } from "../shared/validation.js";
import { parseTeacherMailContent, teacherMailText, type TeacherMailKind, type TeacherMailStatus } from "./teacherMailValidation.js";

const pageSize = 20;

async function assertStudentAccess(tx: Transaction, classRef: DocumentReference, uid: string, sessionVersion: unknown) {
  const [classDoc, member] = await Promise.all([
    tx.get(classRef), tx.get(classRef.collection("members").doc(uid)),
  ]);
  if (!classDoc.exists || classDoc.get("status") !== "active" || !member.exists
    || member.get("accessStatus") !== "active" || member.get("sessionVersion") !== sessionVersion) {
    throw new HttpsError("permission-denied", "입장 상태가 변경됐어요. 다시 입장해 주세요.");
  }
  return member;
}

async function assertTeacherAccess(tx: Transaction, classRef: DocumentReference, teacherUid: string) {
  const [classDoc, teacher] = await Promise.all([
    tx.get(classRef), tx.get(db.doc(`teachers/${teacherUid}`)),
  ]);
  assertClassTeacher(classDoc.data(), teacherUid);
  if (!teacher.exists || teacher.get("verificationStatus") !== "verified") {
    throw new HttpsError("permission-denied", "교사 확인이 필요해요.");
  }
}

function receipt(doc: DocumentSnapshot) {
  return {
    mailId: doc.id,
    kind: doc.get("kind") as TeacherMailKind,
    status: doc.get("status") as TeacherMailStatus,
    createdAt: doc.get("createdAt")?.toDate()?.toISOString() ?? "",
    ...(doc.get("resolvedAt") ? { resolvedAt: doc.get("resolvedAt").toDate().toISOString() } : {}),
  };
}

function cursorId(value: unknown) {
  return value === undefined ? null : requireDocumentId(value, "목록 위치");
}

export const createTeacherMail = onCall(async (request) => {
  const student = await requireActiveStudent(request);
  const input = requireRecord(request.data);
  const requestId = requireRequestId(input.requestId);
  const content = parseTeacherMailContent(input);
  const fingerprint = inputFingerprint(content);
  const mailRef = student.classRef.collection("teacherMailSecrets").doc();
  const commandRef = student.classRef.collection("teacherMailCommands").doc(`${student.uid}_${requestId}`);
  return db.runTransaction(async (tx) => {
    const member = await assertStudentAccess(tx, student.classRef, student.uid, request.auth?.token.sessionVersion);
    const command = await tx.get(commandRef);
    if (command.exists) {
      assertSameCommand(command.data(), "createTeacherMail", student.uid, fingerprint);
      return command.get("result") as { mailId: string; status: "received" };
    }
    const result = { mailId: mailRef.id, status: "received" as const };
    tx.create(mailRef, { ...content, studentUid: student.uid,
      studentName: member.get("displayName") ?? "학생", status: "received",
      createdAt: FieldValue.serverTimestamp() });
    tx.create(student.classRef.collection("members").doc(student.uid).collection("teacherMailReceipts").doc(mailRef.id), {
      kind: content.kind, status: "received", createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(commandRef, { type: "createTeacherMail", requestedBy: student.uid,
      inputFingerprint: fingerprint, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const listMyTeacherMail = onCall(async (request) => {
  const student = await requireActiveStudent(request);
  const input = request.data == null ? {} : requireRecord(request.data);
  const cursor = cursorId(input.cursor);
  const collection = student.classRef.collection("members").doc(student.uid).collection("teacherMailReceipts");
  return db.runTransaction(async (tx) => {
    await assertStudentAccess(tx, student.classRef, student.uid, request.auth?.token.sessionVersion);
    let query: Query = collection.orderBy("createdAt", "desc");
    if (cursor) {
      const position = await tx.get(collection.doc(cursor));
      if (!position.exists) throw new HttpsError("invalid-argument", "목록 위치가 바뀌었어요. 처음부터 확인해 주세요.");
      query = query.startAfter(position);
    }
    const docs = await tx.get(query.limit(pageSize + 1));
    const items = docs.docs.slice(0, pageSize).map(receipt);
    return { items, nextCursor: docs.size > pageSize ? items.at(-1)!.mailId : null };
  });
});

export const listTeacherMail = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const kind = input.kind;
  const status = input.status;
  if ((kind !== "letter" && kind !== "report") || (status !== "received" && status !== "resolved")) {
    throw new HttpsError("invalid-argument", "편지 종류와 처리 상태를 선택해 주세요.");
  }
  const cursor = cursorId(input.cursor);
  const classRef = db.doc(`classes/${classId}`);
  const collection = classRef.collection("teacherMailSecrets");
  return db.runTransaction(async (tx) => {
    await assertTeacherAccess(tx, classRef, teacherUid);
    let query: Query = collection.where("kind", "==", kind).where("status", "==", status).orderBy("createdAt", "desc");
    if (cursor) {
      const position = await tx.get(collection.doc(cursor));
      if (!position.exists || position.get("kind") !== kind || position.get("status") !== status) {
        throw new HttpsError("invalid-argument", "목록 위치가 바뀌었어요. 처음부터 확인해 주세요.");
      }
      query = query.startAfter(position);
    }
    const docs = await tx.get(query.limit(pageSize + 1));
    const items = docs.docs.slice(0, pageSize).map((doc) => ({ ...receipt(doc), studentName: doc.get("studentName") as string }));
    tx.create(classRef.collection("auditLogs").doc(), { action: "teacher_mail.list", actorUid: teacherUid,
      kind, status, createdAt: FieldValue.serverTimestamp() });
    return { items, nextCursor: docs.size > pageSize ? items.at(-1)!.mailId : null };
  });
});

export const getTeacherMail = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const mailId = requireDocumentId(input.mailId, "편지");
  const classRef = db.doc(`classes/${classId}`);
  return db.runTransaction(async (tx) => {
    await assertTeacherAccess(tx, classRef, teacherUid);
    const mail = await tx.get(classRef.collection("teacherMailSecrets").doc(mailId));
    if (!mail.exists) throw new HttpsError("not-found", "편지를 찾지 못했어요.");
    tx.create(classRef.collection("auditLogs").doc(), { action: "teacher_mail.read", actorUid: teacherUid,
      mailId, createdAt: FieldValue.serverTimestamp() });
    return { ...receipt(mail), studentName: mail.get("studentName") as string,
      ...(mail.get("kind") === "letter" ? { letter: mail.get("letter") } : { report: mail.get("report") }),
      ...(typeof mail.get("resolution") === "string" ? { resolution: mail.get("resolution") } : {}) };
  });
});

export const resolveTeacherMail = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const mailId = requireDocumentId(input.mailId, "편지");
  const requestId = requireRequestId(input.requestId);
  const resolution = teacherMailText(input.resolution, "처리 기록", 1000, true);
  const fingerprint = inputFingerprint({ classId, mailId, resolution });
  const classRef = db.doc(`classes/${classId}`);
  const commandRef = classRef.collection("teacherMailCommands").doc(`${teacherUid}_${requestId}`);
  return db.runTransaction(async (tx) => {
    await assertTeacherAccess(tx, classRef, teacherUid);
    const [mail, command] = await Promise.all([
      tx.get(classRef.collection("teacherMailSecrets").doc(mailId)), tx.get(commandRef),
    ]);
    if (command.exists) {
      assertSameCommand(command.data(), "resolveTeacherMail", teacherUid, fingerprint);
      return command.get("result") as { mailId: string; status: "resolved" };
    }
    if (!mail.exists || mail.get("status") !== "received") {
      throw new HttpsError("failed-precondition", "아직 처리하지 않은 편지를 선택해 주세요.");
    }
    const receiptRef = classRef.collection("members").doc(mail.get("studentUid")).collection("teacherMailReceipts").doc(mailId);
    const studentReceipt = await tx.get(receiptRef);
    const result = { mailId, status: "resolved" as const };
    tx.update(mail.ref, { status: "resolved", resolution, resolvedBy: teacherUid, resolvedAt: FieldValue.serverTimestamp() });
    if (studentReceipt.exists) tx.update(receiptRef, { status: "resolved", resolvedAt: FieldValue.serverTimestamp() });
    tx.create(commandRef, { type: "resolveTeacherMail", requestedBy: teacherUid, inputFingerprint: fingerprint,
      result, createdAt: FieldValue.serverTimestamp() });
    tx.create(classRef.collection("auditLogs").doc(), { action: "teacher_mail.resolved", actorUid: teacherUid,
      mailId, requestId, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});
