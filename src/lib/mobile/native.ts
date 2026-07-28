"use client";

import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import {
  levelEventSchema,
  nativeCapabilitiesSchema,
  nativePlannerResultSchema,
  transcriptEventSchema,
  type LevelEvent,
  type NativeCapabilities,
  type NativePlannerResult,
  type TranscriptEvent,
} from "@/lib/mobile/contracts";

type IntelligencePlugin = {
  capabilities(): Promise<unknown>;
  openSettings(): Promise<void>;
  updateContext(options: {
    schedule: string;
    preferences: string;
  }): Promise<void>;
  preparePlanner(): Promise<{ ready: boolean }>;
  interpret(options: {
    command: string;
    timezone: string;
    contextVersion: number;
    history: string[];
  }): Promise<unknown>;
  startTranscription(options: {
    locale?: string;
  }): Promise<{ sessionId: string; locale: string; engine: string }>;
  stopTranscription(): Promise<void>;
  cancelTranscription(): Promise<void>;
  clearHistory(): Promise<void>;
  addListener(
    eventName: "transcript" | "level",
    listener: (event: unknown) => void,
  ): Promise<PluginListenerHandle>;
};

const plugin = registerPlugin<IntelligencePlugin>("KairosIntelligence");

export function nativeIntelligenceAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function getNativeCapabilities(): Promise<NativeCapabilities> {
  if (!nativeIntelligenceAvailable())
    return {
      foundationModel: {
        state: "unsupported",
        reason: "On-device intelligence is available in the Mori iOS app.",
      },
      speech: {
        state: "unavailable",
        modern: false,
        supportedLocales: [],
        selectedLocale: "en-PH",
      },
    };
  return nativeCapabilitiesSchema.parse(await plugin.capabilities());
}

export async function prepareNativePlanner() {
  if (!nativeIntelligenceAvailable()) return false;
  try {
    await plugin.preparePlanner();
    return true;
  } catch {
    return false;
  }
}

export async function updateNativePlannerContext(options: {
  schedule: string;
  preferences: string;
}) {
  if (!nativeIntelligenceAvailable()) return;
  await plugin.updateContext(options);
}

/**
 * Why the on-device tier did not answer. The Swift side rejects with real
 * codes — MODEL_UNAVAILABLE, MODEL_RESPONSE_INVALID, MODEL_UNSUPPORTED — and
 * discarding them was hiding the difference between "this phone cannot run
 * Apple Intelligence" and "the model returned something unusable", which are
 * the two cases a user needs told apart.
 */
export type NativeInterpretation =
  | { ok: true; value: NativePlannerResult }
  | { ok: false; code: string; message: string };

export async function interpretNatively(options: {
  command: string;
  timezone: string;
  contextVersion: number;
  history?: string[];
}): Promise<NativeInterpretation> {
  if (!nativeIntelligenceAvailable())
    return {
      ok: false,
      code: "NOT_NATIVE",
      message: "On-device planning is available in the Mori iOS app.",
    };
  let raw: unknown;
  try {
    raw = await plugin.interpret({
      ...options,
      history: options.history ?? [],
    });
  } catch (reason) {
    const error = reason as { code?: string; message?: string };
    return {
      ok: false,
      code: error?.code ?? "MODEL_FAILED",
      message:
        error?.message ??
        "Apple Intelligence could not interpret that request.",
    };
  }
  const parsed = nativePlannerResultSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        code: "MODEL_RESPONSE_INVALID",
        message: "The on-device model returned an unusable plan.",
      };
}

export async function subscribeToTranscript(
  listener: (event: TranscriptEvent) => void,
) {
  if (!nativeIntelligenceAvailable()) return null;
  return plugin.addListener("transcript", (value) => {
    const parsed = transcriptEventSchema.safeParse(value);
    if (parsed.success) listener(parsed.data);
  });
}

export async function subscribeToAudioLevel(
  listener: (event: LevelEvent) => void,
) {
  if (!nativeIntelligenceAvailable()) return null;
  return plugin.addListener("level", (value) => {
    const parsed = levelEventSchema.safeParse(value);
    if (parsed.success) listener(parsed.data);
  });
}

export const NativeSpeech = {
  start(locale?: string) {
    return plugin.startTranscription({ locale });
  },
  stop() {
    return plugin.stopTranscription();
  },
  cancel() {
    return plugin.cancelTranscription();
  },
};

/** Opens this app's page in iOS Settings, where a refused permission lives. */
export async function openAppSettings() {
  if (nativeIntelligenceAvailable()) await plugin.openSettings();
}

export async function clearNativePlannerHistory() {
  if (nativeIntelligenceAvailable()) await plugin.clearHistory();
}
