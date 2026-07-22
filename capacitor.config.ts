import type { CapacitorConfig } from "@capacitor/cli";

const mobileServerUrl=process.env.KAIROS_MOBILE_SERVER_URL;
const config:CapacitorConfig={
  appId:"app.kairos.guardian",
  appName:"Kairos",
  webDir:"mobile-shell",
  server:mobileServerUrl?{url:mobileServerUrl,cleartext:mobileServerUrl.startsWith("http://")}:undefined,
  ios:{contentInset:"automatic",preferredContentMode:"mobile"},
};
export default config;
