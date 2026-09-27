import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { defineSecret } from "firebase-functions/params";

export const cardPrintKey = defineSecret("CARD_PRINT_KEY");

function encryptionKey(): Buffer {
  const value = cardPrintKey.value();
  const key = Buffer.from(value || "", "base64");
  if (key.length !== 32) throw new Error("Card print encryption key is unavailable.");
  return key;
}

export function encryptCardCode(cardCode: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(cardCode, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")].join(":");
}

export function decryptCardCode(value: string): string {
  const [version, nonce, tag, encrypted] = value.split(":");
  if (version !== "v1" || !nonce || !tag || !encrypted) throw new Error("Invalid card print data.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
