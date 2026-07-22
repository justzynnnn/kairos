import { defineConfig, devices } from "@playwright/test";
const port=process.env.PLAYWRIGHT_PORT??"3100",baseURL=`http://127.0.0.1:${port}`,reuseExistingServer=process.env.PLAYWRIGHT_REUSE_SERVER==="1";
export default defineConfig({ testDir: "./e2e", workers: 1, retries: 1, reporter: "html", use: { baseURL, trace: "on-first-retry" }, projects: [{ name: "webkit-desktop", use: { ...devices["Desktop Safari"] } }, { name: "webkit-iphone", use: { ...devices["iPhone 15"] } }], webServer: { command: `pnpm exec next dev -p ${port}`, url: baseURL, reuseExistingServer, timeout: 120000 } });
