"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Wifi } from "lucide-react";
import { MoriMascot } from "@/components/mori-mascot";

export function OfflineState() {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="max-w-md">
        <MoriMascot state="sleeping" size="medium" alt="" className="mx-auto" />
        <p
          className={`mx-auto mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${online ? "bg-[#d5f6eb] text-[#075e49]" : "bg-[var(--surface-high)] text-[var(--muted)]"}`}
        >
          <Wifi className="size-3.5" />
          {online ? "Connection restored" : "No connection"}
        </p>
        <h1 className="page-title mt-4">
          {online ? "You're back online" : "You're offline"}
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          {online
            ? "Retry to return to your private schedule."
            : "Mori will not show stale private schedule data. Reconnect, then try again."}
        </p>
        <button
          type="button"
          onClick={() => window.location.assign("/")}
          className="btn btn-primary mt-6 min-h-12 px-5"
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      </div>
    </main>
  );
}
