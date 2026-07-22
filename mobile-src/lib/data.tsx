import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  mobileSchedulePayloadSchema,
  mobileSyncRequestSchema,
  type MobileBootstrap,
  type MobileSyncResult,
  type ScheduleOperation,
} from "@/lib/mobile/contracts";
import {
  pendingLocalOperations,
  queueLocalOperation,
  readLocalSnapshot,
  setLocalOperationStatus,
  writeLocalSnapshot,
} from "@/lib/mobile/store";
import type { CalendarItem } from "@/lib/types";
import { apiRequest } from "./api";
import { useAuth } from "./auth";
import { mobileConfig } from "./config";
import { metricNow, recordMetric } from "./metrics";

type SyncState = "cached" | "refreshing" | "current" | "offline" | "review";
type LocalConflict = {
  operation: ScheduleOperation;
  code: string;
  message: string;
};
type DataState = {
  data: MobileBootstrap | null;
  state: SyncState;
  error: string | null;
  conflicts: LocalConflict[];
  refresh(): Promise<void>;
  confirmCreates(items: Array<Record<string, unknown>>): Promise<void>;
  queueItemAction(
    item: CalendarItem,
    kind: "complete" | "cancel",
  ): Promise<void>;
  discardConflict(operationId: string): Promise<void>;
};

const DataContext = createContext<DataState | null>(null);

function mergeBootstrap(
  previous: MobileBootstrap | null,
  incoming: MobileBootstrap,
) {
  if (!previous) return incoming;
  const items = new Map(previous.calendar.map((item) => [item.id, item]));
  incoming.calendar.forEach((item) => items.set(item.id, item));
  return { ...incoming, calendar: [...items.values()] };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [data, setData] = useState<MobileBootstrap | null>(null);
  const [state, setState] = useState<SyncState>("cached");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<LocalConflict[]>([]);
  const dataRef = useRef<MobileBootstrap | null>(null);
  const cacheKey = auth.user ? "bootstrap:" + auth.user.id : "bootstrap";

  const syncPending = useCallback(async (token: string) => {
    const pending = await pendingLocalOperations();
    const active = pending.filter((entry) => entry.status !== "needs_review");
    if (!active.length) return null;
    active.forEach((entry) => {
      void setLocalOperationStatus(
        entry.operation.clientOperationId,
        "syncing",
      );
    });
    const request = mobileSyncRequestSchema.parse({
      operations: active.map((entry) => entry.operation),
    });
    const startedAt = metricNow();
    const result = await apiRequest<MobileSyncResult>(
      "/api/mobile/sync",
      token,
      { method: "POST", body: JSON.stringify(request) },
    );
    void recordMetric(token, "sync", metricNow() - startedAt, {
      queueBucket:
        active.length > 20 ? "20+" : active.length > 5 ? "6-20" : "1-5",
    });
    await Promise.all(
      result.appliedOperationIds.map((id) =>
        setLocalOperationStatus(id, "pending", true),
      ),
    );
    await Promise.all(
      result.conflicts.map((conflict) =>
        setLocalOperationStatus(conflict.operationId, "needs_review"),
      ),
    );
    return { result, operations: active.map((entry) => entry.operation) };
  }, []);

  const refresh = useCallback(async () => {
    if (!auth.accessToken || !auth.user) return;
    setState("refreshing");
    setError(null);
    try {
      const sync = await syncPending(auth.accessToken);
      const current = dataRef.current;
      const query = current?.cursor
        ? "?since=" + encodeURIComponent(current.cursor)
        : "";
      const bootstrapStartedAt = metricNow();
      const fresh = await apiRequest<MobileBootstrap>(
        "/api/mobile/bootstrap" + query,
        auth.accessToken,
      );
      void recordMetric(
        auth.accessToken,
        "bootstrap",
        metricNow() - bootstrapStartedAt,
        { cache: current ? "refresh" : "miss" },
      );
      let merged = mergeBootstrap(
        sync
          ? current && {
              ...current,
              calendar: sync.result.calendar,
              scheduleVersion: sync.result.scheduleVersion,
            }
          : current,
        fresh,
      );
      if (sync?.result.conflicts.length && current) {
        const byOperation = new Map(
          sync.operations.map((operation) => [
            operation.clientOperationId,
            operation,
          ]),
        );
        const localConflicts = sync.result.conflicts.flatMap((conflict) => {
          const operation = byOperation.get(conflict.operationId);
          return operation
            ? [{ operation, code: conflict.code, message: conflict.message }]
            : [];
        });
        const targetIds = new Set(
          localConflicts.map((conflict) => conflict.operation.targetId),
        );
        const retained = current.calendar.filter(
          (item) => targetIds.has(item.id) && item.localSyncStatus,
        );
        const calendar = new Map(
          merged.calendar.map((item) => [item.id, item]),
        );
        retained.forEach((item) =>
          calendar.set(item.id, {
            ...item,
            localSyncStatus: "needs_review",
          }),
        );
        merged = { ...merged, calendar: [...calendar.values()] };
        setConflicts(localConflicts);
      }
      setData(merged);
      await writeLocalSnapshot(cacheKey, merged);
      const pending = await pendingLocalOperations();
      if (!sync?.result.conflicts.length) {
        setConflicts(
          pending
            .filter((entry) => entry.status === "needs_review")
            .map((entry) => ({
              operation: entry.operation,
              code: "schedule_changed",
              message: "This local change needs review before it can sync.",
            })),
        );
      }
      setState(
        pending.some((entry) => entry.status === "needs_review")
          ? "review"
          : "current",
      );
    } catch (reason) {
      setState("offline");
      setError(
        reason instanceof Error ? reason.message : "Refresh is unavailable.",
      );
    }
  }, [auth.accessToken, auth.user, cacheKey, syncPending]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let active = true;
    if (!auth.user) return;
    void readLocalSnapshot<MobileBootstrap>(cacheKey).then((cached) => {
      if (!active) return;
      if (cached && mobileConfig.features.offlineSync) {
        setData(cached);
        setState("cached");
      }
      void refresh();
    });
    const online = () => void refresh();
    window.addEventListener("online", online);
    window.addEventListener("focus", online);
    return () => {
      active = false;
      window.removeEventListener("online", online);
      window.removeEventListener("focus", online);
    };
  }, [auth.user, cacheKey, refresh]);

  const value = useMemo<DataState>(
    () => ({
      data,
      state,
      error,
      conflicts,
      refresh,
      async confirmCreates(items) {
        if (!data) return;
        if (!navigator.onLine && !mobileConfig.features.offlineSync) {
          setError("Offline schedule changes are not enabled in this build.");
          setState("offline");
          return;
        }
        const created: CalendarItem[] = [];
        for (const raw of items) {
          const id = crypto.randomUUID();
          const payload = mobileSchedulePayloadSchema.parse(raw);
          const operation: ScheduleOperation = {
            clientOperationId: crypto.randomUUID(),
            kind: "create",
            baseScheduleVersion: data.scheduleVersion,
            targetId: id,
            targetVersion: null,
            payload,
            createdAt: new Date().toISOString(),
          };
          await queueLocalOperation(operation);
          created.push({
            id,
            userId: data.viewer.id,
            type: String(payload.type) as CalendarItem["type"],
            title: String(payload.title),
            description: null,
            startAt: (payload.startAt as string | null) ?? null,
            endAt: (payload.endAt as string | null) ?? null,
            dueAt: (payload.dueAt as string | null) ?? null,
            timezone: String(payload.timezone ?? data.viewer.timezone),
            priority: Number(payload.priority ?? 3),
            flexibility: String(
              payload.flexibility ?? "flexible",
            ) as CalendarItem["flexibility"],
            earliestStart: (payload.earliestStart as string | null) ?? null,
            latestEnd: (payload.latestEnd as string | null) ?? null,
            normalDurationMinutes:
              (payload.normalDurationMinutes as number | null) ?? null,
            minimumDurationMinutes:
              (payload.minimumDurationMinutes as number | null) ?? null,
            minimumChunkMinutes:
              (payload.minimumChunkMinutes as number | null) ?? null,
            canShorten: Boolean(payload.canShorten),
            canSplit: Boolean(payload.canSplit),
            canSkip: Boolean(payload.canSkip),
            locationLabel: (payload.locationLabel as string | null) ?? null,
            destinationLatitude: null,
            destinationLongitude: null,
            destinationPlaceId: null,
            destinationResolvedAt: null,
            relatedDeadlineId: null,
            dependencyIds: [],
            category: (payload.category as string | null) ?? null,
            reminderMinutes: Number(payload.reminderMinutes ?? 10),
            status: "scheduled",
            version: 1,
            localSyncStatus: "pending",
          } as CalendarItem);
        }
        const next = { ...data, calendar: [...data.calendar, ...created] };
        setData(next);
        setState(navigator.onLine ? "refreshing" : "offline");
        await writeLocalSnapshot(cacheKey, next);
        if (navigator.onLine) void refresh();
      },
      async queueItemAction(item, kind) {
        if (!data) return;
        if (!navigator.onLine && !mobileConfig.features.offlineSync) {
          setError("Offline schedule changes are not enabled in this build.");
          setState("offline");
          return;
        }
        const operation: ScheduleOperation = {
          clientOperationId: crypto.randomUUID(),
          kind,
          baseScheduleVersion: data.scheduleVersion,
          targetId: item.id,
          targetVersion: item.version,
          payload: {},
          createdAt: new Date().toISOString(),
        };
        await queueLocalOperation(operation);
        const next = {
          ...data,
          calendar: data.calendar.map((value) =>
            value.id === item.id
              ? {
                  ...value,
                  status: kind === "complete" ? "completed" : "cancelled",
                  localSyncStatus: "pending",
                }
              : value,
          ) as CalendarItem[],
        };
        setData(next);
        await writeLocalSnapshot(cacheKey, next);
        if (navigator.onLine) void refresh();
      },
      async discardConflict(operationId) {
        const conflict = conflicts.find(
          (entry) => entry.operation.clientOperationId === operationId,
        );
        if (!conflict || !data) return;
        await setLocalOperationStatus(operationId, "pending", true);
        const next = {
          ...data,
          cursor: "",
          calendar: data.calendar
            .filter(
              (item) =>
                conflict.operation.kind !== "create" ||
                item.id !== conflict.operation.targetId,
            )
            .map((item) =>
              item.id === conflict.operation.targetId
                ? { ...item, localSyncStatus: undefined }
                : item,
            ),
        };
        dataRef.current = next;
        setData(next);
        setConflicts((entries) =>
          entries.filter(
            (entry) => entry.operation.clientOperationId !== operationId,
          ),
        );
        await writeLocalSnapshot(cacheKey, next);
        if (navigator.onLine) await refresh();
      },
    }),
    [cacheKey, conflicts, data, error, refresh, state],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useMobileData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("DataProvider is missing.");
  return value;
}
