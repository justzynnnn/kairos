import { NextResponse } from "next/server";
import { completeCalendarItem } from "@/lib/profile/server";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json({ result: await completeCalendarItem(id) });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Item could not be completed.") },
      { status: 422 },
    );
  }
}
import { userMessage } from "@/lib/http";
