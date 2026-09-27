import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  for (const key of ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"]) {
    if (!env[key]) throw new Error(`${key} must be set before building the web app.`);
  }
  if (env.VITE_USE_EMULATORS === "true") {
    if (env.VITE_FIREBASE_PROJECT_ID !== "demo-manitto") throw new Error("Emulator mode requires demo-manitto.");
  } else if (!env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
    throw new Error("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY must be set for deployed builds.");
  }
  return {
    server: { host: "127.0.0.1" },
    build: { outDir: "dist" },
  };
});
