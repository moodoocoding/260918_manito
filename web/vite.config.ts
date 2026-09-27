import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (!env.VITE_FIREBASE_API_KEY) throw new Error("VITE_FIREBASE_API_KEY must be set before building the web app.");
  if (env.VITE_USE_EMULATORS === "true") {
    if (env.VITE_FIREBASE_PROJECT_ID !== "demo-manitto") throw new Error("Emulator mode requires demo-manitto.");
    if (!env.VITE_FIREBASE_AUTH_DOMAIN || !env.VITE_FIREBASE_APP_ID) throw new Error("Emulator Firebase web config is incomplete.");
  } else if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== "manito-938cc" &&
    (!env.VITE_FIREBASE_AUTH_DOMAIN || !env.VITE_FIREBASE_APP_ID)) {
    throw new Error("A non-development Firebase project requires its own auth domain and app ID.");
  }
  return {
    server: { host: "127.0.0.1" },
    build: { outDir: "dist" },
  };
});
