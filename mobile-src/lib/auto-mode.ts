import { getSecureValue, setSecureValue } from "@/lib/mobile/store";

/**
 * Whether Mori may place items without showing the confirmation card first.
 *
 * Kept on the device rather than on the profile, alongside the onboarding flag
 * and the diagnostics opt-in. Skipping review is a statement about how much the
 * person trusts this phone's interpretation — a shared iPad or a signed-in
 * browser has not earned the same latitude, and syncing the flag would grant it
 * silently.
 */
const key = "auto-schedule";

export async function readAutoMode() {
  try {
    return (await getSecureValue(key)) === "1";
  } catch {
    // A Keychain that will not answer must fall back to asking, never to
    // writing the schedule unattended.
    return false;
  }
}

export async function writeAutoMode(enabled: boolean) {
  await setSecureValue(key, enabled ? "1" : "0");
}
