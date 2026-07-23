import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { connectionActionSchema } from "@/lib/profile/people-schema";
import { manageConnection } from "@/lib/profile/server";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

// The connection id travels in the path here rather than the body, so the
// action is the only thing the request carries.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-connections"),
      20,
    ))
  )
    return tooManyRequests();
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  const parsed = connectionActionSchema.safeParse(body?.action);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Connection action is invalid." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
    const { id } = await params;
    await manageConnection(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Connection could not be updated.") },
      { status: errorStatus(error, 422) },
    );
  }
}
