"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  scheduleOperationSchema,
  type ScheduleOperation,
} from "@/lib/mobile/contracts";

type SecureStorePlugin = {
  readSnapshot(options: { key: string }): Promise<{ payload: string | null }>;
  writeSnapshot(options: { key: string; payload: string }): Promise<void>;
  queueOperation(options: { id: string; payload: string }): Promise<void>;
  pendingOperations(): Promise<{
    operations: Array<{
      id: string;
      payload: string;
      status: "pending" | "syncing" | "needs_review";
      createdAt: number;
    }>;
  }>;
  setOperationStatus(options: {
    id: string;
    status: "pending" | "syncing" | "needs_review";
    remove?: boolean;
  }): Promise<void>;
  appendHistory(options: {
    id: string;
    payload: string;
    expiresAt: number;
  }): Promise<void>;
  history(): Promise<{
    entries: Array<{ id: string; payload: string; createdAt: number }>;
  }>;
  clearHistory(): Promise<void>;
  setSecureValue(options: { key: string; value: string }): Promise<void>;
  getSecureValue(options: { key: string }): Promise<{ value: string | null }>;
  deleteSecureValue(options: { key: string }): Promise<void>;
  clearAll(): Promise<void>;
};

const plugin = registerPlugin<SecureStorePlugin>("KairosSecureStore");
const native = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

function fallbackKey(key: string) {
  return "kairos.mobile." + key;
}

export async function readLocalSnapshot<T>(key: string): Promise<T | null> {
  try {
    const payload = native()
      ? (await plugin.readSnapshot({ key })).payload
      : localStorage.getItem(fallbackKey(key));
    return payload ? (JSON.parse(payload) as T) : null;
  } catch {
    return null;
  }
}

export async function writeLocalSnapshot(key: string, value: unknown) {
  const payload = JSON.stringify(value);
  if (native()) await plugin.writeSnapshot({ key, payload });
  else localStorage.setItem(fallbackKey(key), payload);
}

export async function queueLocalOperation(operation: ScheduleOperation) {
  const value = scheduleOperationSchema.parse(operation);
  if (native())
    await plugin.queueOperation({
      id: value.clientOperationId,
      payload: JSON.stringify(value),
    });
  else {
    const current = await pendingLocalOperations();
    localStorage.setItem(
      fallbackKey("operations"),
      JSON.stringify([
        ...current,
        { operation: value, status: "pending" as const },
      ]),
    );
  }
}

export async function pendingLocalOperations(): Promise<
  Array<{
    operation: ScheduleOperation;
    status: "pending" | "syncing" | "needs_review";
  }>
> {
  if (native()) {
    const { operations } = await plugin.pendingOperations();
    return operations.flatMap((entry) => {
      const parsed = scheduleOperationSchema.safeParse(
        JSON.parse(entry.payload),
      );
      return parsed.success
        ? [{ operation: parsed.data, status: entry.status }]
        : [];
    });
  }
  try {
    return JSON.parse(localStorage.getItem(fallbackKey("operations")) ?? "[]");
  } catch {
    return [];
  }
}

export async function setLocalOperationStatus(
  id: string,
  status: "pending" | "syncing" | "needs_review",
  remove = false,
) {
  if (native()) {
    await plugin.setOperationStatus({ id, status, remove });
    return;
  }
  const current = await pendingLocalOperations();
  localStorage.setItem(
    fallbackKey("operations"),
    JSON.stringify(
      current
        .filter((entry) => !remove || entry.operation.clientOperationId !== id)
        .map((entry) =>
          entry.operation.clientOperationId === id
            ? { ...entry, status }
            : entry,
        ),
    ),
  );
}

export async function appendAssistantHistory(value: {
  id: string;
  role: "user" | "assistant";
  text: string;
}) {
  const expiresAt = Date.now() / 1000 + 7 * 86_400;
  if (native())
    await plugin.appendHistory({
      id: value.id,
      payload: JSON.stringify(value),
      expiresAt,
    });
}

export async function readAssistantHistory() {
  if (!native()) return [];
  const { entries } = await plugin.history();
  return entries.flatMap((entry) => {
    try {
      return [
        JSON.parse(entry.payload) as {
          id: string;
          role: "user" | "assistant";
          text: string;
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function clearAssistantHistory() {
  if (native()) await plugin.clearHistory();
}

export async function setSecureValue(key: string, value: string) {
  if (!native())
    throw new Error("Secure token storage requires the native iOS app.");
  await plugin.setSecureValue({ key, value });
}

export async function getSecureValue(key: string) {
  if (!native()) return null;
  return (await plugin.getSecureValue({ key })).value;
}

export async function deleteSecureValue(key: string) {
  if (native()) await plugin.deleteSecureValue({ key });
}

export async function clearLocalAccountData() {
  if (native()) await plugin.clearAll();
  else
    Object.keys(localStorage)
      .filter((key) => key.startsWith("kairos.mobile."))
      .forEach((key) => localStorage.removeItem(key));
}
