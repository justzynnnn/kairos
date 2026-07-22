import { NextResponse } from "next/server";
import { getEditablePreferences } from "@/lib/profile/server";
export async function GET() {
  try {
    return NextResponse.json({ preferences: await getEditablePreferences() });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Preferences could not be loaded.") },
      { status: 500 },
    );
  }
}
import { userMessage } from "@/lib/http";
