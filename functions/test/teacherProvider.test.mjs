import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureVerifiedTeacherAccount } from "../lib/shared/authorization.js";

test("teacher callables require a Google sign-in provider before touching teacher records", async () => {
  for (const provider of [undefined, "password", "custom", "apple.com"]) {
    await assert.rejects(
      ensureVerifiedTeacherAccount({
        auth: {
          uid: "teacher-test",
          token: {
            firebase: provider ? { sign_in_provider: provider } : undefined,
            role: "teacher",
          },
        },
      }),
      (error) => error.code === "permission-denied",
    );
  }
});

test("student custom tokens are rejected as teacher authentication", async () => {
  await assert.rejects(
    ensureVerifiedTeacherAccount({
      auth: {
        uid: "student-test",
        token: { firebase: { sign_in_provider: "custom" }, role: "student" },
      },
    }),
    (error) => error.code === "unauthenticated",
  );
});
