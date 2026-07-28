import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearNativePlannerHistory,
  getNativeCapabilities,
  interpretNatively,
  NativeSpeech,
  openAppSettings,
  prepareNativePlanner,
  subscribeToTranscript,
  updateNativePlannerContext,
} from "@/lib/mobile/native";
import {
  plannerResultToIntent,
  type NativeCapabilities,
} from "@/lib/mobile/contracts";
import {
  appendAssistantHistory,
  clearAssistantHistory,
  readAssistantHistory,
} from "@/lib/mobile/store";
import {
  planScheduleProposal,
  SchedulingValidationError,
  type RejectedAction,
} from "@/lib/scheduling/engine";
import { deterministicInterpret } from "@/lib/scheduling/fallback";
import type { ProposalItem, SchedulingIntent } from "@/lib/scheduling/schema";
import type { CalendarItem } from "@/lib/types";
import Toast from "../components/toast";
import VoiceSheet from "../components/voice-sheet";
import { useAuth } from "../lib/auth";
import { readAutoMode } from "../lib/auto-mode";
import { mobileConfig } from "../lib/config";
import { useMobileData } from "../lib/data";
import {
  claimAssistantDraft,
  peekAssistantDraft,
  subscribeToAssistantDraft,
} from "../lib/draft";
import { Mic } from "../lib/icons";
import { metricNow, recordMetric } from "../lib/metrics";

type HistoryEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type Provider = "apple-intelligence" | "deterministic";

const modelLabels: Record<
  NativeCapabilities["foundationModel"]["state"],
  string
> = {
  available: "Apple Intelligence ready",
  downloading: "Model downloading",
  unavailable: "On-device planning",
  unsupported: "On-device planning",
};

export default function Assistant() {
  const auth = useAuth();
  const { data, confirmCreates, queueItemAction } = useMobileData();
  // Claimed during the first render rather than in an effect, so the handoff
  // from Home's quick capture is already in the box on the first paint.
  const [draft] = useState(peekAssistantDraft);
  const [command, setCommand] = useState(draft?.text ?? "");
  const [recording, setRecording] = useState(false);
  const [startingVoice, setStartingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalItem[] | null>(null);
  const [rejected, setRejected] = useState<RejectedAction[]>([]);
  const [summary, setSummary] = useState("");
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [capabilities, setCapabilities] = useState<NativeCapabilities | null>(
    null,
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [autoMode, setAutoMode] = useState(false);
  const [undo, setUndo] = useState<CalendarItem[] | null>(null);
  const transcriptionStartedAt = useRef<number | null>(null);
  const commandBeforeVoice = useRef("");
  const accessTokenRef = useRef(auth.accessToken);
  const modernSpeechRef = useRef(false);

  useEffect(() => {
    accessTokenRef.current = auth.accessToken;
    modernSpeechRef.current = Boolean(capabilities?.speech.modern);
  }, [auth.accessToken, capabilities?.speech.modern]);

  const timezone = data?.viewer.timezone ?? "Asia/Manila";
  const scheduleVersion = data?.scheduleVersion ?? 0;
  const preferences = data?.preferences;
  const activeStart = data?.viewer.activeStart;
  const activeEnd = data?.viewer.activeEnd;
  const calendar = data?.calendar;

  /*
   * Keyed on the schedule's version rather than on the bootstrap object.
   * `data` is replaced by every background refresh, and this used to serialise
   * three hundred items and push them across the bridge each time — work that
   * only matters when the schedule itself has changed.
   *
   * The window is narrowed to the fortnight either side of now for the same
   * reason: the model reads this to find free time and spot conflicts, and
   * nothing it decides depends on an event six weeks out.
   */
  const context = useMemo(() => {
    if (!calendar || !preferences) return null;
    const from = Date.now() - 14 * 86_400_000;
    const to = Date.now() + 14 * 86_400_000;
    return {
      schedule: JSON.stringify(
        calendar
          .filter((item) => {
            if (item.status !== "scheduled") return false;
            const at = item.startAt ?? item.dueAt;
            if (!at) return false;
            const time = new Date(at).getTime();
            return time >= from && time <= to;
          })
          .slice(0, 200)
          .map((item) => ({
            title: item.title,
            type: item.type,
            startAt: item.startAt,
            endAt: item.endAt,
            dueAt: item.dueAt,
            flexibility: item.flexibility,
          })),
      ),
      preferences: JSON.stringify({
        timezone,
        activeHours: { start: activeStart, end: activeEnd },
        categories: preferences,
      }),
    };
    // `calendar` is intentionally absent: a new array arrives on every refresh,
    // and scheduleVersion is what actually tracks a change to its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleVersion, timezone, preferences, activeStart, activeEnd]);

  useEffect(() => {
    let active = true;
    let listener: Awaited<ReturnType<typeof subscribeToTranscript>> = null;
    void Promise.all([
      getNativeCapabilities(),
      readAssistantHistory(),
      readAutoMode(),
    ]).then(([available, entries, auto]) => {
      if (!active) return;
      setCapabilities(available);
      setHistory(entries);
      setAutoMode(auto);
    });
    if (mobileConfig.features.applePlanner) void prepareNativePlanner();
    void subscribeToTranscript((event) => {
      if (!active) return;
      setCommand(event.text);
      setStartingVoice(false);
      if (accessTokenRef.current && transcriptionStartedAt.current !== null)
        void recordMetric(
          accessTokenRef.current,
          "transcript_update",
          metricNow() - transcriptionStartedAt.current,
          { capability: modernSpeechRef.current ? "modern" : "legacy" },
        );
      if (event.isFinal) setRecording(false);
    }).then((value) => {
      listener = value;
      if (!active) void value?.remove();
    });
    return () => {
      active = false;
      void listener?.remove();
    };
  }, []);

  useEffect(() => {
    if (context) void updateNativePlannerContext(context);
  }, [context]);

  // A draft that arrived with a submit is interpreted straight away; one that
  // arrived from the mic button opens the recorder instead. Tapping through
  // without either just leaves the text in the box.
  useEffect(() => {
    if (!draft || !claimAssistantDraft(draft)) return;
    if (draft.record) void startVoice();
    else if (draft.submitted) void interpret(metricNow(), draft.text);
    // startVoice and interpret are recreated every render; this runs once per
    // draft, which the claim above enforces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Only relevant when this tab is already on screen; the module keeps the
  // draft for the usual case where Home mounts it fresh.
  useEffect(
    () => subscribeToAssistantDraft((value) => setCommand(value.text)),
    [],
  );

  async function remember(role: HistoryEntry["role"], text: string) {
    const entry = { id: crypto.randomUUID(), role, text };
    setHistory((current) => [...current, entry].slice(-100));
    await appendAssistantHistory(entry);
  }

  function clearResult() {
    setProposal(null);
    setRejected([]);
    setQuestion(null);
    setError(null);
  }

  async function showIntent(intent: SchedulingIntent, next: Provider) {
    if (!data) return;
    setProvider(next);
    if (intent.ambiguity) {
      setQuestion(intent.essential_question || "What detail should I use?");
      setProposal(null);
      setRejected([]);
      return;
    }
    let plan;
    try {
      plan = planScheduleProposal(intent, data.calendar, data.preferences);
    } catch (reason) {
      setQuestion(
        reason instanceof SchedulingValidationError
          ? reason.message
          : "I need another detail before this can be placed safely.",
      );
      setProposal(null);
      setRejected([]);
      return;
    }
    if (!plan.items.length) {
      setQuestion(
        plan.rejected[0]?.reason ??
          "I could not place anything from that request.",
      );
      setProposal(null);
      setRejected(plan.rejected);
      return;
    }
    setQuestion(null);
    setSummary(intent.summary);
    setAssumptions([
      ...intent.assumptions,
      ...plan.items.flatMap((item) => item.assumptions),
    ]);
    void remember("assistant", intent.summary);

    /*
     * Auto mode skips the card, but only when there is nothing left to decide.
     * An action the engine could not place is a question the user has to
     * answer, and quietly dropping it because they opted out of reviewing is
     * the one failure this feature cannot have.
     */
    if (autoMode && !plan.rejected.length) {
      setProposal(null);
      setRejected([]);
      const created = await confirmCreates(plan.items);
      setCommand("");
      if (created.length) setUndo(created);
      return;
    }
    setProposal(plan.items);
    setRejected(plan.rejected);
  }

  async function interpret(startedAt: number, text = command) {
    const value = text.trim();
    if (!data || value.length < 2) return;
    setBusy(true);
    clearResult();
    await remember("user", value);

    // Apple Intelligence first, then the deterministic parser. The cascade is
    // automatic: the tier that answered is reported afterwards, never chosen.
    let nativeFailure: string | null = null;
    if (mobileConfig.features.applePlanner) {
      const native = await interpretNatively({
        command: value,
        timezone,
        contextVersion: scheduleVersion,
        history: history
          .slice(-8)
          .map((entry) => entry.role + ": " + entry.text),
      });
      if (native.ok) {
        await showIntent(
          plannerResultToIntent(native.value),
          "apple-intelligence",
        );
        if (auth.accessToken)
          void recordMetric(
            auth.accessToken,
            "planner_response",
            metricNow() - startedAt,
            { capability: "apple-intelligence" },
          );
        setBusy(false);
        return;
      }
      nativeFailure = native.message;
    }

    const deterministic = deterministicInterpret(
      value,
      new Date(),
      undefined,
      timezone,
    );
    if (deterministic) {
      await showIntent(deterministic, "deterministic");
      if (auth.accessToken)
        void recordMetric(
          auth.accessToken,
          "planner_response",
          metricNow() - startedAt,
          { capability: "deterministic" },
        );
    } else {
      // Both tiers declined. Everything stays on this phone, so the only way
      // forward is a clearer sentence.
      setQuestion(
        "I could not work out the times in that. Try naming each item with its time, like “gym at 6am, lunch at 12nn”.",
      );
      if (nativeFailure) setError(nativeFailure);
    }
    setBusy(false);
  }

  async function startVoice() {
    if (!mobileConfig.features.nativeSpeech) return;
    // The sheet opens before the native call rather than after it. Starting a
    // session means a permission check, an audio-session activation and
    // sometimes a model download, and a button that does nothing for a second
    // reads as a broken button.
    setVoiceError(null);
    setStartingVoice(true);
    setRecording(true);
    // Partial results overwrite the box as they arrive, so whatever was typed
    // before the mic opened has to be kept somewhere to survive a cancel.
    commandBeforeVoice.current = command;
    try {
      await NativeSpeech.start(capabilities?.speech.selectedLocale);
      transcriptionStartedAt.current = metricNow();
      setStartingVoice(false);
    } catch (reason) {
      setStartingVoice(false);
      setVoiceError(
        reason instanceof Error
          ? reason.message
          : "Private transcription is unavailable.",
      );
    }
  }

  async function stopVoice(cancelled: boolean) {
    setRecording(false);
    setStartingVoice(false);
    try {
      await (cancelled ? NativeSpeech.cancel() : NativeSpeech.stop());
    } catch {
      // The sheet is already closed; a failed teardown has nothing to add.
    }
    // Cancel means "forget what I just said", not "delete what I had written".
    if (cancelled) setCommand(commandBeforeVoice.current);
  }

  async function undoLastAdd() {
    const items = undo;
    if (!items) return;
    setUndo(null);
    for (const item of items) await queueItemAction(item, "cancel");
  }

  async function refreshCapabilities() {
    setCapabilities(await getNativeCapabilities());
  }

  async function clearHistory() {
    setHistory([]);
    await Promise.all([clearAssistantHistory(), clearNativePlannerHistory()]);
  }

  const speechBlocked =
    capabilities?.speech.state === "denied" ||
    capabilities?.speech.state === "restricted";

  return (
    <main className="page">
      <header>
        <p className="eyebrow">On device</p>
        <h1>Plan with Mori</h1>
        <p className="supporting">
          {autoMode
            ? "Speak or type in English or Taglish. Items go straight to your planner."
            : "Speak or type in English or Taglish. Nothing changes until you confirm."}
        </p>
      </header>
      <section className="panel panel-pad page">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <span className="badge">
            {modelLabels[capabilities?.foundationModel.state ?? "unsupported"]}
          </span>
          <button className="secondary" onClick={() => void clearHistory()}>
            Clear history
          </button>
        </div>
        {/*
          When the on-device model is not usable, the reason is worth more than
          the fact: "turned off" and "still downloading" need different actions
          from the user, and both still plan locally.
        */}
        {capabilities &&
          capabilities.foundationModel.state !== "available" &&
          capabilities.foundationModel.reason && (
            <div className="notice">
              {capabilities.foundationModel.reason} Mori still plans on this
              phone.
              {capabilities.foundationModel.state === "downloading" && (
                <button
                  type="button"
                  className="secondary full"
                  style={{ marginTop: 10 }}
                  onClick={() => void refreshCapabilities()}
                >
                  Check again
                </button>
              )}
            </div>
          )}
        {speechBlocked && (
          <div className="notice">
            Dictation needs the microphone and speech recognition, which are
            turned off for Mori. Typing still works.
            <button
              type="button"
              className="secondary full"
              style={{ marginTop: 10 }}
              onClick={() => void openAppSettings()}
            >
              Open Settings
            </button>
          </div>
        )}
        <label className="field">
          What needs to happen?
          <textarea
            value={command}
            maxLength={2_000}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Halimbawa: Circuits 1 at 9-11:30am, lunch at 12nn, gym at 1:30 to 3pm"
          />
        </label>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={
              busy || speechBlocked || !mobileConfig.features.nativeSpeech
            }
            onClick={() => void startVoice()}
          >
            <Mic size={18} strokeWidth={2.5} aria-hidden />
            Record
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || command.trim().length < 2}
            onClick={(event) => void interpret(event.timeStamp)}
          >
            {busy
              ? "Planning…"
              : autoMode
                ? "Add to planner"
                : "Review proposal"}
          </button>
        </div>
      </section>
      {error && <div className="error">{error}</div>}
      {question && (
        <section className="panel panel-pad">
          <p className="eyebrow">One essential detail</p>
          <h2>{question}</h2>
          <p className="supporting">
            Add the answer to your request above and try again.
          </p>
        </section>
      )}
      {proposal && (
        <section className="panel panel-pad page">
          <div>
            <p className="eyebrow">Editable confirmation</p>
            <h2>{summary}</h2>
            <span className="badge">
              {provider === "apple-intelligence"
                ? "On device"
                : "Deterministic"}
            </span>
          </div>
          {proposal.map((item, index) => (
            <article className="panel panel-pad" key={item.clientId}>
              <label className="field">
                Title
                <input
                  value={item.title}
                  onChange={(event) =>
                    setProposal((current) =>
                      current
                        ? current.map((value, itemIndex) =>
                            itemIndex === index
                              ? { ...value, title: event.target.value }
                              : value,
                          )
                        : current,
                    )
                  }
                />
              </label>
              <p className="row-meta" style={{ marginTop: 10 }}>
                {item.type === "deadline"
                  ? item.dueAt
                  : item.startAt + " – " + item.endAt}
              </p>
            </article>
          ))}
          {/*
            An item the engine could not place is reported rather than dropped.
            The rest of a compound request is still worth confirming, but the
            user has to be told which part of what they said did not survive.
          */}
          {rejected.length > 0 && (
            <div className="notice">
              <strong>Not placed</strong>
              <ul>
                {rejected.map((entry) => (
                  <li key={entry.title}>{entry.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {assumptions.length > 0 && (
            <div className="notice">
              <strong>Visible assumptions</strong>
              <ul>
                {[...new Set(assumptions)].map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="actions">
            <button className="secondary" onClick={clearResult}>
              Discard
            </button>
            <button
              className="primary"
              onClick={() =>
                void confirmCreates(proposal).then(() => {
                  clearResult();
                  setCommand("");
                })
              }
            >
              Confirm on this phone
            </button>
          </div>
        </section>
      )}
      {recording && (
        <VoiceSheet
          transcript={command}
          starting={startingVoice}
          error={voiceError}
          onCancel={() => void stopVoice(true)}
          onDone={() => void stopVoice(false)}
        />
      )}
      {undo && (
        <Toast
          message={`${undo.length} item${undo.length === 1 ? "" : "s"} added to your planner.`}
          actionLabel="Undo"
          onAction={() => void undoLastAdd()}
          onDismiss={() => setUndo(null)}
        />
      )}
    </main>
  );
}
