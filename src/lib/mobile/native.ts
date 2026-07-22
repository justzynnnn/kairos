"use client";

import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import {
  nativeCapabilitiesSchema,
  nativePlannerResultSchema,
  transcriptEventSchema,
  type NativeCapabilities,
  type NativePlannerResult,
  type TranscriptEvent,
} from "@/lib/mobile/contracts";

type IntelligencePlugin = {
  capabilities(): Promise<unknown>;
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
    eventName: "transcript",
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
        reason: "On-device intelligence is available in the Kairos iOS app.",
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

export async function interpretNatively(options: {
  command: string;
  timezone: string;
  contextVersion: number;
  history?: string[];
}): Promise<NativePlannerResult | null> {
  if (!nativeIntelligenceAvailable()) return null;
  try {
    return nativePlannerResultSchema.parse(
      await plugin.interpret({ ...options, history: options.history ?? [] }),
    );
  } catch {
    return null;
  }
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

export async function clearNativePlannerHistory() {
  if (nativeIntelligenceAvailable()) await plugin.clearHistory();
}
