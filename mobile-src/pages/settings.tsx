import { useEffect, useState } from "react";
import { readLocalSnapshot, writeLocalSnapshot } from "@/lib/mobile/store";
import { useAuth } from "../lib/auth";
import { useMobileData } from "../lib/data";

export default function Settings() {
  const auth = useAuth();
  const { data } = useMobileData();
  const [diagnostics, setDiagnostics] = useState(false);
  useEffect(() => {
    void readLocalSnapshot<boolean>("diagnostics-enabled").then((value) =>
      setDiagnostics(value ?? false),
    );
  }, []);
  if (!data) return null;
  return (
    <main className="page">
      <header>
        <p className="eyebrow">Account and privacy</p>
        <h1>Settings</h1>
        <p className="supporting">{data.viewer.email}</p>
      </header>
      <section className="panel panel-pad page">
        <div>
          <p className="eyebrow">Account</p>
          <h2>{data.viewer.fullName}</h2>
          <p className="supporting">
            @{data.viewer.username} · {data.viewer.timezone}
          </p>
        </div>
        <button className="danger full" onClick={() => void auth.signOut()}>
          Sign out and clear this phone
        </button>
      </section>
      <section className="panel panel-pad">
        <p className="eyebrow">Private diagnostics</p>
        <label className="row" style={{ gridTemplateColumns: "1fr auto" }}>
          <div>
            <p className="row-title">Share coarse performance metrics</p>
            <p className="row-meta">
              Timings, capability states, fallback reasons, queue size, and
              error codes only. Never prompts, titles, locations, or messages.
            </p>
          </div>
          <input
            type="checkbox"
            checked={diagnostics}
            onChange={(event) => {
              const value = event.target.checked;
              setDiagnostics(value);
              void writeLocalSnapshot("diagnostics-enabled", value);
            }}
          />
        </label>
      </section>
      <section className="panel panel-pad">
        <p className="eyebrow">Offline behavior</p>
        <h2>Schedule changes sync safely</h2>
        <p className="supporting">
          Creates, edits, completions, and cancellations appear on this phone
          immediately. Stale or overlapping changes stop for review rather than
          overwriting another device.
        </p>
      </section>
    </main>
  );
}
