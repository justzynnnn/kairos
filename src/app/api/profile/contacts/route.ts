import { NextResponse } from "next/server";
import { contactMatchSchema } from "@/lib/profile/people-schema";
import { matchContacts } from "@/lib/profile/server";
import { userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(clientKey(request.headers, "contacts"), 10))
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
    return NextResponse.json({
      users: await matchContacts(parsed.data.emails),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Contacts could not be matched.") },
      { status: 500 },
    );
  }
}
