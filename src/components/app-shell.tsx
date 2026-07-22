"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Bot, CalendarDays, Home, Inbox, Settings } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Brand } from "@/components/brand";
import { DayStartObserver } from "@/components/day-start-observer";
import { PreviewBanner } from "@/components/preview-banner";
import {
  KairosTripMonitor,
  nativeTripMonitoringAvailable,
} from "@/lib/journey/native";
import type { Viewer } from "@/lib/types";

const navigation = [
  { label: "Home", href: "/", icon: Home },
  { label: "Planner", href: "/planner", icon: CalendarDays },
  { label: "Kairos", href: "/assistant", icon: Bot },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Settings", href: "/settings/account", icon: Settings },
] as const;

function isActive(path: string, href: string) {
  if (href === "/") return path === href;
  if (href.startsWith("/settings"))
    return path.startsWith("/settings") || path.startsWith("/profile");
  return path.startsWith(href);
}

export function AppShell({
  viewer,
  children,
}: {
  viewer: Viewer;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const isConversation = path.startsWith("/inbox/chats/");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <DayStartObserver />
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-[232px] border-r border-[var(--outline-soft)] bg-white px-4 py-5 lg:flex lg:flex-col">
        <Brand />
        <nav
          aria-label="Primary navigation"
          className="mt-9 grid gap-1"
          data-testid="desktop-navigation"
        >
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href as Route}
                aria-current={active ? "page" : undefined}
                className={`nav-item ${active ? "nav-item-active" : ""}`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-[var(--outline-soft)] pt-4">
          <p className="truncate font-display text-sm font-semibold text-[var(--navy)]">
            {viewer.fullName}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {viewer.email}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {viewer.preview ? (
              <Link
                href="/auth"
                className="text-xs font-semibold text-[var(--cyan-deep)]"
              >
                Configure Supabase
              </Link>
            ) : (
              <form
                action={signOut}
                onSubmit={() => {
                  if (nativeTripMonitoringAvailable())
                    void KairosTripMonitor.stopTrip();
                }}
              >
                <button
                  type="submit"
                  className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--navy)]"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header
          className={`sticky top-0 z-30 border-b border-black/5 bg-[var(--background)]/92 px-4 pb-2.5 pt-[max(.65rem,env(safe-area-inset-top))] backdrop-blur lg:hidden ${isConversation ? "thread-global-header" : ""}`}
        >
          <Brand />
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`mx-auto min-h-screen max-w-[1180px] px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7 ${isConversation ? "thread-main" : ""}`}
        >
          {viewer.preview && (
            <div className={isConversation ? "thread-preview-banner" : ""}>
              <PreviewBanner />
            </div>
          )}
          {children}
        </main>
      </div>

      <nav
        aria-label="Primary navigation"
        data-testid="mobile-navigation"
        className={`safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-[var(--outline-soft)] bg-white/96 px-2 pt-1.5 shadow-[0_-6px_24px_rgba(10,36,87,.08)] backdrop-blur lg:hidden ${isConversation ? "thread-global-nav" : ""}`}
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href as Route}
                aria-current={active ? "page" : undefined}
                className={`mobile-nav-item ${active ? "mobile-nav-item-active" : ""}`}
              >
                <Icon className="size-5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
