import Link from "next/link";

/** @deprecated Profile is now split into focused Settings routes. */
export function ProfileWorkspace() {
  return <Link href="/settings/account">Open Settings</Link>;
}
