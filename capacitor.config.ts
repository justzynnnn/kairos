import type { CapacitorConfig } from "@capacitor/cli";

const developmentServerUrl = process.env.KAIROS_MOBILE_DEV_SERVER_URL;
const config: CapacitorConfig = {
  appId: "app.kairos.guardian",
  appName: "Mori",
  webDir: "mobile-dist",
  server: developmentServerUrl
    ? {
        url: developmentServerUrl,
        cleartext: developmentServerUrl.startsWith("http://"),
      }
    : undefined,
  ios: { contentInset: "automatic", preferredContentMode: "mobile" },
  plugins: {
    // The web layer hides the splash once it has painted a real frame, so the
    // launch image covers the whole JS boot instead of a blank canvas.
    //
    // backgroundColor is deliberately unset: the plugin instantiates the launch
    // storyboard and then stamps this literal over the resulting view, which
    // would replace the dynamic "Canvas" colour with a light-only value and
    // leave a pale rectangle behind the splash in dark mode.
    SplashScreen: {
      launchAutoHide: false,
    },
  },
};
export default config;
