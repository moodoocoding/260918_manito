import { FieldValue } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { auth, db } from "./firebase.js";

export async function ensureVerifiedTeacherAccount(
  request: CallableRequest<unknown>,
): Promise<{ uid: string; status: "verified" | "suspended"; displayName: string }> {
  const uid = request.auth?.uid;
  if (!uid || request.auth?.token.role === "student") {
    throw new HttpsError("unauthenticated", "교사 로그인이 필요해요.");
  }

  const teacherRef = db.doc(`teachers/${uid}`);
  const teacher = await teacherRef.get();
  const tokenName = typeof request.auth?.token.name === "string" ? request.auth.token.name : "";
  const existingName = typeof teacher.get("displayName") === "string" ? teacher.get("displayName") : "";
  const displayName = existingName || tokenName;

  if (teacher.exists && teacher.get("verificationStatus") === "suspended") {
    return { uid, status: "suspended", displayName };
  }

  if (!teacher.exists || teacher.get("verificationStatus") !== "verified" || (!existingName && tokenName)) {
    await teacherRef.set(
      {
        displayName,
        verificationStatus: "verified",
        ...(teacher.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (request.auth?.token.role !== "teacher" || request.auth?.token.teacherVerified !== true) {
    await auth.setCustomUserClaims(uid, {
      role: "teacher",
      teacherVerified: true,
    }).catch(() => undefined);
  }

  return { uid, status: "verified", displayName };
}

export async function requireVerifiedTeacher(request: CallableRequest<unknown>): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid || request.auth?.token.role === "student") {
    throw new HttpsError("permission-denied", "확인된 교사 계정이 필요해요.");
  }

  const result = await ensureVerifiedTeacherAccount(request);
  if (result.status !== "verified") {
    throw new HttpsError("permission-denied", "교사 확인이 완료되지 않았어요.");
  }
  return result.uid;
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
