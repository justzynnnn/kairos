import { NextResponse } from "next/server";
import {
  connectionRequestSchema,
  userSearchQuerySchema,
} from "@/lib/profile/people-schema";
import { requestConnection, searchUsers } from "@/lib/profile/server";
import { userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

export async function GET(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "user-search"),
      30,
    ))
  )
    return tooManyRequests();
  const parsed = userSearchQuerySchema.safeParse(
    new URL(request.url).searchParams.get("q") ?? "",
  );
  if (!parsed.success) return NextResponse.json({ users: [] });
  try {
    return NextResponse.json({ users: await searchUsers(parsed.data) });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Users could not be searched.") },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "connections"),
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
    const connection = await requestConnection(parsed.data.userId);
    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Friend request could not be sent.") },
      { status: 422 },
    );
  }
}
