"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

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
      <div className="assistant-entry-copy home-plan-entry-copy">
        <span className="home-plan-entry-icon" aria-hidden="true">
          <Sparkles className="size-7" />
        </span>
        <div>
          <p className="font-display font-semibold">Plan with Mori</p>
          <p>
            Start a conversation to plan your day, review changes, and make
            time for what matters.
          </p>
        </div>
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
      <small className="home-plan-entry-note">
        <Sparkles className="size-4" /> Mori reviews assumptions, conflicts,
        and every proposed change.
      </small>
      {!cloudFallbackConfigured && (
        <small className="home-plan-entry-native-note">
          On-device planning is available in the iOS app. Typed deterministic
          planning remains available here.
        </small>
      )}
    </section>
  );
}
