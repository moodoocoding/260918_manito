import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../shared/firebase.js";

export const getTeacherStatus = onCall( async (request) => {
  const uid = request.auth?.uid;
  if (!uid || request.auth?.token.role === "student") {
    throw new HttpsError("unauthenticated", "교사 로그인이 필요해요.");
  }
  const teacher = await db.doc(`teachers/${uid}`).get();
  const status = teacher.get("verificationStatus");
  return {
    status: status === "suspended" ? "suspended" :
      status === "verified"
      && request.auth?.token.role === "teacher"
      && request.auth?.token.teacherVerified === true ? "verified" : "pending",
    displayName: typeof teacher.get("displayName") === "string" ? teacher.get("displayName") : "",
  };
});
