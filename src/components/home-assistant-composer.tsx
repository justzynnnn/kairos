"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Mic, Send, ShieldCheck, Square } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import type { ProposalItem } from "@/lib/scheduling/schema";

type Proposal = {
  status: "proposal";
  proposalId: string;
  summary: string;
  items: ProposalItem[];
  provider: "openai" | "deterministic";
  providerNotice: string | null;
};

export function HomeAssistantComposer({ openAIConfigured }: { openAIConfigured: boolean }) {
  const [command, setCommand] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [pending, setPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function submit(value = command) {
    if (value.trim().length < 2) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/assistant/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Kairos could not interpret that command.");
      if (data.status === "needs_input") {
        setProposal(null);
        setMessage(data.question);
      } else {
        setProposal(data);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Kairos could not interpret that command.");
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/proposals/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId: proposal.proposalId, items: proposal.items, remember: false }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Kairos could not confirm that proposal.");
      setProposal(null);
      setCommand("");
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Kairos could not confirm that proposal.");
    } finally {
      setPending(false);
    }
  }

  async function startRecording() {
    setError(null);
    if (!openAIConfigured) {
      setError("Voice transcription needs OPENAI_API_KEY. Typed fallback commands work now.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is unavailable in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const nextRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      nextRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      nextRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timer.current) clearTimeout(timer.current);
        const blob = new Blob(chunks, { type: nextRecorder.mimeType || "audio/mp4" });
        const form = new FormData();
        form.append("audio", blob, nextRecorder.mimeType.includes("webm") ? "command.webm" : "command.m4a");
        form.append("durationSeconds", String(Math.max(1, Math.min(60, Math.ceil((Date.now() - startedAt.current) / 1000)))));
        setPending(true);
        try {
          const response = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Voice transcription failed.");
          setCommand(data.transcript);
          await submit(data.transcript);
        } catch (voiceError) {
          setError(voiceError instanceof Error ? voiceError.message : "Voice transcription failed.");
        } finally {
          setPending(false);
        }
      };
      recorder.current = nextRecorder;
      startedAt.current = Date.now();
      nextRecorder.start();
      setRecording(true);
      timer.current = setTimeout(stopRecording, 60_000);
    } catch {
      setError("Microphone permission was denied. No audio was saved.");
    }
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  }

  return <div className="space-y-4"><section className="rounded-2xl border border-[var(--navy-container)] bg-[var(--navy-container)] p-5 text-white shadow-[var(--shadow-card)]"><div className="flex items-center gap-3"><Image src="/kairos-mascot.png" alt="" width={56} height={56} className="size-14 rounded-full border-2 border-white/25 object-cover" priority /><div><p className="font-display font-semibold">Ask Kairos</p><p className="text-sm text-white/65">Create a safe, editable schedule proposal.</p></div></div><div className="mt-4 flex min-h-14 items-center rounded-2xl bg-white px-3 text-[var(--ink)] shadow-lg"><button type="button" onClick={recording ? stopRecording : startRecording} disabled={pending} aria-label={recording ? "Stop recording" : "Record a scheduling command"} className={`grid size-10 shrink-0 place-items-center rounded-full ${recording ? "text-[var(--error)]" : "text-[var(--cyan-deep)]"}`}>{recording ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}</button><input aria-label="Ask Kairos from Home" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} className="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm outline-none" placeholder="Tell Kairos what needs to happen" /><button type="button" onClick={() => submit()} disabled={pending || command.trim().length < 2} aria-label="Create schedule proposal" className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--cyan-deep)] text-white disabled:opacity-45">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</button></div>{!openAIConfigured && <p className="mt-3 text-xs text-white/65">Limited typed fallback is active until your OpenAI key is added.</p>}</section>{error && <div role="alert" className="flex items-start gap-3 rounded-xl bg-[#ffdad6] p-4 text-sm text-[#93000a]"><AlertCircle className="size-5 shrink-0" />{error}</div>}{message && <div role="status" className="flex items-start gap-3 rounded-xl bg-[var(--gold-soft)] p-4 text-sm text-[var(--gold-deep)]"><Check className="size-5 shrink-0" />{message}</div>}{proposal && <section className="card overflow-hidden"><header className="border-b border-[var(--outline)] bg-[var(--surface-low)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">Ready on Home</p><h2 className="font-display mt-1 text-xl font-semibold text-[var(--navy)]">{proposal.summary}</h2></div><span className="rounded-full bg-[var(--gold-soft)] px-3 py-1 text-xs font-bold text-[var(--gold-deep)]">{proposal.provider === "openai" ? "OpenAI interpreted" : "Limited fallback"}</span></div>{proposal.providerNotice && <p className="mt-2 text-xs text-[var(--gold-deep)]">{proposal.providerNotice}</p>}</header><div className="grid gap-2 p-4 sm:grid-cols-2">{proposal.items.map((item) => <div key={item.clientId} className="rounded-xl border border-[var(--outline)] p-3"><p className="font-display text-sm font-semibold text-[var(--navy)]">{item.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.type === "deadline" ? `Due ${formatDate(item.dueAt)} · ${formatTime(item.dueAt)}` : `${formatDate(item.startAt)} · ${formatTime(item.startAt)}–${formatTime(item.endAt)}`}</p>{item.locationLabel&&<p className="mt-1 text-xs text-[var(--muted)]">{item.locationLabel}</p>}</div>)}</div><footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--outline)] p-4"><button type="button" onClick={() => setProposal(null)} className="min-h-11 rounded-xl border border-[var(--outline)] px-5 font-semibold text-[var(--navy)]">Discard</button><button type="button" onClick={confirm} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--navy)] px-5 font-semibold text-white"><ShieldCheck className="size-4" />Confirm all items</button></footer></section>}</div>;
}
