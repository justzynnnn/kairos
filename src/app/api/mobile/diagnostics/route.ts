import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authenticateBearerRequest } from "@/lib/supabase/request";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

const diagnosticSchema = z.object({
  event: z.enum([
    "launch_usable",
    "tab_transition",
    "interaction_feedback",
    "transcript_update",
    "planner_response",
    "bootstrap",
    "sync",
  ]),
  durationMs: z.number().int().min(0).max(120_000).nullable(),
  properties: z
    .object({
      platform: z.enum(["ios", "web"]).optional(),
      osMajor: z.number().int().min(15).max(100).optional(),
      capability: z.string().max(40).optional(),
      fallbackReason: z.string().max(60).optional(),
      errorCode: z.string().max(60).optional(),
      cache: z.enum(["hit", "miss", "refresh"]).optional(),
      queueBucket: z.enum(["0", "1-5", "6-20", "20+"]).optional(),
    })
    .strict(),
});

export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-diagnostics"),
      120,
    ))
  )
    return tooManyRequests();
  const body = diagnosticSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success)
    return NextResponse.json(
      { error: "Diagnostic event is invalid." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("mobile_diagnostics").insert({
      event_name: body.data.event,
      duration_ms: body.data.durationMs,
      properties: body.data.properties,
    });
    if (error) throw error;
    if (Math.random() < 0.02)
      void admin
        .from("mobile_diagnostics")
        .delete()
        .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Diagnostic event could not be recorded." },
      { status: 422 },
    );
  }
}
