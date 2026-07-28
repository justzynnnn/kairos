const apiOrigin = (
  import.meta.env.VITE_KAIROS_API_URL ||
  import.meta.env.NEXT_PUBLIC_APP_URL ||
  ""
).replace(/\/$/, "");
const supabaseUrl = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/$/,
  "",
);
const supabaseKey =
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

export const mobileConfig = {
  apiOrigin,
  supabaseUrl,
  supabaseKey,
  ready: Boolean(apiOrigin && supabaseUrl && supabaseKey),
  features: {
    nativeSpeech: import.meta.env.VITE_KAIROS_NATIVE_SPEECH !== "0",
    applePlanner: import.meta.env.VITE_KAIROS_APPLE_PLANNER !== "0",
    offlineSync: import.meta.env.VITE_KAIROS_OFFLINE_SYNC !== "0",
    // No geminiFallback flag: interpretation on this client is Apple
    // Intelligence then the deterministic parser, both on the device. The web
    // app keeps its cloud tier and its own env var.
  },
};
