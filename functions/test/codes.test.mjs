import assert from "node:assert/strict";
import test from "node:test";
import {
  credentialLookupDigest,
  generateClassCode,
  generateStudentCard,
  hashSecret,
  normalizeCode,
  parseStudentCard,
  verifySecret,
} from "../lib/auth/codes.js";

test("class codes exclude ambiguous characters and have a fixed length", () => {
  const code = generateClassCode();
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  // 소문자 및 공백 포함 시에도 완벽히 대문자로 정규화 검증
  assert.equal(normalizeCode(" happy2026 "), "HAPPY2026");
  assert.equal(normalizeCode("vdwq"), "VDWQ");
  assert.equal(normalizeCode("v-d_w.q!"), "VDWQ");
});

test("student card codes can be normalized and parsed regardless of case", () => {
  const card = generateStudentCard();
  assert.match(card.cardCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  const parsed = parseStudentCard(card.cardCode.toLowerCase());
  assert.deepEqual(parsed, { loginId: card.loginId, secret: card.secret });
  assert.equal(normalizeCode(` ${card.cardCode.toLowerCase()} `), card.cardCode);

  // 12자리 기존 카드 파싱 하위 호환성 및 소문자 검증
  const legacyParsed = parseStudentCard("abcd-efghjklm");
  assert.deepEqual(legacyParsed, { loginId: "ABCD", secret: "EFGHJKLM" });
});

test("student secrets are salted and verified without storing the original", async () => {
  const card = generateStudentCard();
  const first = await hashSecret(card.secret);
  const second = await hashSecret(card.secret);
  assert.notEqual(first.secretSalt, second.secretSalt);
  assert.notEqual(first.secretHash, second.secretHash);
  assert.equal(await verifySecret(card.secret, first.secretHash, first.secretSalt), true);
  assert.equal(await verifySecret("WRONGCODE", first.secretHash, first.secretSalt), false);
});

test("credential lookup digests are class-scoped", () => {
  assert.notEqual(
    credentialLookupDigest("class-one", "ABCD"),
    credentialLookupDigest("class-two", "ABCD"),
  );
});

