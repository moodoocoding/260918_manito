import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  credentialLookupDigest,
  normalizeCode,
  parseStudentCard,
  verifySecret,
} from "../auth/codes.js";
import { auth, db } from "../shared/firebase.js";
import { requireRecord } from "../shared/validation.js";

const maximumFailures = 5;
const lockMinutes = 15;

function invalidLogin(): HttpsError {
  return new HttpsError("unauthenticated", "학급 코드 또는 개인 코드가 올바르지 않아요.");
}

export const loginStudent = onCall(
  { timeoutSeconds: 30 },
  async (request): Promise<{ customToken: string; classId: string }> => {
    const input = requireRecord(request.data);
    if (typeof input.classCode !== "string" || typeof input.cardCode !== "string") {
      throw invalidLogin();
    }
    const classCode = normalizeCode(input.classCode);
    const parsedCard = parseStudentCard(input.cardCode);
    if (classCode.length !== 8 || !parsedCard) throw invalidLogin();

    const classCodeSnapshot = await db.doc(`classCodes/${classCode}`).get();
    if (!classCodeSnapshot.exists || classCodeSnapshot.get("status") !== "active") {
      throw invalidLogin();
    }
    const classId = String(classCodeSnapshot.get("classId"));
    const lookupDigest = credentialLookupDigest(classId, parsedCard.loginId);
    const lookupSnapshot = await db.doc(`studentCredentialLookups/${lookupDigest}`).get();
    if (!lookupSnapshot.exists || lookupSnapshot.get("classId") !== classId) throw invalidLogin();

    const studentUid = String(lookupSnapshot.get("studentUid"));
    const credentialRef = db.doc(`studentCredentials/${studentUid}`);
    const credential = await credentialRef.get();
    if (!credential.exists || credential.get("lookupDigest") !== lookupDigest) throw invalidLogin();

    const lockedUntil = credential.get("lockedUntil") as Timestamp | null;
    if (lockedUntil && lockedUntil.toMillis() > Date.now()) {
      throw new HttpsError("resource-exhausted", "잠시 뒤 다시 시도해 주세요.");
    }

    const valid = await verifySecret(
      parsedCard.secret,
      String(credential.get("secretHash")),
      String(credential.get("secretSalt")),
    );
    if (!valid) {
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(credentialRef);
        if (
          !current.exists
          || current.get("lookupDigest") !== lookupDigest
          || current.get("secretHash") !== credential.get("secretHash")
          || current.get("codeVersion") !== credential.get("codeVersion")
        ) return;
        const failures = Number(current.get("failedAttempts") ?? 0) + 1;
        transaction.update(credentialRef, {
          failedAttempts: failures,
          lockedUntil: failures >= maximumFailures
            ? Timestamp.fromMillis(Date.now() + lockMinutes * 60_000)
            : null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      throw invalidLogin();
    }

    const memberRef = db.doc(`classes/${classId}/members/${studentUid}`);
    const classRef = db.doc(`classes/${classId}`);
    const classCodeRef = db.doc(`classCodes/${classCode}`);
    // A rotation can happen while scrypt runs. Commit the login only if the
    // credential, lookup, class and member still describe the card we checked.
    const sessionVersion = await db.runTransaction(async (transaction) => {
      const [currentCode, currentLookup, currentCredential, classSnapshot, memberSnapshot] =
        await Promise.all([
          transaction.get(classCodeRef),
          transaction.get(db.doc(`studentCredentialLookups/${lookupDigest}`)),
          transaction.get(credentialRef),
          transaction.get(classRef),
          transaction.get(memberRef),
        ]);
      if (
        !currentCode.exists || currentCode.get("status") !== "active"
        || currentCode.get("classId") !== classId
        || !currentLookup.exists || currentLookup.get("studentUid") !== studentUid
        || !currentCredential.exists
        || currentCredential.get("lookupDigest") !== lookupDigest
        || currentCredential.get("secretHash") !== credential.get("secretHash")
        || currentCredential.get("secretSalt") !== credential.get("secretSalt")
        || currentCredential.get("codeVersion") !== credential.get("codeVersion")
        || !classSnapshot.exists || classSnapshot.get("status") !== "active"
        || !memberSnapshot.exists || memberSnapshot.get("accessStatus") !== "active"
        || memberSnapshot.get("sessionVersion") !== currentCredential.get("sessionVersion")
      ) throw invalidLogin();
      const currentLock = currentCredential.get("lockedUntil") as Timestamp | null;
      if (currentLock && currentLock.toMillis() > Date.now()) {
        throw new HttpsError("resource-exhausted", "잠시 뒤 다시 시도해 주세요.");
      }
      transaction.update(credentialRef, {
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(memberRef, { lastLoginAt: FieldValue.serverTimestamp() });
      return Number(memberSnapshot.get("sessionVersion"));
    });
    const customToken = await auth.createCustomToken(studentUid, {
      role: "student",
      classId,
      memberId: studentUid,
      sessionVersion,
    });
    return { customToken, classId };
  },
);
