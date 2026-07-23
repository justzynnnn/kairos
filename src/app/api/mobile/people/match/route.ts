import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { contactMatchSchema } from "@/lib/profile/people-schema";
import { matchContacts } from "@/lib/profile/server";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

// Pasted addresses only — the app asks for no Contacts permission. Whatever is
// sent here is matched against existing accounts and dropped.
export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-contacts"),
      10,
    ))
  )
    return tooManyRequests();
  const parsed = contactMatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Share up to 200 valid email addresses." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json({
      users: await matchContacts(parsed.data.emails),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Contacts could not be matched.") },
      { status: errorStatus(error) },
    );
  }
}
