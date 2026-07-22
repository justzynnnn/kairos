"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { publishRepairIncident } from "@/lib/repair/client-events";
import type { DayStartResult } from "@/lib/repair/incidents-types";

export function DayStartObserver() {
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    const startedOnPath = window.location.pathname;
    const linkedIncident = new URLSearchParams(window.location.search).get(
      "incident",
    );

    void fetch("/api/day/start", { method: "POST", signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as DayStartResult;
        if (!response.ok || controller.signal.aborted) return;
        if (!linkedIncident) publishRepairIncident(data.incident);

        const refreshKey = data.incident
          ? `kairos:refreshed-repair:${data.incident.id}`
          : null;
        const stillOnStartingPage = window.location.pathname === startedOnPath;
        const refreshableRoute =
          startedOnPath === "/" || startedOnPath.startsWith("/planner");
        if (
          refreshKey &&
          stillOnStartingPage &&
          refreshableRoute &&
          data.firstOpen &&
          data.incident?.status === "applied" &&
          sessionStorage.getItem(refreshKey) !== "1"
        ) {
          sessionStorage.setItem(refreshKey, "1");
          router.refresh();
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          return;
      });

    return () => controller.abort();
  }, [router]);

  return null;
}
