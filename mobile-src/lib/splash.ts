import { Capacitor } from "@capacitor/core";

let hidden = false;

/**
 * Dismisses the native launch image once React has committed a frame the user
 * can actually read. Call it from a paint callback, never from a loading state:
 * hiding early trades the launch image for a blank canvas, which is the exact
 * flash this is here to prevent.
 */
export function hideSplashScreen() {
  if (hidden || !Capacitor.isNativePlatform()) return;
  hidden = true;
  requestAnimationFrame(() => {
    void import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 150 }))
      .catch(() => null);
  });
}
