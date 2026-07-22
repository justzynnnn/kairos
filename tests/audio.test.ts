import { describe, expect, it } from "vitest";
import { isSupportedAudioMimeType, normalizeAudioMimeType } from "@/lib/audio";

describe("voice recording formats", () => {
  it("normalizes browser codec parameters before validation", () => {
    expect(normalizeAudioMimeType("audio/WebM;codecs=opus")).toBe("audio/webm");
    expect(normalizeAudioMimeType("audio/mp4; codecs=mp4a.40.2")).toBe(
      "audio/mp4",
    );
  });

  it("accepts Safari and Chromium MediaRecorder formats", () => {
    expect(isSupportedAudioMimeType("audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(isSupportedAudioMimeType("audio/webm;codecs=opus")).toBe(true);
    expect(isSupportedAudioMimeType("audio/ogg;codecs=opus")).toBe(true);
  });

  it("continues to reject unrelated uploads", () => {
    expect(isSupportedAudioMimeType("video/mp4")).toBe(false);
    expect(isSupportedAudioMimeType("application/octet-stream")).toBe(false);
  });
});
