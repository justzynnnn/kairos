import { NextResponse } from "next/server";
import { getPrivateActivity } from "@/lib/profile/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json({ activity: await getPrivateActivity() });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Activity could not be loaded.") },
      { status: 500 },
    );
  }
}
import { userMessage } from "@/lib/http";
