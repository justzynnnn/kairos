import { NextResponse } from "next/server";
import { z } from "zod";
import { errorStatus, userMessage } from "@/lib/http";
import { softCancelCalendarItem } from "@/lib/profile/server";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

const schema = z.object({ version: z.number().int().positive() });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "calendar-write"),
      30,
    ))
  )
    return tooManyRequests();
  const value = schema.safeParse(await request.json().catch(() => null));
  if (!value.success)
    return NextResponse.json(
      { error: "A current item version is required." },
      { status: 400 },
    );
  try {
    const { id } = await params;
    return NextResponse.json({
      item: await softCancelCalendarItem(id, value.data.version),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Item could not be cancelled.") },
      { status: errorStatus(error, 422) },
    );
  }
}
