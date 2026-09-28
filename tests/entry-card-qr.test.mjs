import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {PNG} from "pngjs";

test("printed entry QR decodes to the student entry page without card credentials", async () => {
  const entryUrl = new URL("/student", "https://manito-one-blond.vercel.app").href;
  const dataUrl = await QRCode.toDataURL(entryUrl, {errorCorrectionLevel:"M", margin:4, width:300});
  const image = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  assert.equal(decoded?.data, entryUrl);
  assert.equal(new URL(decoded.data).search, "");
  assert.equal(new URL(decoded.data).hash, "");
});
