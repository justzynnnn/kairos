"use client";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatDate, formatTime } from "@/lib/format";
import type { MeetingCard } from "@/lib/meetings/types";

const labels: Record<MeetingCard["state"], string> = {
  draft: "Private draft",
  options_sent: "Awaiting recipient",
  awaiting_sender_confirmation: "Awaiting sender",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};
function OptionTime({ start, end }: { start: string; end: string }) {
  return (
    <>
      {formatDate(start)} · {formatTime(start)}–{formatTime(end)}
    </>
  );
}
export function MeetingInbox({
  supabaseConfigured,
  role,
  meetingId,
}: {
  supabaseConfigured: boolean;
  role: "justin" | "chloe";
  meetingId?: string;
}) {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingCard[]>([]),
    [command, setCommand] = useState(""),
    [selected, setSelected] = useState<Record<string, string>>({}),
    [counter, setCounter] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState<"active" | "drafts" | "history" | "all">(
      "all",
    ),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const bookingPaths = useRef<Record<string, string>>({});
  const headers = useCallback(
    (): Record<string, string> =>
      supabaseConfigured ? {} : { "x-demo-user": role },
    [role, supabaseConfigured],
  );
  const visibleMeetings = useMemo(() => {
    if (meetingId)
      return meetings.filter((meeting) => meeting.id === meetingId);
    if (filter === "all") return meetings;
    if (filter === "drafts")
      return meetings.filter((meeting) => meeting.state === "draft");
    if (filter === "history")
      return meetings.filter((meeting) =>
        ["confirmed", "declined", "expired", "cancelled"].includes(
          meeting.state,
        ),
      );
    return meetings.filter((meeting) =>
      ["options_sent", "awaiting_sender_confirmation"].includes(meeting.state),
    );
  }, [filter, meetingId, meetings]);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/meetings", { headers: headers() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMeetings(
        (data.meetings ?? []).map((meeting: MeetingCard) => ({
          ...meeting,
          bookingPath:
            meeting.bookingPath ?? bookingPaths.current[meeting.id] ?? null,
        })),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Meeting requests could not be loaded.",
      );
    }
  }, [headers]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!supabaseConfigured) return;
    const client = createBrowserSupabaseClient(),
      channel = client
        .channel("meeting-inbox")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "meeting_requests" },
          () => load(),
        )
        .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [load, supabaseConfigured]);
  async function create() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();
      if (data.status === "needs_input") {
        setError(data.question);
        return;
      }
      if (!response.ok) throw new Error(data.error);
      if (data.meeting.bookingPath)
        bookingPaths.current[data.meeting.id] = data.meeting.bookingPath;
      setNotice(
        data.meeting.state === "draft"
          ? "Private draft created. Nothing was sent."
          : "Meeting options sent with your explicit command authorization.",
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Kairos could not coordinate that meeting.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(meeting: MeetingCard, action: string) {
    setBusy(true);
    setError(null);
    try {
      const counterStart = counter[meeting.id]
        ? new Date(counter[meeting.id]).toISOString()
        : undefined;
      const response = await fetch(`/api/meetings/${meeting.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({
          action,
          optionId:
            selected[meeting.id] ??
            meeting.selectedOptionId ??
            meeting.options[0]?.id,
          counterStart,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice(
        action === "confirm"
          ? "Meeting confirmed on both Kairos calendars."
          : "Meeting request updated.",
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That response is no longer valid.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copyPath(path: string) {
    await navigator.clipboard.writeText(`${location.origin}${path}`);
    setNotice(
      "Booking link copied. Share it with your guest using your preferred app.",
    );
  }
  async function discuss(meeting: MeetingCard) {
    const other = meeting.participants.find(
      (participant) =>
        participant.userId && participant.userId !== meeting.actorId,
    );
    if (!other?.userId) {
      setError("Guest meetings use the booking link instead of a Kairos chat.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ userId: other.userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(
        `/inbox/chats/${data.conversationId}${supabaseConfigured ? "" : `?demoUser=${role}`}` as Route,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Conversation could not be opened.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {!meetingId && (
        <div
          className="segmented-control max-w-full overflow-x-auto"
          aria-label="Meeting status filters"
        >
          {(["active", "drafts", "history", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      )}
      {!meetingId && (
        <section className="card overflow-hidden">
          <div className="bg-[var(--navy-container)] p-5 text-white">
            <h3 className="font-display text-xl font-semibold">New meeting</h3>
            <div className="mt-4 flex gap-2 rounded-2xl bg-white p-2">
              <input
                aria-label="Meeting command"
                placeholder="Describe the meeting to coordinate"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--ink)] outline-none"
              />
              <button
                aria-label="Coordinate meeting"
                disabled={busy || command.trim().length < 3}
                onClick={create}
                className="grid size-11 place-items-center rounded-xl bg-[var(--cyan-deep)] text-white disabled:opacity-45"
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </div>
          </div>
        </section>
      )}
      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl bg-[#ffdad6] p-4 text-sm text-[#93000a]"
        >
          <AlertCircle className="size-5 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex gap-2 rounded-xl bg-[#d5f6eb] p-4 text-sm text-[#075e49]"
        >
          <Check className="size-5 shrink-0" />
          {notice}
        </div>
      )}
      <section className="space-y-4" aria-label="Meeting requests">
        {visibleMeetings.length === 0 ? (
          <div className="card grid min-h-72 place-items-center p-8 text-center">
            <div>
              <Inbox className="mx-auto size-10 text-[var(--cyan-deep)]" />
              <h2 className="font-display mt-4 text-xl font-semibold text-[var(--navy)]">
                {meetingId ? "Meeting unavailable" : "No meetings in this view"}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {meetingId
                  ? "This request may have been removed or is not available to this account."
                  : "Choose another status or create a private draft above."}
              </p>
            </div>
          </div>
        ) : (
          visibleMeetings.map((meeting) => {
            const recipient = meeting.participants.find(
                (participant) => participant.role === "recipient",
              ),
              organizer = meeting.participants.find(
                (participant) => participant.role === "organizer",
              ),
              selectedId =
                selected[meeting.id] ??
                meeting.selectedOptionId ??
                meeting.options[0]?.id;
            return (
              <article key={meeting.id} className="card overflow-hidden">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--outline)] p-5">
                  <div className="flex gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--cyan-soft)] text-[var(--navy)]">
                      <UserRound className="size-5" />
                    </span>
                    <div>
                      <p className="eyebrow">
                        {meeting.actorRole === "recipient"
                          ? `${organizer?.name} wants to meet`
                          : `With ${recipient?.name}`}
                      </p>
                      <h2 className="font-display mt-1 break-words text-xl font-semibold text-[var(--navy)]">
                        {meeting.title}
                      </h2>
                      <p className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]">
                        <Clock3 className="size-4" />
                        {meeting.durationMinutes} minutes · {meeting.timezone}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${meeting.state === "confirmed" ? "bg-[#d5f6eb] text-[#075e49]" : meeting.state === "declined" || meeting.state === "cancelled" ? "bg-[#ffdad6] text-[#93000a]" : "bg-[var(--gold-soft)] text-[var(--gold-deep)]"}`}
                    >
                      {labels[meeting.state]}
                    </span>
                    {!meetingId && (
                      <Link
                        href={
                          `/inbox/meetings/${meeting.id}${supabaseConfigured ? "" : `?demoUser=${role}`}` as Route
                        }
                        className="text-xs font-semibold text-[var(--cyan-deep)]"
                      >
                        View details
                      </Link>
                    )}
                  </div>
                </header>
                <div className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Optimized openings
                  </p>
                  <div className="mt-3 grid gap-2">
                    {meeting.options.map((option) => (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selectedId === option.id ? "border-[var(--navy)] bg-[var(--surface-low)]" : "border-[var(--outline)]"}`}
                      >
                        <input
                          type="radio"
                          name={`option-${meeting.id}`}
                          checked={selectedId === option.id}
                          onChange={() =>
                            setSelected((value) => ({
                              ...value,
                              [meeting.id]: option.id,
                            }))
                          }
                          disabled={meeting.state !== "options_sent"}
                        />
                        <span>
                          <strong className="block text-sm text-[var(--navy)]">
                            <OptionTime
                              start={option.startAt}
                              end={option.endAt}
                            />
                          </strong>
                          <span className="mt-1 block text-xs text-[var(--cyan-deep)]">
                            {option.reason}
                            {option.source === "counter"
                              ? " · Counteroffer"
                              : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {meeting.actorRole === "organizer" &&
                    meeting.state === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() => act(meeting, "send")}
                        className="btn btn-primary mt-4 min-h-11 px-5"
                      >
                        Send these options
                      </button>
                    )}
                  {meeting.actorRole === "recipient" &&
                    meeting.state === "options_sent" && (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={busy || !selectedId}
                            onClick={() => act(meeting, "accept")}
                            className="btn btn-primary min-h-11 px-5"
                          >
                            Accept selected time
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => act(meeting, "decline")}
                            className="min-h-11 px-4 font-semibold text-[var(--error)]"
                          >
                            Decline
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <label
                            className="sr-only"
                            htmlFor={`counter-${meeting.id}`}
                          >
                            Counteroffer date and time
                          </label>
                          <input
                            id={`counter-${meeting.id}`}
                            type="datetime-local"
                            value={counter[meeting.id] ?? ""}
                            onChange={(event) =>
                              setCounter((value) => ({
                                ...value,
                                [meeting.id]: event.target.value,
                              }))
                            }
                            className="min-h-11 rounded-xl border border-[var(--outline)] px-3"
                          />
                          <button
                            type="button"
                            disabled={busy || !counter[meeting.id]}
                            onClick={() => act(meeting, "counter")}
                            className="btn min-h-11 bg-[var(--surface-high)] px-4 text-[var(--navy)] hover:bg-[color-mix(in_srgb,var(--surface-high)_82%,var(--navy))]"
                          >
                            Counteroffer
                          </button>
                        </div>
                      </div>
                    )}
                  {meeting.actorRole === "organizer" &&
                    meeting.state === "awaiting_sender_confirmation" && (
                      <div className="mt-4 rounded-xl bg-[var(--gold-soft)] p-4">
                        <p className="text-sm text-[var(--gold-deep)]">
                          The recipient chose or countered with this time. Only
                          your final confirmation creates calendar events.
                        </p>
                        <button
                          disabled={busy}
                          onClick={() => act(meeting, "confirm")}
                          className="btn btn-primary mt-3 min-h-11 px-5"
                        >
                          Final confirmation
                        </button>
                      </div>
                    )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void discuss(meeting)}
                    className="btn btn-outline mt-4 min-h-10 px-4 text-xs"
                  >
                    Discuss this request
                  </button>
                  {meeting.bookingPath && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--cyan-deep)] p-3">
                      <a
                        href={meeting.bookingPath}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-[var(--cyan-deep)]"
                      >
                        Open no-account booking page
                      </a>
                      <button
                        onClick={() => copyPath(meeting.bookingPath!)}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--navy)]"
                      >
                        <Copy className="size-3" />
                        Copy link
                      </button>
                    </div>
                  )}
                  {meeting.state === "confirmed" && (
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#075e49]">
                      <CalendarDays className="size-4" />
                      Matching calendar events created.
                    </p>
                  )}
                  {meeting.actorRole === "organizer" &&
                    !(
                      [
                        "confirmed",
                        "declined",
                        "cancelled",
                        "expired",
                      ] as string[]
                    ).includes(meeting.state) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(meeting, "cancel")}
                        className="btn btn-danger mt-4 min-h-10 gap-1 px-3 text-xs"
                      >
                        <X className="size-3" />
                        Cancel request
                      </button>
                    )}
                </div>
              </article>
            );
          })
        )}
      </section>
      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-low)] p-4 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-2">
          <LockKeyhole className="size-4" />
          Free/busy matching never exposes private event titles.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={load}
          className="btn btn-ghost min-h-11 px-3 text-[var(--navy)]"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </footer>
    </div>
  );
}
