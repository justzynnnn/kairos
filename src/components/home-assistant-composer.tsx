"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { MoriMascot } from "@/components/mori-mascot";

export function HomeAssistantComposer({
  cloudFallbackConfigured,
}: {
  cloudFallbackConfigured: boolean;
}) {
  const router = useRouter();
  const [command, setCommand] = useState("");

  function openAssistant() {
    if (command.trim().length < 2) return;
    router.push(
      `/assistant?command=${encodeURIComponent(command.trim())}` as Route,
    );
  }

  return (
    <section className="assistant-entry home-plan-entry">
      <MoriMascot
        state="cardEdgeWave"
        size="large"
        alt=""
        className="home-plan-entry-mori"
      />
      <div className="assistant-entry-copy">
        <p className="font-display font-semibold">Plan with Mori</p>
        <p>
          Start here, then review assumptions, conflicts, and every proposed
          change in the full Assistant.
        </p>
      </div>
      <div className="assistant-entry-field">
        <input
          aria-label="Ask Mori from Home"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") openAssistant();
          }}
          placeholder="What needs to happen?"
        />
        <button
          type="button"
          disabled={command.trim().length < 2}
          onClick={openAssistant}
          aria-label="Open in Assistant"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
      {!cloudFallbackConfigured && (
        <small>
          On-device planning is available in the iOS app. Typed deterministic
          planning remains available here.
        </small>
      )}
    </section>
  );
}
