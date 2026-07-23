import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { searchUsers } from "@/lib/profile/server";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
import { userSearchQuerySchema } from "@/lib/profile/people-schema";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-user-search"),
      30,
    ))
  )
    return tooManyRequests();
  const parsed = userSearchQuerySchema.safeParse(
    new URL(request.url).searchParams.get("q") ?? "",
  );
  if (!parsed.success) return NextResponse.json({ users: [] });
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json({ users: await searchUsers(parsed.data) });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Users could not be searched.") },
      { status: errorStatus(error) },
    );
  }
}
