import { useEffect, useRef, useState } from "react";
import { subscribeToAudioLevel } from "@/lib/mobile/native";
import { Mic, X } from "../lib/icons";

/**
 * The recording surface. Dictation used to happen behind a button on a form,
 * which gave the user nothing to look at while the only thing that mattered —
 * whether the phone was hearing them — was invisible. This takes over the
 * screen for the duration: the ring answers to the microphone, the words appear
 * as they are recognised, and the two ways out are the only controls.
 *
 * The ring is driven straight from the level events through a ref. Twenty
 * amplitude samples a second through `setState` would be twenty React renders a
 * second, all to move one element, so the value is written to a CSS custom
 * property inside a rAF instead and never enters the render path.
 */
export default function VoiceSheet({
  transcript,
  starting,
  error,
  onCancel,
  onDone,
}: {
  transcript: string;
  starting: boolean;
  error: string | null;
  onCancel(): void;
  onDone(): void;
}) {
  const ring = useRef<HTMLDivElement>(null);
  const level = useRef(0);
  const smoothed = useRef(0);
  const words = useRef<HTMLParagraphElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let listener: Awaited<ReturnType<typeof subscribeToAudioLevel>> = null;
    let active = true;
    void subscribeToAudioLevel((event) => {
      level.current = event.level;
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
    let frame = 0;
    const paint = () => {
      // Rising fast and falling slow reads as a voice rather than as noise:
      // the ring snaps open on a syllable and settles between them.
      const target = level.current;
      const rate = target > smoothed.current ? 0.35 : 0.08;
      smoothed.current += (target - smoothed.current) * rate;
      ring.current?.style.setProperty("--level", smoothed.current.toFixed(3));
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Long dictation should keep the newest words in view without stealing focus.
  useEffect(() => {
    const node = words.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [transcript]);

  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="voice-backdrop" role="presentation">
      <section
        className="voice-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-title"
      >
        <header className="voice-head">
          <p className="eyebrow">On device</p>
          <h2 id="voice-title">
            {error ? "Dictation stopped" : starting ? "Starting…" : "Listening"}
          </h2>
          <p className="supporting" aria-live="polite">
            {error ??
              (starting
                ? "Waking the microphone."
                : "Speak in English or Taglish. Tap Done when you finish.")}
          </p>
        </header>

        <div className="voice-stage">
          <div
            className={"voice-ring" + (starting || error ? " idle" : "")}
            ref={ring}
            aria-hidden
          >
            <span className="voice-wave wave-3" />
            <span className="voice-wave wave-2" />
            <span className="voice-wave wave-1" />
            <span className="voice-core">
              <Mic size={30} strokeWidth={2.2} aria-hidden />
            </span>
          </div>
          <span className="voice-clock" aria-hidden>
            {clock}
          </span>
        </div>

        {/*
          The transcript is the recording's only honest progress indicator, so
          it is announced politely rather than left as decoration.
        */}
        <p
          className={"voice-words" + (transcript ? "" : " empty")}
          ref={words}
          aria-live="polite"
        >
          {transcript || "Your words will appear here."}
        </p>

        <div className="voice-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            <X size={18} strokeWidth={2.5} aria-hidden />
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={onDone}
            disabled={starting}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
