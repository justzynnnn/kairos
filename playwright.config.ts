import { defineConfig, devices } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT ?? "3100",
  baseURL = `http://127.0.0.1:${port}`,
  reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "1";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 1,
  reporter: "html",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer,
    timeout: 120000,
    /*
     * These specs drive the seeded preview identity (/api/demo/reset, the
     * x-demo-user header). A developer's .env.local points the same dev server
     * at real Supabase, where every route redirects an anonymous browser to
     * /auth and the whole suite fails for reasons that have nothing to do with
     * the code. Blanking the public keys here — an empty value fails
     * getSupabasePublicConfig's parse — pins the run to preview mode no matter
     * whose machine it runs on. Set PLAYWRIGHT_SUPABASE=1 to opt out.
     */
    env:
      process.env.PLAYWRIGHT_SUPABASE === "1"
        ? {}
        : {
            NEXT_PUBLIC_SUPABASE_URL: "",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
            SUPABASE_SERVICE_ROLE_KEY: "",
            KAIROS_ALLOW_PREVIEW: "1",
          },
  },
});
