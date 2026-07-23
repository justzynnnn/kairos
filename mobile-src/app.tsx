import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { AuthProvider, SignIn, useAuth } from "./lib/auth";
import { DataProvider, useMobileData } from "./lib/data";
import {
  CalendarRange,
  House,
  MessagesSquare,
  Moon,
  Sparkles,
  Sun,
  UserRound,
  type LucideIcon,
} from "./lib/icons";
import { badgeCount } from "./lib/counts";
import { launchStartedAt, recordMetric } from "./lib/metrics";
import { hideSplashScreen } from "./lib/splash";
import {
  applyTheme,
  nextTheme,
  resolveTheme,
  storedTheme,
  type ThemePreference,
} from "./lib/theme";

const Home = lazy(() => import("./pages/home"));
const Planner = lazy(() => import("./pages/planner"));
const Assistant = lazy(() => import("./pages/assistant"));
const Inbox = lazy(() => import("./pages/inbox"));
const Profile = lazy(() => import("./pages/profile"));

type Tab = "home" | "planner" | "assistant" | "inbox" | "profile";
const tabs: Array<{
  id: Tab;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
}> = [
  { id: "home", label: "Home", icon: House, component: Home },
  { id: "planner", label: "Planner", icon: CalendarRange, component: Planner },
  { id: "assistant", label: "Kairos", icon: Sparkles, component: Assistant },
  { id: "inbox", label: "Inbox", icon: MessagesSquare, component: Inbox },
  { id: "profile", label: "Profile", icon: UserRound, component: Profile },
];

// The Profile tab used to be Settings; a phone restored onto #settings still
// lands somewhere real.
const renamedTabs: Record<string, Tab> = { settings: "profile" };

function currentTab(): Tab {
  const hash = location.hash.slice(1);
  const renamed = renamedTabs[hash];
  if (renamed) {
    history.replaceState(null, "", "#" + renamed);
    return renamed;
  }
  return tabs.some((tab) => tab.id === hash) ? (hash as Tab) : "home";
}

function LoadingPage() {
  return (
    <div className="page" aria-label="Loading">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function InitialLoadError({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry(): void;
  onSignOut(): void;
}) {
  return (
    <main className="page initial-error" role="alert">
      <section className="panel panel-pad page">
        <div>
          <p className="eyebrow">Kairos could not finish loading</p>
          <h1>Your account is safe</h1>
          <p className="supporting">{message}</p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={onSignOut}>
            Sign out
          </button>
          <button type="button" className="primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}

const themeLabels: Record<ThemePreference, string> = {
  system: "Match the system appearance",
  light: "Light appearance",
  dark: "Dark appearance",
};

function ThemeButton() {
  const [preference, setPreference] = useState<ThemePreference>(storedTheme);
  const resolved = resolveTheme(preference);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={themeLabels[preference] + ". Change appearance."}
      onClick={() => {
        const next = nextTheme(preference);
        applyTheme(next);
        setPreference(next);
      }}
    >
      {resolved === "dark" ? (
        <Moon size={18} strokeWidth={2} aria-hidden />
      ) : (
        <Sun size={18} strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}

function Shell() {
  const auth = useAuth();
  const mobileData = useMobileData();
  const [tab, setTab] = useState<Tab>(currentTab);
  const launchMeasured = useRef(false);
  // Friend requests, meetings whose next move is this user's, and unread
  // messages all resolve in the same place: the Inbox tab. The counts are read
  // defensively because the first paint can come from a snapshot written by an
  // older build that had no counts in it.
  const waiting = mobileData.data
    ? badgeCount(mobileData.data.pendingConnectionCount) +
      badgeCount(mobileData.data.actionableMeetingCount) +
      mobileData.data.conversationSummaries.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      )
    : 0;
  const active = tabs.find((entry) => entry.id === tab) ?? tabs[0];
  const Page = active.component;
  useEffect(() => {
    const changed = () => setTab(currentTab());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    const prefetch = () =>
      void Promise.all([
        import("./pages/planner"),
        import("./pages/assistant"),
        import("./pages/inbox"),
        import("./pages/profile"),
      ]);
    const requestIdle = window.requestIdleCallback;
    if (requestIdle) {
      const handle = requestIdle(prefetch, { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(prefetch, 500);
    return () => window.clearTimeout(handle);
  }, []);
  useEffect(() => {
    if (mobileData.data && auth.accessToken && !launchMeasured.current) {
      launchMeasured.current = true;
      void recordMetric(
        auth.accessToken,
        "launch_usable",
        performance.now() - launchStartedAt,
        { cache: mobileData.state === "cached" ? "hit" : "refresh" },
      );
    }
  }, [auth.accessToken, mobileData.data, mobileData.state]);
  function navigate(next: Tab, startedAt: number) {
    if (next === tab) return;
    history.pushState(null, "", "#" + next);
    setTab(next);
    if (auth.accessToken)
      requestAnimationFrame(
        (paintedAt) =>
          void recordMetric(
            auth.accessToken!,
            "tab_transition",
            paintedAt - startedAt,
          ),
      );
  }
  return (
    <div className="mobile-app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">K</span>
          Kairos
        </div>
        <ThemeButton />
      </header>
      {/*
        Sync is silent by design: a permanently visible status pill trains the
        user to watch a background process they cannot influence. Only a sync
        that has something to say surfaces, and when it does it doubles as the
        manual retry.
      */}
      {mobileData.error && mobileData.data && (
        <button
          type="button"
          className="notice full"
          onClick={() => void mobileData.refresh()}
          disabled={mobileData.state === "refreshing"}
          // aria-live rather than role="status": the notice has to keep
          // announcing itself when it appears without giving up the button role
          // that tells the user it is the retry control.
          aria-live="polite"
        >
          Showing trusted local data. {mobileData.error}{" "}
          {mobileData.state === "refreshing" ? "Retrying…" : "Tap to retry."}
        </button>
      )}
      <Suspense fallback={<LoadingPage />}>
        {mobileData.data ? (
          <Page />
        ) : mobileData.error ? (
          <InitialLoadError
            message={mobileData.error}
            onRetry={() => void mobileData.refresh()}
            onSignOut={() => void auth.signOut()}
          />
        ) : (
          <LoadingPage />
        )}
      </Suspense>
      <nav className="bottom-nav" aria-label="Primary">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={"nav-button " + (tab === entry.id ? "active" : "")}
            aria-current={tab === entry.id ? "page" : undefined}
            onClick={(event) => navigate(entry.id, event.timeStamp)}
          >
            <entry.icon size={22} strokeWidth={2} aria-hidden />
            {entry.label}
            {entry.id === "inbox" && waiting > 0 && (
              <span className="count-badge" aria-label={waiting + " waiting"}>
                {waiting}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SessionGate() {
  const auth = useAuth();
  const settled = !auth.loading;
  useEffect(() => {
    if (settled) hideSplashScreen();
  }, [settled]);
  if (auth.loading)
    return (
      <main className="auth" aria-label="Restoring secure session">
        <div className="brand">
          <span className="brand-mark">K</span>
          Kairos
        </div>
        <div className="skeleton" />
      </main>
    );
  if (!auth.accessToken) return <SignIn />;
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

export function MobileApp() {
  return (
    <AuthProvider>
      <SessionGate />
    </AuthProvider>
  );
}
