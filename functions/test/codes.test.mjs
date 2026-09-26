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
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
});

test("student card codes can be normalized and parsed", () => {
  const card = generateStudentCard();
  const parsed = parseStudentCard(card.cardCode.toLowerCase());
  assert.deepEqual(parsed, { loginId: card.loginId, secret: card.secret });
  assert.equal(normalizeCode(` ${card.loginId}-${card.secret} `), `${card.loginId}${card.secret}`);
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

