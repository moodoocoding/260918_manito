import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";

export function requireFreshAppCheck(request: CallableRequest<unknown>): void {
  if (request.app?.alreadyConsumed === true) {
    throw new HttpsError("permission-denied", "요청을 다시 시작해 주세요.");
  }
}
