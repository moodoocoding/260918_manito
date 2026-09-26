export const callableOptions = {
  // App Check is mandatory after deployment. The local emulator has no real
  // attestation provider, so integration tests disable only this one check.
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  consumeAppCheckToken: process.env.FUNCTIONS_EMULATOR !== "true",
} as const;

