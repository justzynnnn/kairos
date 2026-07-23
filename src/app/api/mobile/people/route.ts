import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { getConnections } from "@/lib/profile/server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json({ connections: await getConnections() });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "People could not be loaded.") },
      { status: errorStatus(error) },
    );
  }
}
