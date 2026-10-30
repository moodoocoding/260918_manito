import { createSchooldocMissionsClient } from "./schooldocMissionsApi";

// These are public connection settings from Schooldoc's published client, never server credentials.
// The public handler verifies the board token and student identity; verify_jwt is disabled on that function.
export const schooldocMissionsClient = createSchooldocMissionsClient({
  endpoint: import.meta.env.VITE_SCHOOLDOC_MISSIONS_API_URL || "https://jhystopaacyfvjxhnpyd.supabase.co/functions/v1/class-missions-public",
  token: import.meta.env.VITE_SCHOOLDOC_MISSIONS_TOKEN || "b98b324f-fedf-4f70-b259-e048159f69e5",
});
