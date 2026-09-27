import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  browserPopupRedirectResolver, connectAuthEmulator, inMemoryPersistence,
  initializeAuth, GoogleAuthProvider, signInWithPopup,
  signInWithCustomToken, signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";
const projectId = useEmulators ? "demo-manitto" : import.meta.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId || !import.meta.env.VITE_FIREBASE_API_KEY || !import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || !import.meta.env.VITE_FIREBASE_APP_ID) {
  throw new Error("Firebase 웹 환경 변수가 설정되지 않았어요. web/.env.example을 확인해 주세요.");
}
if (useEmulators && import.meta.env.VITE_FIREBASE_PROJECT_ID !== "demo-manitto") {
  throw new Error("Emulator 모드에는 demo-manitto 프로젝트만 사용할 수 있어요.");
}
if (!useEmulators && !import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  throw new Error("App Check 사이트 키가 필요해요.");
}

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});
if (!useEmulators) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const db = getFirestore(app);
const functions = getFunctions(app, "asia-northeast3");
if (useEmulators) {
  const host = window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}

export function call<I, O>(name: string, data: I): Promise<O> {
  return httpsCallable<I, O>(functions, name, { limitedUseAppCheckTokens: true })(data).then((response) => response.data);
}

export async function teacherLogin(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function studentLogin(classCode: string, cardCode: string): Promise<void> {
  const result = await call<{ classCode: string; cardCode: string }, { customToken: string }>(
    "loginStudent", { classCode, cardCode });
  await signInWithCustomToken(auth, result.customToken);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
