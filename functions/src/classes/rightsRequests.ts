import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { db } from "../shared/firebase.js";
import { assertSameCommand, inputFingerprint } from "../shared/idempotency.js";
import { requireActiveStudent } from "../shared/student.js";
import { requireDocumentId, requireRecord, requireRequestId, requireText } from "../shared/validation.js";

export const createRightsRequest = onCall(async (request) => {
  const student = await requireActiveStudent(request);
  const input = requireRecord(request.data);
  const requestId = requireRequestId(input.requestId);
  const kind = input.kind;
  if (!["access", "correction", "deletion"].includes(String(kind))) {
    throw new HttpsError("invalid-argument", "요청 종류를 선택해 주세요.");
  }
  const note = input.note === undefined || input.note === "" ? "" : requireText(input.note, "요청 내용", 300);
  const commandRef = student.classRef.collection("rightsCommands").doc(`${student.uid}_${requestId}`);
  const rightsRef = student.classRef.collection("rightsRequests").doc();
  const fingerprint = inputFingerprint({kind,note});
  return db.runTransaction(async (tx) => {
    const [classDoc, member, command] = await Promise.all([
      tx.get(student.classRef), tx.get(student.classRef.collection("members").doc(student.uid)),
      tx.get(commandRef),
    ]);
    if (classDoc.get("status") !== "active" || member.get("accessStatus") !== "active"
      || member.get("sessionVersion") !== request.auth?.token.sessionVersion) {
      throw new HttpsError("permission-denied", "입장 상태가 변경됐어요.");
    }
    if (command.exists) {
      assertSameCommand(command.data(), "createRightsRequest", student.uid, fingerprint);
      return command.get("result") as {rightsRequestId:string;status:string};
    }
    const result = {rightsRequestId:rightsRef.id,status:"received"};
    tx.create(rightsRef, {studentUid:student.uid,kind,note,status:"received",
      createdAt:FieldValue.serverTimestamp()});
    tx.create(commandRef, {type:"createRightsRequest",requestedBy:student.uid,
      inputFingerprint:fingerprint,result,createdAt:FieldValue.serverTimestamp()});
    return result;
  });
});

export const listMyRightsRequests = onCall(async (request) => {
  const student = await requireActiveStudent(request);
  const requests = await student.classRef.collection("rightsRequests").where("studentUid","==",student.uid).get();
  return { requests: requests.docs.map((doc) => ({rightsRequestId:doc.id,kind:doc.get("kind"),
    status:doc.get("status"),createdAt:doc.get("createdAt")?.toDate()?.toISOString()})) };
});

export const getRightsRequestsForTeacher = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId,"학급");
  const classRef = db.doc(`classes/${classId}`);
  const classDoc = await classRef.get();
  assertClassTeacher(classDoc.data(),teacherUid);
  const [requests,members] = await Promise.all([
    classRef.collection("rightsRequests").get(),classRef.collection("members").get(),
  ]);
  const names = new Map(members.docs.map((doc)=>[doc.id,doc.get("displayName") as string]));
  await classRef.collection("auditLogs").add({action:"rights.teacher_read",actorUid:teacherUid,
    createdAt:FieldValue.serverTimestamp()});
  return {requests:requests.docs.map((doc)=>({rightsRequestId:doc.id,
    studentName:names.get(doc.get("studentUid")),kind:doc.get("kind"),note:doc.get("note"),
    status:doc.get("status"),createdAt:doc.get("createdAt")?.toDate()?.toISOString()}))};
});
