import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const scrypt = promisify(scryptCallback);

export function randomCode(length: number): string {
  if (!Number.isInteger(length) || length < 1 || length > 64) {
    throw new RangeError("Code length must be between 1 and 64.");
  }
  let result = "";
  while (result.length < length) {
    const bytes = randomBytes(length);
    for (const byte of bytes) {
      const unbiasedLimit = 256 - (256 % alphabet.length);
      if (byte < unbiasedLimit) {
        result += alphabet[byte % alphabet.length];
        if (result.length === length) break;
      }
    }
  }
  return result;
}

export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface GeneratedStudentCard {
  loginId: string;
  secret: string;
  cardCode: string;
}

export function generateClassCode(): string {
  return randomCode(8);
}

export function generateStudentCard(): GeneratedStudentCard {
  const loginId = randomCode(4);
  const secret = randomCode(8);
  return { loginId, secret, cardCode: `${loginId}-${secret}` };
}

export function parseStudentCard(value: string): { loginId: string; secret: string } | null {
  const normalized = normalizeCode(value);
  if (normalized.length !== 12) return null;
  return {
    loginId: normalized.slice(0, 4),
    secret: normalized.slice(4),
  };
}

export function credentialLookupDigest(classId: string, loginId: string): string {
  return createHash("sha256")
    .update(`v1:${classId}:${normalizeCode(loginId)}`)
    .digest("hex");
}

export async function hashSecret(
  secret: string,
  salt = randomBytes(16).toString("base64url"),
): Promise<{ secretHash: string; secretSalt: string }> {
  const derived = (await scrypt(normalizeCode(secret), salt, 32)) as Buffer;
  return { secretHash: derived.toString("base64url"), secretSalt: salt };
}

export async function verifySecret(
  secret: string,
  expectedHash: string,
  salt: string,
): Promise<boolean> {
  const derived = (await scrypt(normalizeCode(secret), salt, 32)) as Buffer;
  const expected = Buffer.from(expectedHash, "base64url");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

