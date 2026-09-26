import { HttpsError } from "firebase-functions/v2/https";

const requestIdPattern = /^[A-Za-z0-9_-]{8,64}$/;
const documentIdPattern = /^[A-Za-z0-9_-]{10,128}$/;

export function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "요청 형식이 올바르지 않아요.");
  }
  return value as Record<string, unknown>;
}

export function requireRequestId(value: unknown): string {
  if (typeof value !== "string" || !requestIdPattern.test(value)) {
    throw new HttpsError("invalid-argument", "요청 식별자가 올바르지 않아요.");
  }
  return value;
}

export function requireDocumentId(value: unknown, label: string): string {
  if (typeof value !== "string" || !documentIdPattern.test(value)) {
    throw new HttpsError("invalid-argument", `${label} 값이 올바르지 않아요.`);
  }
  return value;
}

export function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${label}을(를) 입력해 주세요.`);
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${label}은(는) 1자 이상 ${maxLength}자 이하여야 해요.`,
    );
  }
  return normalized;
}

export function requireSchoolYear(value: unknown): number {
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(value) || Number(value) < currentYear - 1 || Number(value) > currentYear + 1) {
    throw new HttpsError("invalid-argument", "학년도가 올바르지 않아요.");
  }
  return Number(value);
}

export function requireGradeBand(value: unknown): "lower" | "middle" | "upper" {
  if (value !== "lower" && value !== "middle" && value !== "upper") {
    throw new HttpsError("invalid-argument", "학년군이 올바르지 않아요.");
  }
  return value;
}

