import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearNativePlannerHistory,
  getNativeCapabilities,
  interpretNatively,
  NativeSpeech,
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
  buildScheduleProposal,
  SchedulingValidationError,
} from "@/lib/scheduling/engine";
import { deterministicInterpret } from "@/lib/scheduling/fallback";
import {
  schedulingIntentSchema,
  type ProposalItem,
  type SchedulingIntent,
} from "@/lib/scheduling/schema";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { mobileConfig } from "../lib/config";
import { useMobileData } from "../lib/data";
import { metricNow, recordMetric } from "../lib/metrics";

type HistoryEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultManualTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return {
    start: localInputValue(start),
    end: localInputValue(new Date(start.getTime() + 60 * 60_000)),
  };
}

export default function Assistant() {
  const auth = useAuth();
  const { data, confirmCreates } = useMobileData();
  const [command, setCommand] = useState("");
  const [recording, setRecording] = useState(false);
  const [reviewingTranscript, setReviewingTranscript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalItem[] | null>(null);
  const [summary, setSummary] = useState("");
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [provider, setProvider] = useState<
    "apple-intelligence" | "deterministic" | "gemini" | null
  >(null);
  const [capabilities, setCapabilities] = useState<NativeCapabilities | null>(
    null,
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cloudConsent, setCloudConsent] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const transcriptionStartedAt = useRef<number | null>(null);
  const accessTokenRef = useRef(auth.accessToken);
  const modernSpeechRef = useRef(false);

  useEffect(() => {
    accessTokenRef.current = auth.accessToken;
    modernSpeechRef.current = Boolean(capabilities?.speech.modern);
  }, [auth.accessToken, capabilities?.speech.modern]);

  const context = useMemo(() => {
    if (!data) return null;
    return {
      schedule: JSON.stringify(
        data.calendar
          .filter((item) => item.status === "scheduled")
          .slice(0, 300)
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
        timezone: data.viewer.timezone,
        activeHours: {
          start: data.viewer.activeStart,
          end: data.viewer.activeEnd,
        },
        categories: data.preferences,
      }),
    };
  }, [data]);

  useEffect(() => {
    let active = true;
    let listener: Awaited<ReturnType<typeof subscribeToTranscript>> = null;
    void Promise.all([getNativeCapabilities(), readAssistantHistory()]).then(
      ([available, entries]) => {
        if (!active) return;
        setCapabilities(available);
        setHistory(entries);
      },
    );
    if (mobileConfig.features.applePlanner) void prepareNativePlanner();
    void subscribeToTranscript((event) => {
      if (!active) return;
      setCommand(event.text);
      if (accessTokenRef.current && transcriptionStartedAt.current !== null)
        void recordMetric(
          accessTokenRef.current,
          "transcript_update",
          metricNow() - transcriptionStartedAt.current,
          { capability: modernSpeechRef.current ? "modern" : "legacy" },
        );
      if (event.isFinal) {
        setRecording(false);
        setReviewingTranscript(true);
      }
    }).then((value) => {
      listener = value;
    });
    return () => {
      active = false;
      void listener?.remove();
    };
  }, []);

  useEffect(() => {
    if (context) void updateNativePlannerContext(context);
  }, [context]);

  async function remember(role: HistoryEntry["role"], text: string) {
    const entry = { id: crypto.randomUUID(), role, text };
    setHistory((current) => [...current, entry].slice(-100));
    await appendAssistantHistory(entry);
  }

  function showIntent(intent: SchedulingIntent, nextProvider: typeof provider) {
    if (!data) return;
    if (intent.ambiguity) {
      setQuestion(intent.essential_question || "What detail should I use?");
      setProposal(null);
      setProvider(nextProvider);
      return;
    }
    try {
      const items = buildScheduleProposal(
        intent,
        data.calendar,
        data.preferences,
      );
      setProposal(items);
      setSummary(intent.summary);
      setAssumptions([
        ...intent.assumptions,
        ...items.flatMap((item) => item.assumptions),
      ]);
      setQuestion(null);
      setProvider(nextProvider);
      void remember("assistant", intent.summary);
    } catch (reason) {
      setQuestion(
        reason instanceof SchedulingValidationError
          ? reason.message
          : "I need another detail before this can be placed safely.",
      );
      setProposal(null);
    }
  }

  async function interpret(startedAt: number) {
    if (!data || command.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setQuestion(null);
    setReviewingTranscript(false);
    await remember("user", command.trim());
    let nativeFailure: string | null = null;
    try {
      const native = mobileConfig.features.applePlanner
        ? await interpretNatively({
            command: command.trim(),
            timezone: data.viewer.timezone,
            contextVersion: data.scheduleVersion,
            history: history
              .slice(-8)
              .map((entry) => entry.role + ": " + entry.text),
          })
        : null;
      if (native) {
        showIntent(plannerResultToIntent(native), "apple-intelligence");
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
    } catch (reason) {
      nativeFailure =
        reason instanceof Error
          ? reason.message
          : "Apple Intelligence could not safely interpret this request.";
    }
    const deterministic = deterministicInterpret(command.trim(), new Date());
    if (deterministic) {
      showIntent(deterministic, "deterministic");
      if (auth.accessToken)
        void recordMetric(
          auth.accessToken,
          "planner_response",
          metricNow() - startedAt,
          { capability: "deterministic" },
        );
    } else {
      setError(nativeFailure);
      if (mobileConfig.features.geminiFallback) setCloudConsent(true);
      else openManual();
    }
    setBusy(false);
  }

  async function askGemini() {
    if (!auth.accessToken) return;
    setCloudConsent(false);
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ intent: unknown }>(
        "/api/mobile/assistant/cloud-interpret",
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            command,
            consentGranted: true,
          }),
        },
      );
      showIntent(schedulingIntentSchema.parse(result.intent), "gemini");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Gemini fallback is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    if (!mobileConfig.features.nativeSpeech) return;
    setError(null);
    try {
      await NativeSpeech.start(capabilities?.speech.selectedLocale);
      transcriptionStartedAt.current = metricNow();
      setRecording(true);
      setReviewingTranscript(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Private transcription is unavailable.",
      );
    }
  }

  async function clearHistory() {
    await Promise.all([clearAssistantHistory(), clearNativePlannerHistory()]);
    setHistory([]);
  }

  function openManual() {
    const times = defaultManualTimes();
    setManualTitle(command.trim() || "New schedule item");
    setManualStart(times.start);
    setManualEnd(times.end);
    setCloudConsent(false);
    setManualOpen(true);
  }

  async function saveManual() {
    if (!data || !manualTitle.trim()) return;
    const start = new Date(manualStart);
    const end = new Date(manualEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      setError("Choose an end time after the start time.");
      return;
    }
    await confirmCreates([
      {
        type: "event",
        title: manualTitle.trim(),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        dueAt: null,
        timezone: data.viewer.timezone,
        flexibility: "flexible",
        priority: 3,
        reminderMinutes: 10,
      },
    ]);
    setManualOpen(false);
    setCommand("");
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">On-device conversation</p>
        <h1>Plan with Kairos</h1>
        <p className="supporting">
          Speak or type in English or Taglish. Nothing changes until you
          confirm.
        </p>
      </header>
      <section className="panel panel-pad page">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <span className="badge">
            {capabilities?.foundationModel.state === "available"
              ? "Apple Intelligence ready"
              : "Local safe fallback"}
          </span>
          <button className="secondary" onClick={() => void clearHistory()}>
            Clear history
          </button>
        </div>
        <label className="field">
          What needs to happen?
          <textarea
            value={command}
            maxLength={2_000}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Halimbawa: Block two hours for my report before Friday"
          />
        </label>
        {recording && (
          <div className="notice">
            Listening on this phone… Words appear above as you speak.
          </div>
        )}
        {reviewingTranscript && (
          <div className="success">
            Transcript ready. Edit anything above, then review the proposal.
          </div>
        )}
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || !mobileConfig.features.nativeSpeech}
            onClick={() =>
              void (recording
                ? NativeSpeech.stop().then(() => {
                    setRecording(false);
                    setReviewingTranscript(true);
                  })
                : startVoice())
            }
          >
            {recording ? "Stop" : "Voice"}
          </button>
          {recording && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void NativeSpeech.cancel().then(() => {
                  setRecording(false);
                  setReviewingTranscript(false);
                })
              }
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={busy || command.trim().length < 2}
            onClick={(event) => void interpret(event.timeStamp)}
          >
            {busy ? "Planning…" : "Review"}
          </button>
          <button type="button" className="secondary" onClick={openManual}>
            Schedule manually
          </button>
        </div>
      </section>
      {error && <div className="error">{error}</div>}
      {question && (
        <section className="panel panel-pad">
          <p className="eyebrow">One essential detail</p>
          <h2>{question}</h2>
          <p className="supporting">
            Add the answer to your request above and review again.
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
                : provider === "gemini"
                  ? "Filtered Gemini"
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
            <button className="secondary" onClick={() => setProposal(null)}>
              Discard
            </button>
            <button
              className="primary"
              onClick={() =>
                void confirmCreates(proposal).then(() => {
                  setProposal(null);
                  setCommand("");
                })
              }
            >
              Confirm on this phone
            </button>
          </div>
        </section>
      )}
      {cloudConsent && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal page"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cloud-title"
          >
            <div>
              <p className="eyebrow">Optional cloud fallback</p>
              <h2 id="cloud-title">Send a filtered request to Gemini?</h2>
              <p className="supporting">
                Kairos sends this command, relevant free/busy times, active
                hours, and minimum preferences. Unrelated titles become “Busy.”
                Audio, locations, messages, contacts, files, and the rest of
                your schedule are not sent.
              </p>
            </div>
            <div className="actions">
              <button className="secondary" onClick={openManual}>
                Keep local and schedule manually
              </button>
              <button className="primary" onClick={() => void askGemini()}>
                Send filtered request
              </button>
            </div>
          </section>
        </div>
      )}
      {manualOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal page"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-title"
          >
            <div>
              <p className="eyebrow">Manual scheduling</p>
              <h2 id="manual-title">Add this on your phone</h2>
              <p className="supporting">
                Nothing is sent to an AI provider. Times use this phone and will
                be validated again in{" "}
                {data?.viewer.timezone ?? "your account timezone"} when synced.
              </p>
            </div>
            <label className="field">
              Title
              <input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                maxLength={160}
              />
            </label>
            <label className="field">
              Starts
              <input
                type="datetime-local"
                value={manualStart}
                onChange={(event) => setManualStart(event.target.value)}
              />
            </label>
            <label className="field">
              Ends
              <input
                type="datetime-local"
                value={manualEnd}
                onChange={(event) => setManualEnd(event.target.value)}
              />
            </label>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setManualOpen(false)}
              >
                Cancel
              </button>
              <button className="primary" onClick={() => void saveManual()}>
                Add on this phone
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
