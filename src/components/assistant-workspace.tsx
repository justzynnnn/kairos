"use client";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  LoaderCircle,
  Mic,
  Send,
  ShieldCheck,
  Square,
} from "lucide-react";
import type {
  DeadlinePreparation,
  ProposalItem,
} from "@/lib/scheduling/schema";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  clearNativePlannerHistory,
  interpretNatively,
  nativeIntelligenceAvailable,
  NativeSpeech,
  prepareNativePlanner,
  subscribeToTranscript,
} from "@/lib/mobile/native";
import { plannerResultToIntent } from "@/lib/mobile/contracts";
type Proposal = {
  status: "proposal";
  proposalId: string;
  summary: string;
  assumptions: string[];
  items: ProposalItem[];
  provider: "apple-intelligence" | "gemini" | "deterministic";
  providerNotice: string | null;
  preview: boolean;
};
type Follow = {
  status: "needs_input";
  followUpKind: "clarify" | "deadline_preparation";
  question: string;
  providerNotice?: string | null;
  provider?: "apple-intelligence" | "gemini" | "deterministic";
  cloudFallbackAvailable?: boolean;
};
export function AssistantWorkspace({
  cloudFallbackConfigured,
  initialCommand = "",
  timezone,
}: {
  cloudFallbackConfigured: boolean;
  initialCommand?: string;
  timezone: string;
}) {
  const [command, setCommand] = useState(initialCommand);
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [follow, setFollow] = useState<Follow | null>(null),
    [clarify, setClarify] = useState(""),
    [prep, setPrep] = useState<DeadlinePreparation>({
      mode: "multiple",
      totalEffortMinutes: 120,
      sessionLengthMinutes: 60,
    }),
    [remember, setRemember] = useState(false),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [cloudConsentOpen, setCloudConsentOpen] = useState(false),
    [error, setError] = useState<string | null>(null),
    [success, setSuccess] = useState<string | null>(null);
  const native = nativeIntelligenceAvailable();

  useEffect(() => {
    let active = true;
    let handle: Awaited<ReturnType<typeof subscribeToTranscript>> = null;
    void prepareNativePlanner();
    void subscribeToTranscript((event) => {
      if (!active) return;
      setCommand(event.text);
      if (event.isFinal) setRecording(false);
    }).then((value) => {
      handle = value;
    });
    return () => {
      active = false;
      void handle?.remove();
    };
  }, []);

  async function interpret(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const nativeResult = extra.clarification
        ? null
        : await interpretNatively({
            command,
            timezone,
            contextVersion: 0,
          });
      const r = await fetch("/api/assistant/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command,
            ...(nativeResult
              ? { nativeIntent: plannerResultToIntent(nativeResult) }
              : {}),
            ...extra,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.status === "needs_input") {
        setFollow(d);
        setProposal(null);
      } else {
        setProposal(d);
        setFollow(null);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Kairos could not interpret that.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function interpretInCloud() {
    setCloudConsentOpen(false);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant/cloud-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          ...(clarify ? { clarification: clarify } : {}),
          consentGranted: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.status === "needs_input") {
        setFollow(data);
        setProposal(null);
      } else {
        setProposal(data);
        setFollow(null);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Cloud interpretation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(i: number, u: Partial<ProposalItem>) {
    setProposal((p) =>
      p
        ? { ...p, items: p.items.map((x, n) => (n === i ? { ...x, ...u } : x)) }
        : p,
    );
  }
  async function confirm() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/proposals/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            items: proposal.items,
            remember,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSuccess(d.message);
      setProposal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirmation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function startRecording() {
    setError(null);
    if (!native) {
      setError("Private live voice transcription is available in the iOS app.");
      return;
    }
    try {
      await NativeSpeech.start();
      setRecording(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "On-device transcription could not start.",
      );
    }
  }
  async function stopRecording() {
    try {
      await NativeSpeech.stop();
    } finally {
      setRecording(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <label
          htmlFor="command"
          className="font-display text-lg font-semibold text-[var(--navy)]"
        >
          What needs to happen?
        </label>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Describe the outcome. Kairos will show assumptions and ask when a
          detail matters.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "Plan gym three times next week",
            "Protect two hours to finish my report Friday",
            "Find a one-hour meeting with Chloe next week",
          ].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setCommand(example)}
              className="rounded-full bg-[var(--surface-low)] px-3 py-2 text-left text-xs text-[var(--navy)] hover:bg-[var(--cyan-soft)]"
            >
              {example}
            </button>
          ))}
        </div>
        <textarea
          id="command"
          rows={4}
          maxLength={2000}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Describe what you want Kairos to plan"
          className="mt-3 w-full rounded-xl border border-[var(--outline)] p-4 leading-6"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">
            Review required · {command.length}/2000
          </p>
          <div className="flex gap-2">
            <button
              onClick={() =>
                void (recording ? stopRecording() : startRecording())
              }
              disabled={busy}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${recording ? "border-[var(--error)] text-[var(--error)]" : "border-[var(--outline)] text-[var(--navy)]"}`}
            >
              {recording ? (
                <Square className="size-4 fill-current" />
              ) : (
                <Mic className="size-4" />
              )}
              {recording ? "Stop" : "Record"}
            </button>
            <button
              onClick={() => interpret()}
              disabled={busy || command.trim().length < 2}
              className="btn btn-primary min-h-11 px-5 text-sm"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Review proposal
            </button>
          </div>
        </div>
        {!native && (
          <p className="mt-4 rounded-xl bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--gold-deep)]">
            <strong>Typed planning is active.</strong> Private live voice and
            Apple Intelligence are available in the iOS app.
          </p>
        )}
      </section>
      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl bg-[#ffdad6] p-4 text-sm text-[#93000a]"
        >
          <AlertCircle className="size-5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="flex gap-3 rounded-xl bg-[#d9fbe8] p-4 text-sm text-[var(--success)]"
        >
          <Check className="size-5" />
          {success}
        </div>
      )}
      {follow && (
        <section className="card border-l-4 border-l-[var(--gold)] p-5">
          <p className="eyebrow">One essential detail</p>
          <h2 className="font-display mt-2 text-xl font-semibold text-[var(--navy)]">
            {follow.question}
          </h2>
          {follow.provider === "deterministic" &&
            follow.cloudFallbackAvailable &&
            cloudFallbackConfigured && (
              <button
                type="button"
                onClick={() => setCloudConsentOpen(true)}
                className="btn btn-outline mt-4 min-h-11 px-4"
              >
                Ask Gemini with filtered context
              </button>
            )}
          {follow.followUpKind === "deadline_preparation" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold">
                Sessions
                <select
                  value={prep.mode}
                  onChange={(e) =>
                    setPrep({
                      ...prep,
                      mode: e.target.value as "one" | "multiple",
                    })
                  }
                  className="min-h-11 rounded-xl border px-3"
                >
                  <option value="one">One block</option>
                  <option value="multiple">Multiple blocks</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Total minutes
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={prep.totalEffortMinutes}
                  onChange={(e) =>
                    setPrep({
                      ...prep,
                      totalEffortMinutes: Number(e.target.value),
                    })
                  }
                  className="min-h-11 rounded-xl border px-3"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Session minutes
                <input
                  type="number"
                  min={15}
                  step={15}
                  disabled={prep.mode === "one"}
                  value={
                    prep.mode === "one"
                      ? prep.totalEffortMinutes
                      : prep.sessionLengthMinutes
                  }
                  onChange={(e) =>
                    setPrep({
                      ...prep,
                      sessionLengthMinutes: Number(e.target.value),
                    })
                  }
                  className="min-h-11 rounded-xl border px-3"
                />
              </label>
              <button
                onClick={() =>
                  interpret({
                    deadlinePreparation: {
                      ...prep,
                      sessionLengthMinutes:
                        prep.mode === "one"
                          ? prep.totalEffortMinutes
                          : prep.sessionLengthMinutes,
                    },
                  })
                }
                className="btn btn-primary min-h-11 px-5 sm:col-span-3"
              >
                Place preparation blocks
              </button>
            </div>
          ) : (
            <div className="mt-4 flex gap-3">
              <input
                value={clarify}
                onChange={(e) => setClarify(e.target.value)}
                className="min-h-11 flex-1 rounded-xl border px-4"
                placeholder="Add the missing detail"
              />
              <button
                onClick={() => interpret({ clarification: clarify })}
                className="btn btn-primary px-5"
              >
                Continue
              </button>
            </div>
          )}
        </section>
      )}
      {proposal && (
        <section className="card overflow-hidden">
          <header className="border-b bg-[var(--surface-low)] p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="eyebrow">Editable confirmation</p>
                <h2 className="font-display mt-1 text-2xl font-semibold text-[var(--navy)]">
                  {proposal.summary}
                </h2>
              </div>
              <span className="rounded-full bg-[var(--gold-soft)] px-3 py-1 text-xs font-bold text-[var(--gold-deep)]">
                {proposal.provider === "apple-intelligence"
                  ? "Interpreted on device"
                  : proposal.provider === "gemini"
                    ? "Gemini fallback"
                    : "Limited fallback"}
              </span>
            </div>
            {proposal.providerNotice && (
              <p className="mt-3 text-sm text-[var(--gold-deep)]">
                {proposal.providerNotice}
              </p>
            )}
          </header>
          <div className="grid gap-4 p-5">
            {proposal.items.map((item, i) => (
              <article
                key={item.clientId}
                className="rounded-xl border border-[var(--outline)] p-4"
              >
                <label className="grid gap-2 text-sm font-semibold">
                  Title
                  <input
                    value={item.title}
                    onChange={(e) => edit(i, { title: e.target.value })}
                    className="min-h-11 rounded-xl border px-3 font-normal"
                  />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {item.type === "deadline" ? (
                    <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                      Due
                      <input
                        type="datetime-local"
                        value={toDateTimeLocal(item.dueAt, timezone)}
                        onChange={(e) =>
                          edit(i, {
                            dueAt: fromDateTimeLocal(e.target.value, timezone),
                          })
                        }
                        className="min-h-11 rounded-xl border px-3 font-normal"
                      />
                    </label>
                  ) : (
                    <>
                      <label className="grid gap-2 text-sm font-semibold">
                        Starts
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(item.startAt, timezone)}
                          onChange={(e) =>
                            edit(i, {
                              startAt: fromDateTimeLocal(
                                e.target.value,
                                timezone,
                              ),
                            })
                          }
                          className="min-h-11 rounded-xl border px-3 font-normal"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        Ends
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(item.endAt, timezone)}
                          onChange={(e) =>
                            edit(i, {
                              endAt: fromDateTimeLocal(
                                e.target.value,
                                timezone,
                              ),
                            })
                          }
                          className="min-h-11 rounded-xl border px-3 font-normal"
                        />
                      </label>
                    </>
                  )}
                </div>
                <details className="mt-4 rounded-xl bg-[var(--surface-low)] p-3">
                  <summary className="flex cursor-pointer list-none justify-between text-sm font-semibold text-[var(--navy)]">
                    Advanced constraints
                    <ChevronDown className="size-4" />
                  </summary>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1 text-xs">
                      Location
                      <input
                        value={item.locationLabel ?? ""}
                        onChange={(e) =>
                          edit(i, { locationLabel: e.target.value || null })
                        }
                        className="min-h-10 rounded-lg border bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      Category
                      <input
                        value={item.category}
                        onChange={(e) => edit(i, { category: e.target.value })}
                        className="min-h-10 rounded-lg border bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      Flexibility
                      <select
                        value={item.flexibility}
                        onChange={(e) =>
                          edit(i, {
                            flexibility: e.target
                              .value as ProposalItem["flexibility"],
                          })
                        }
                        className="min-h-10 rounded-lg border bg-white px-3 text-sm"
                      >
                        <option>fixed</option>
                        <option>protected</option>
                        <option>flexible</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs">
                      Reminder minutes
                      <input
                        type="number"
                        min={0}
                        value={item.reminderMinutes}
                        onChange={(e) =>
                          edit(i, { reminderMinutes: Number(e.target.value) })
                        }
                        className="min-h-10 rounded-lg border bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="text-sm">
                      <input
                        type="checkbox"
                        checked={item.canShorten}
                        onChange={(e) =>
                          edit(i, { canShorten: e.target.checked })
                        }
                      />{" "}
                      Can shorten
                    </label>
                    <label className="text-sm">
                      <input
                        type="checkbox"
                        checked={item.canSplit}
                        onChange={(e) =>
                          edit(i, { canSplit: e.target.checked })
                        }
                      />{" "}
                      Can split
                    </label>
                    <label className="text-sm">
                      <input
                        type="checkbox"
                        checked={item.canSkip}
                        onChange={(e) => edit(i, { canSkip: e.target.checked })}
                      />{" "}
                      Optional
                    </label>
                  </div>
                </details>
              </article>
            ))}
          </div>
          {proposal.assumptions.length > 0 && (
            <div className="mx-5 mb-5 rounded-xl bg-[var(--cyan-soft)] p-4 text-sm text-[var(--cyan-deep)]">
              <strong>Visible assumptions</strong>
              <ul className="mt-2 list-disc pl-5">
                {[...new Set(proposal.assumptions)].map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <footer className="border-t p-5">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-1"
              />
              <span>
                <strong>Remember this</strong>
                <br />
                <span className="text-[var(--muted)]">
                  Save category defaults only after confirmation.
                </span>
              </span>
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setProposal(null)}
                className="min-h-11 rounded-xl border px-5 font-semibold"
              >
                Discard
              </button>
              <button
                onClick={confirm}
                disabled={busy}
                className="btn btn-primary min-h-11 px-6"
              >
                <ShieldCheck className="size-4" />
                Confirm all items
              </button>
            </div>
          </footer>
        </section>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void clearNativePlannerHistory()}
          className="text-xs font-semibold text-[var(--muted)]"
        >
          Clear on-device assistant history
        </button>
      </div>
      <ConfirmDialog
        open={cloudConsentOpen}
        title="Send a filtered request to Gemini?"
        description="Kairos will send this command, relevant free/busy times, active hours, and minimum preferences. Unrelated titles become “Busy.” Audio, locations, messages, contacts, files, and the rest of your schedule are never sent."
        confirmLabel="Send filtered request"
        busy={busy}
        onCancel={() => setCloudConsentOpen(false)}
        onConfirm={() => void interpretInCloud()}
      />
    </div>
  );
}
