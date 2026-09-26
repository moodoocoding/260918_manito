import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";

export async function requireVerifiedTeacher(request: CallableRequest<unknown>): Promise<string> {
  const uid = request.auth?.uid;
  if (
    !uid
    || request.auth?.token.role !== "teacher"
    || request.auth?.token.teacherVerified !== true
  ) {
    throw new HttpsError("permission-denied", "확인된 교사 계정이 필요해요.");
  }

  const teacher = await db.doc(`teachers/${uid}`).get();
  if (!teacher.exists || teacher.get("verificationStatus") !== "verified") {
    throw new HttpsError("permission-denied", "교사 확인이 완료되지 않았어요.");
  }
  return uid;
}

export function assertClassTeacher(
  classData: FirebaseFirestore.DocumentData | undefined,
  teacherUid: string,
): void {
  if (
    !classData
    || classData.status !== "active"
    || !Array.isArray(classData.teacherUids)
    || !classData.teacherUids.includes(teacherUid)
  ) {
    throw new HttpsError("permission-denied", "이 학급을 관리할 권한이 없어요.");
  }
}

