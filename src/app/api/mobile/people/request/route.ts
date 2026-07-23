import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { connectionRequestSchema } from "@/lib/profile/people-schema";
import { requestConnection } from "@/lib/profile/server";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-connections"),
      20,
    ))
  )
    return tooManyRequests();
  const parsed = connectionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a valid user." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json(
      { connection: await requestConnection(parsed.data.userId) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Friend request could not be sent.") },
      { status: errorStatus(error, 422) },
    );
  }
}
