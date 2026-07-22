import type { CapacitorConfig } from "@capacitor/cli";

const developmentServerUrl = process.env.KAIROS_MOBILE_DEV_SERVER_URL;
const config: CapacitorConfig = {
  appId: "app.kairos.guardian",
  appName: "Kairos",
  webDir: "mobile-dist",
  server: developmentServerUrl
    ? {
        url: developmentServerUrl,
        cleartext: developmentServerUrl.startsWith("http://"),
      }
    : undefined,
  ios: { contentInset: "automatic", preferredContentMode: "mobile" },
};
export default config;
