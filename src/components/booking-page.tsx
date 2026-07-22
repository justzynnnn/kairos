"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Download,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { formatDate, formatTime } from "@/lib/format";
type Booking = {
  id: string;
  title: string;
  state: string;
  durationMinutes: number;
  timezone: string;
  organizer: string;
  selectedOptionId: string | null;
  options: Array<{
    id: string;
    startAt: string;
    endAt: string;
    label: string;
    reason: string;
    source: string;
  }>;
};
export function BookingPage({ token }: { token: string }) {
  const [booking, setBooking] = useState<Booking | null>(null),
    [selected, setSelected] = useState(""),
    [counter, setCounter] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState<string | null>(null),
    [success, setSuccess] = useState<string | null>(null);
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/booking/${token}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBooking(data.booking);
      setSelected(
        data.booking.selectedOptionId ?? data.booking.options[0]?.id ?? "",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This booking link is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }, [token]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function respond(action: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/booking/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          optionId: selected || undefined,
          counterStart: counter ? new Date(counter).toISOString() : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBooking(data.booking);
      setSuccess(
        action === "decline"
          ? "You declined this request."
          : "Your response was sent. The organizer must give final confirmation before any calendar event is created.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your response could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function downloadCalendar() {
    if (!booking) return;
    const option = booking.options.find(
      (entry) => entry.id === booking.selectedOptionId,
    );
    if (!option) return;
    const stamp = (value: string) =>
      new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const clean = booking.title.replace(/[\\,;]/g, " ");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kairos//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${booking.id}@kairos`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(option.startAt)}`,
      `DTEND:${stamp(option.endAt)}`,
      `SUMMARY:${clean}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${clean || "meeting"}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function share() {
    if (!booking || !navigator.share) return;
    await navigator.share({
      title: booking.title,
      text: `Meeting with ${booking.organizer}`,
      url: window.location.href,
    });
  }
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Brand />
        <div className="mt-10 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--cyan-soft)] text-[var(--navy)]">
            <CalendarDays className="size-7" />
          </span>
          <p className="eyebrow mt-5">Private booking link</p>
          <h1 className="page-title mt-2">Respond without an account</h1>
          <p className="mt-2 text-[var(--muted)]">
            Only proposed times are visible. Private calendar details are never
            shared.
          </p>
        </div>
        {busy && !booking ? (
          <div
            role="status"
            aria-label="Loading booking request"
            className="card mt-8 space-y-3 p-5"
          >
            <div className="skeleton h-6 w-2/3 rounded-lg" />
            <div className="skeleton h-4 w-1/3 rounded-lg" />
            <div className="skeleton h-16 w-full rounded-xl" />
            <div className="skeleton h-16 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="mt-8 flex gap-2 rounded-xl bg-[#ffdad6] p-4 text-[#93000a]"
          >
            <AlertCircle className="size-5" />
            {error}
          </div>
        ) : (
          booking && (
            <section className="card mt-8 overflow-hidden">
              <header className="border-b border-[var(--outline)] bg-[var(--navy-container)] p-5 text-white">
                <p className="text-sm text-white/65">
                  {booking.organizer} wants to meet
                </p>
                <h2 className="font-display mt-1 break-words text-2xl font-semibold">
                  {booking.title}
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  {booking.durationMinutes} minutes · Meeting timezone:{" "}
                  {booking.timezone}
                  {localTimezone !== booking.timezone && (
                    <> · Your timezone: {localTimezone}</>
                  )}
                </p>
              </header>
              <div className="p-5">
                {success && (
                  <div
                    role="status"
                    className="mb-4 flex gap-2 rounded-xl bg-[#d5f6eb] p-4 text-sm text-[#075e49]"
                  >
                    <Check className="size-5 shrink-0" />
                    {success}
                  </div>
                )}
                {booking.state === "options_sent" ? (
                  <>
                    <div className="grid gap-2">
                      {booking.options.map((option) => (
                        <label
                          key={option.id}
                          className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected === option.id ? "border-[var(--navy)] bg-[var(--surface-low)]" : "border-[var(--outline)]"}`}
                        >
                          <input
                            type="radio"
                            name="booking-option"
                            checked={selected === option.id}
                            onChange={() => setSelected(option.id)}
                          />
                          <span>
                            <strong className="block text-[var(--navy)]">
                              {formatDate(option.startAt, booking.timezone)} ·{" "}
                              {formatTime(option.startAt, booking.timezone)}–
                              {formatTime(option.endAt, booking.timezone)}{" "}
                              {booking.timezone}
                            </strong>
                            {localTimezone !== booking.timezone && (
                              <span className="mt-1 block text-xs text-[var(--muted)]">
                                Your time:{" "}
                                {formatDate(option.startAt, localTimezone)} ·{" "}
                                {formatTime(option.startAt, localTimezone)}–
                                {formatTime(option.endAt, localTimezone)}
                              </span>
                            )}
                            <span className="mt-1 block text-xs text-[var(--cyan-deep)]">
                              {option.reason}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        disabled={busy || !selected}
                        onClick={() => respond("accept")}
                        className="btn btn-primary min-h-12 px-5"
                      >
                        Accept selected time
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => respond("decline")}
                        className="btn btn-danger min-h-12 px-4"
                      >
                        Decline
                      </button>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        aria-label="Counteroffer date and time"
                        type="datetime-local"
                        value={counter}
                        onChange={(event) => setCounter(event.target.value)}
                        className="min-h-11 rounded-xl border border-[var(--outline)] px-3"
                      />
                      <button
                        type="button"
                        disabled={busy || !counter}
                        onClick={() => respond("counter")}
                        className="btn min-h-11 bg-[var(--surface-high)] px-4 text-[var(--navy)] hover:bg-[color-mix(in_srgb,var(--surface-high)_82%,var(--navy))]"
                      >
                        Counteroffer
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <ShieldCheck className="mx-auto size-8 text-[var(--cyan-deep)]" />
                    <h3 className="font-display mt-3 text-xl font-semibold text-[var(--navy)]">
                      {booking.state === "confirmed"
                        ? "Meeting confirmed"
                        : "Response recorded"}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Current state: {booking.state.replaceAll("_", " ")}. You
                      cannot use this link to inspect anyone&apos;s calendar.
                    </p>
                    {booking.state === "confirmed" && (
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={downloadCalendar}
                          className="btn btn-primary min-h-11 px-4"
                        >
                          <Download className="size-4" />
                          Add to calendar
                        </button>
                        {typeof navigator !== "undefined" &&
                          "share" in navigator && (
                            <button
                              type="button"
                              onClick={() => void share()}
                              className="btn btn-outline min-h-11 px-4"
                            >
                              <Share2 className="size-4" />
                              Share
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )
        )}
      </div>
    </main>
  );
}
