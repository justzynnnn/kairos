"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Activity, Bot, Clock3, LockKeyhole, UserRound } from "lucide-react";

const links = [
  ["/settings/account", "Account", UserRound],
  ["/settings/privacy", "Privacy", LockKeyhole],
  ["/settings/automation", "Automation", Bot],
  ["/settings/preferences", "Preferences", Clock3],
  ["/settings/activity", "Activity", Activity],
] as const;

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="settings-nav">
      {links.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href as Route}
          aria-current={path === href ? "page" : undefined}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
