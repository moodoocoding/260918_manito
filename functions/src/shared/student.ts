import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";
import type { Transaction } from "firebase-admin/firestore";

export async function requireActiveStudent(request: CallableRequest<unknown>) {
  const uid = request.auth?.uid;
  const token = request.auth?.token;
  if (!uid || token?.role !== "student" || token.memberId !== uid || typeof token.classId !== "string") {
    throw new HttpsError("permission-denied", "학생 계정을 확인해 주세요.");
  }
  const classId = token.classId as string;
  const classRef = db.doc(`classes/${classId}`);
  const [classDoc, member] = await Promise.all([
    classRef.get(), classRef.collection("members").doc(uid).get(),
  ]);
  if (!classDoc.exists || classDoc.get("status") !== "active" || !member.exists
    || member.get("accessStatus") !== "active" || member.get("sessionVersion") !== token.sessionVersion) {
    throw new HttpsError("permission-denied", "입장 카드가 변경되었어요. 선생님께 확인해 주세요.");
  }
  return { uid, classId, classRef, classDoc, member };
}

export async function requireStudentRound(request: CallableRequest<unknown>, inputRoundId?: string) {
  const student = await requireActiveStudent(request);
  const roundId = inputRoundId ?? student.classDoc.get("activeRoundId");
  if (typeof roundId !== "string" || student.classDoc.get("activeRoundId") !== roundId) {
    throw new HttpsError("failed-precondition", "참여 중인 회차가 없어요.");
  }
  const roundRef = student.classRef.collection("rounds").doc(roundId);
  const [roundDoc, participation] = await Promise.all([
    roundRef.get(), roundRef.collection("participants").doc(student.uid).get(),
  ]);
  if (!roundDoc.exists || !participation.exists || participation.get("participationStatus") !== "active") {
    throw new HttpsError("permission-denied", "이 회차에 참여할 수 없어요.");
  }
  return { ...student, roundId, roundRef, roundDoc };
}

export async function assertStudentTransaction(tx: Transaction, classId: string, uid: string,
  sessionVersion: unknown, roundId: string) {
  const classRef = db.doc(`classes/${classId}`);
  const [classDoc, member] = await Promise.all([
    tx.get(classRef), tx.get(classRef.collection("members").doc(uid)),
  ]);
  if (classDoc.get("status") !== "active" || classDoc.get("activeRoundId") !== roundId
    || member.get("accessStatus") !== "active" || member.get("sessionVersion") !== sessionVersion) {
    throw new HttpsError("permission-denied", "입장 상태가 변경됐어요. 다시 입장해 주세요.");
  }
}
