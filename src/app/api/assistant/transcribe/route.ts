import { NextResponse } from "next/server";
import { getViewer } from "@/lib/data";
import { isOpenAIConfigured, transcribeAudio } from "@/lib/scheduling/openai";
import { AI_LIMITS, reserveAIUsage } from "@/lib/scheduling/usage";
import { isSupportedAudioMimeType } from "@/lib/audio";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export async function POST(request: Request) {
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "Add OPENAI_API_KEY to enable private voice transcription." }, { status: 503 });
  const viewer = await getViewer();
  const form = await request.formData();
  const audio = form.get("audio");
  const duration = Math.ceil(Number(form.get("durationSeconds") ?? 0));
  if (!(audio instanceof File) || audio.size < 1 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Record a voice command smaller than 10 MB." }, { status: 400 });
  }
  if (!isSupportedAudioMimeType(audio.type)) return NextResponse.json({ error: "This audio format is not supported." }, { status: 415 });
  if (!Number.isFinite(duration) || duration < 1 || duration > AI_LIMITS.maxRecordingSeconds) {
    return NextResponse.json({ error: `Recordings are limited to ${AI_LIMITS.maxRecordingSeconds} seconds.` }, { status: 400 });
  }
  const allowed = await reserveAIUsage(viewer, "audio", duration);
  if (!allowed) return NextResponse.json({ error: "Your daily voice transcription limit has been reached." }, { status: 429 });
  try {
    const transcript = await transcribeAudio(audio);
    if (!transcript) return NextResponse.json({ error: "No speech was detected. Try recording again." }, { status: 422 });
    return NextResponse.json({ transcript });
  } catch {
    return NextResponse.json({ error: "Voice transcription is temporarily unavailable. Your recording was not saved." }, { status: 502 });
  }
}
