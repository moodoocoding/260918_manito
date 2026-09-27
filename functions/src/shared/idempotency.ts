import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";

export function inputFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertSameCommand(
  command: FirebaseFirestore.DocumentData | undefined,
  type: string,
  requestedBy: string,
  fingerprint: string,
): void {
  if (
    !command
    || command.type !== type
    || command.requestedBy !== requestedBy
    || command.inputFingerprint !== fingerprint
  ) {
    throw new HttpsError("already-exists", "요청 식별자가 다른 작업에 이미 사용되었어요.");
  }
}
