import { initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver, browserSessionPersistence, connectAuthEmulator,
  getRedirectResult, inMemoryPersistence, initializeAuth, GoogleAuthProvider,
  setPersistence, signInWithPopup, signInWithRedirect,
  signInWithCustomToken, signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";
const projectId = useEmulators ? "demo-manitto" : import.meta.env.VITE_FIREBASE_PROJECT_ID || "manito-938cc";
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
  (projectId === "manito-938cc" ? "manito-938cc.firebaseapp.com" : "");
const appId = import.meta.env.VITE_FIREBASE_APP_ID ||
  (projectId === "manito-938cc" ? "1:531830348458:web:11d1e2d0bddca057b80ed3" : "");
if (!import.meta.env.VITE_FIREBASE_API_KEY || !authDomain || !appId) {
  throw new Error("Firebase 웹 환경 변수가 설정되지 않았어요. web/.env.example을 확인해 주세요.");
}
if (useEmulators && import.meta.env.VITE_FIREBASE_PROJECT_ID !== "demo-manitto") {
  throw new Error("Emulator 모드에는 demo-manitto 프로젝트만 사용할 수 있어요.");
}
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain,
  projectId,
  appId,
});

try {
  const resolverProto = (browserPopupRedirectResolver as unknown as { prototype?: object }).prototype;
  if (resolverProto) {
    Object.defineProperty(resolverProto, "_shouldInitProactively", {
      get: () => true,
      configurable: true,
    });
  }
} catch {
  // Ignore if the SDK property descriptor changes in a future version.
}

export const auth = initializeAuth(app, {
  persistence: [browserSessionPersistence, inMemoryPersistence],
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
  return httpsCallable<I, O>(functions, name)(data).then((response) => response.data);
}

function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export function prepareTeacherAuth(): void {
  void setPersistence(auth, browserSessionPersistence).catch(() => undefined);
}

export async function teacherLogin(): Promise<void> {
  await signInWithPopup(auth, createGoogleProvider(), browserPopupRedirectResolver);
}

export async function teacherLoginRedirect(): Promise<void> {
  await setPersistence(auth, browserSessionPersistence);
  await signInWithRedirect(auth, createGoogleProvider(), browserPopupRedirectResolver);
}

export async function consumeAuthRedirectError(): Promise<unknown> {
  try {
    await getRedirectResult(auth, browserPopupRedirectResolver);
    return null;
  } catch (caught) {
    return caught;
  }
}

export async function studentLogin(classCode: string, cardCode: string): Promise<void> {
  await setPersistence(auth, inMemoryPersistence);
  const result = await call<{ classCode: string; cardCode: string }, { customToken: string }>(
    "loginStudent", { classCode, cardCode });
  await signInWithCustomToken(auth, result.customToken);
}

export async function logout(): Promise<void> {
  await signOut(auth);
  await setPersistence(auth, inMemoryPersistence).catch(() => undefined);
}
