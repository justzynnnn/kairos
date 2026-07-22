import { NextResponse } from "next/server";
import { z } from "zod";
import { mapCalendarRow } from "@/lib/demo-data";
import { errorStatus, userMessage } from "@/lib/http";
import {
  mobileSyncRequestSchema,
  syncConflictSchema,
  type MobileSyncResult,
} from "@/lib/mobile/contracts";
import { authenticateBearerRequest } from "@/lib/supabase/request";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

const rpcResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("applied"),
    operationId: z.string().uuid(),
    scheduleVersion: z.number().int().positive(),
  }),
  z.object({
    status: z.literal("conflict"),
    operationId: z.string().uuid(),
    conflict: z.object({
      code: syncConflictSchema.shape.code,
      message: z.string(),
    }),
  }),
]);

export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-sync"),
      60,
    ))
  )
    return tooManyRequests();
  try {
    const body = mobileSyncRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!body.success)
      return NextResponse.json(
        { error: "The pending schedule changes are invalid." },
        { status: 400 },
      );
    const { client, user } = await authenticateBearerRequest(request);
    const appliedOperationIds: string[] = [];
    const conflicts: MobileSyncResult["conflicts"] = [];
    let scheduleVersion = body.data.operations[0].baseScheduleVersion;

    for (const operation of body.data.operations) {
      const { data, error } = await client.rpc(
        "apply_mobile_schedule_operation",
        {
          p_operation_id: operation.clientOperationId,
          p_kind: operation.kind,
          p_base_schedule_version: operation.baseScheduleVersion,
          p_target_id: operation.targetId,
          p_target_version: operation.targetVersion,
          p_payload: operation.payload,
        },
      );
      if (error) throw error;
      const result = rpcResultSchema.parse(data);
      if (result.status === "applied") {
        appliedOperationIds.push(result.operationId);
        scheduleVersion = result.scheduleVersion;
      } else {
        conflicts.push({
          operationId: result.operationId,
          ...result.conflict,
        });
      }
    }

    const start = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const end = new Date(Date.now() + 93 * 86_400_000).toISOString();
    const [{ data: rows, error: calendarError }, { data: profile }] =
      await Promise.all([
        client
          .from("calendar_items")
          .select("*")
          .eq("user_id", user.id)
          .or(
            `and(start_at.lt.${end},end_at.gt.${start}),and(item_type.eq.deadline,due_at.gte.${start},due_at.lte.${end}),status.eq.cancelled`,
          )
          .order("start_at", { ascending: true, nullsFirst: false })
          .limit(2_000),
        client
          .from("profiles")
          .select("schedule_version")
          .eq("id", user.id)
          .single(),
      ]);
    if (calendarError) throw calendarError;
    scheduleVersion = profile?.schedule_version ?? scheduleVersion;
    const response: MobileSyncResult = {
      appliedOperationIds,
      scheduleVersion,
      calendar: (rows ?? []).map((row) => mapCalendarRow(row)),
      conflicts,
    };
    return NextResponse.json(response, {
      status: conflicts.length ? 207 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Schedule synchronization failed.") },
      { status: errorStatus(error, 422) },
    );
  }
}
