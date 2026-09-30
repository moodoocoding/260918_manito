import {FieldValue} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireVerifiedTeacher} from "../shared/authorization.js";
import {db} from "../shared/firebase.js";
import {requireDocumentId, requireRecord} from "../shared/validation.js";
import {requireTeacherRound} from "./common.js";
import {classifyMail} from "./mailTimeline.js";

type MissionPlan = {missionId:string; text:string; category?:string};
type MissionView = {missionId:string; text:string; status:string};

function currentMissions(plan: MissionPlan[] | undefined,
  records: FirebaseFirestore.QuerySnapshot): MissionView[] {
  const byId = new Map(records.docs.map((doc) => [doc.id, doc]));
  const items = plan
    ? [...plan.map((item) => ({missionId:item.missionId, text:item.text,
      status:String(byId.get(item.missionId)?.get("status") ?? "todo")})),
      ...records.docs.filter((doc) => !plan.some((item) => item.missionId === doc.id))
        .map((doc) => ({missionId:doc.id, text:String(doc.get("text") ?? ""),
          status:String(doc.get("status") ?? "todo")}))]
    : records.docs.map((doc) => ({missionId:doc.id, text:String(doc.get("text") ?? ""),
      status:String(doc.get("status") ?? "todo")}));
  return items.filter((item) => item.status !== "replaced");
}

function usableStatus(value: string): "done" | "skipped" | "todo" {
  return value === "done" || value === "skipped" ? value : "todo";
}

export const getTeacherStudentStatus = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "시즌");
  const {classRef, roundRef, roundDoc} = await requireTeacherRound(teacherUid, classId, roundId);
  const [participants, members] = await Promise.all([
    roundRef.collection("participants").get(), classRef.collection("members").get(),
  ]);
  const names = new Map(members.docs.map((doc) => [doc.id, String(doc.get("displayName") ?? "")]));
  const plan = roundDoc.get("missionPlan") as MissionPlan[] | undefined;
  const students = await Promise.all(participants.docs.map(async (participant) => {
    const dataRef = roundRef.collection("studentData").doc(participant.id);
    const [missions, sent] = await Promise.all([
      dataRef.collection("missions").get(), dataRef.collection("sentMessages").get(),
    ]);
    const list = currentMissions(plan, missions);
    return {studentUid:participant.id, displayName:names.get(participant.id) ?? "등록 해제 학생",
      participationStatus:participant.get("participationStatus") ?? "active",
      completedMissions:list.filter((mission) => mission.status === "done").length,
      totalMissions:list.length,
      sentMessages:sent.docs.filter((doc) => ["delivered", "moderated"].includes(doc.get("status"))).length};
  }));
  await classRef.collection("auditLogs").add({action:"round.teacher_student_status",actorUid:teacherUid,
    roundId,createdAt:FieldValue.serverTimestamp()});
  return {roundId, students:students.sort((a,b) => a.displayName.localeCompare(b.displayName,"ko"))};
});

export const getTeacherStudentDetail = onCall(async (request) => {
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const roundId = requireDocumentId(input.roundId, "시즌");
  const studentUid = requireDocumentId(input.studentUid, "학생");
  const {classRef, roundRef, roundDoc} = await requireTeacherRound(teacherUid, classId, roundId);
  const participant = await roundRef.collection("participants").doc(studentUid).get();
  if (!participant.exists) throw new HttpsError("permission-denied", "이 시즌의 참가자가 아니에요.");
  const dataRef = roundRef.collection("studentData").doc(studentUid);
  const [members, missions, inbox, sent, assignments] = await Promise.all([
    classRef.collection("members").get(), dataRef.collection("missions").get(),
    dataRef.collection("inboxItems").get(), dataRef.collection("sentMessages").get(),
    roundRef.collection("assignments").get(),
  ]);
  const names = new Map(members.docs.map((doc) => [doc.id, String(doc.get("displayName") ?? "등록 해제 학생")]));
  const receiverByGiver = new Map(assignments.docs.map((doc) => [doc.id, String(doc.get("receiverUid") ?? "")]));
  const giverByReceiver = new Map(assignments.docs.map((doc) => [String(doc.get("receiverUid") ?? ""), doc.id]));
  const targetUid = receiverByGiver.get(studentUid);
  const carerUid = giverByReceiver.get(studentUid);
  const targetDisplayName = targetUid ? (names.get(targetUid) ?? "등록 해제 학생") : null;
  const carerDisplayName = carerUid ? (names.get(carerUid) ?? "등록 해제 학생") : null;

  const mailCopies = [
    ...inbox.docs.map((doc) => ({
      messageId: doc.id,
      direction: "inbox" as const,
      replyToMessageId: (doc.get("replyToMessageId") as string | undefined) ?? null,
      createdAtMillis: Number(doc.get("createdAt")?.toMillis() ?? 0),
    })),
    ...sent.docs.map((doc) => ({
      messageId: doc.id,
      direction: "sent" as const,
      replyToMessageId: (doc.get("replyToMessageId") as string | undefined) ?? null,
      createdAtMillis: Number(doc.get("createdAt")?.toMillis() ?? 0),
    })),
  ];
  const mailTimeline = classifyMail(mailCopies);

  const thankCopies = inbox.docs.filter((doc) => doc.get("type") === "thanks" && doc.id.startsWith("thanks_"));
  const messageIds = [...new Set([...inbox.docs.filter((doc) => doc.get("type") !== "thanks"),
    ...sent.docs].map((doc) => doc.id))];
  const secrets: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let offset = 0; offset < messageIds.length; offset += 100) {
    secrets.push(...await db.getAll(...messageIds.slice(offset, offset + 100).map((id) =>
      roundRef.collection("messageSecrets").doc(id))));
  }
  const messages = secrets.map((doc) => {
    if (!doc.exists) throw new HttpsError("failed-precondition", "쪽지 기록을 확인할 수 없어요.");
    const senderUid = doc.get("senderUid") as string;
    const receiverUid = doc.get("receiverUid") as string;
    if (senderUid !== studentUid && receiverUid !== studentUid) {
      throw new HttpsError("failed-precondition", "학생의 쪽지 기록이 올바르지 않아요.");
    }
    const timeline = mailTimeline.get(doc.id);
    let conversation: "caredFor" | "carer" | "unknown" = timeline?.conversation ?? "unknown";
    if (conversation === "unknown") {
      if ((senderUid === studentUid && receiverUid === targetUid) || (senderUid === targetUid && receiverUid === studentUid)) {
        conversation = "caredFor";
      } else if ((senderUid === carerUid && receiverUid === studentUid) || (senderUid === studentUid && receiverUid === carerUid)) {
        conversation = "carer";
      }
    }
    return {messageId:doc.id, direction:senderUid === studentUid ? "sent" : "received",
      conversation,
      senderName:names.get(senderUid) ?? "등록 해제 학생",
      receiverName:names.get(receiverUid) ?? "등록 해제 학생",
      text:String(doc.get("text") ?? ""), status:String(doc.get("status") ?? "unknown"),
      date:String(doc.get("date") ?? ""),
      createdAtMillis:Number(doc.get("createdAt")?.toMillis() ?? 0)};
  });
  for (const copy of thankCopies) {
    const senderUid = copy.id.slice("thanks_".length);
    const thank = await roundRef.collection("thankYouSecrets").doc(senderUid).get();
    if (!thank.exists || thank.get("receiverUid") !== studentUid || thank.get("senderUid") !== senderUid) {
      throw new HttpsError("failed-precondition", "감사 쪽지 기록을 확인할 수 없어요.");
    }
    messages.push({messageId:copy.id, direction:"received", conversation:"caredFor",
      senderName:names.get(senderUid) ?? "등록 해제 학생",
      receiverName:names.get(studentUid) ?? "등록 해제 학생", text:String(thank.get("text") ?? ""),
      status:"delivered", date:"감사 인사", createdAtMillis:Number(thank.get("createdAt")?.toMillis() ?? 0)});
  }
  messages.sort((a,b) => b.createdAtMillis - a.createdAtMillis || b.messageId.localeCompare(a.messageId));
  const plan = roundDoc.get("missionPlan") as MissionPlan[] | undefined;
  const missionList = currentMissions(plan, missions).map((mission) => ({...mission,
    status:usableStatus(mission.status)}));
  await classRef.collection("auditLogs").add({action:"round.teacher_student_detail",actorUid:teacherUid,
    roundId, studentUid, messageCount:messages.length,createdAt:FieldValue.serverTimestamp()});
  return {roundId, studentUid, displayName:names.get(studentUid) ?? "등록 해제 학생",
    targetDisplayName,
    carerDisplayName,
    missions:missionList,
    messages:messages.map(({createdAtMillis, ...message}) => message)};
});
