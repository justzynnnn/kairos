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
import { launchStartedAt, recordMetric } from "./lib/metrics";

const Home = lazy(() => import("./pages/home"));
const Planner = lazy(() => import("./pages/planner"));
const Assistant = lazy(() => import("./pages/assistant"));
const Inbox = lazy(() => import("./pages/inbox"));
const Settings = lazy(() => import("./pages/settings"));

type Tab = "home" | "planner" | "assistant" | "inbox" | "settings";
const tabs: Array<{
  id: Tab;
  label: string;
  icon: string;
  component: ComponentType;
}> = [
  { id: "home", label: "Home", icon: "⌂", component: Home },
  { id: "planner", label: "Planner", icon: "▦", component: Planner },
  { id: "assistant", label: "Kairos", icon: "✦", component: Assistant },
  { id: "inbox", label: "Inbox", icon: "◫", component: Inbox },
  { id: "settings", label: "Settings", icon: "⚙", component: Settings },
];

function currentTab(): Tab {
  const hash = location.hash.slice(1) as Tab;
  return tabs.some((tab) => tab.id === hash) ? hash : "home";
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

function Shell() {
  const auth = useAuth();
  const mobileData = useMobileData();
  const [tab, setTab] = useState<Tab>(currentTab);
  const launchMeasured = useRef(false);
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
        import("./pages/settings"),
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
        <button
          type="button"
          className="sync-state"
          onClick={() => void mobileData.refresh()}
          aria-label="Refresh Kairos"
        >
          <span
            className={
              "sync-dot " + (mobileData.state === "offline" ? "offline" : "")
            }
          />
          {mobileData.state === "refreshing"
            ? "Syncing"
            : mobileData.state === "offline"
              ? "On this phone"
              : mobileData.state === "review"
                ? "Needs review"
                : "Current"}
        </button>
      </header>
      {mobileData.error && mobileData.data && (
        <div className="notice" role="status">
          Showing trusted local data. {mobileData.error}
        </div>
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
            <span className="nav-icon">{entry.icon}</span>
            {entry.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SessionGate() {
  const auth = useAuth();
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
