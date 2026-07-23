import { NextResponse } from "next/server";
import { manageConnectionSchema } from "@/lib/profile/people-schema";
import { getConnections, manageConnection } from "@/lib/profile/server";
import { userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
export async function GET() {
  try {
    return NextResponse.json({ connections: await getConnections() });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Connections could not be loaded.") },
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
  const parsed = manageConnectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Connection action is invalid." },
      { status: 400 },
    );
  try {
    await manageConnection(parsed.data.id, parsed.data.action);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Connection could not be updated.") },
      { status: 422 },
    );
  }
}
