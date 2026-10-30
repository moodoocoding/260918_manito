import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";

// Firebase Auth Emulator accepts mock Google ID tokens for non-interactive tests.
// https://firebase.google.com/docs/emulator-suite/connect_auth#non-interactive_testing
export async function signInEmulatorGoogle(auth, adminAuth, uid, claims) {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Mock Google authentication requires the Auth Emulator.");
  }
  const account = await adminAuth.getUser(uid).catch((error) => {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  });
  const email = account?.email ?? `${uid}@example.test`;
  if (!account) await adminAuth.createUser({ uid, email });
  await adminAuth.updateUser(uid, { providerToLink: { uid, providerId: "google.com", email } });
  if (claims) await adminAuth.setCustomUserClaims(uid, claims);
  return signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
    sub: uid, email, email_verified: true, name: account?.displayName ?? "",
  })));
}
