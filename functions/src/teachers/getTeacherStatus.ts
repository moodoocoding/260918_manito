import { onCall } from "firebase-functions/v2/https";
import { ensureVerifiedTeacherAccount } from "../shared/authorization.js";

export const getTeacherStatus = onCall(async (request) => {
  const result = await ensureVerifiedTeacherAccount(request);
  return {
    status: result.status,
    displayName: result.displayName,
  };
});
