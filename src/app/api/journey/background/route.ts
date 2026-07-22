import { NextResponse } from "next/server";
import { z } from "zod";
import { computeJourneyFromContext } from "@/lib/journey/server";
import { repairBackgroundTrafficDisruption } from "@/lib/repair/traffic-server";
import { getBackgroundJourneyContext } from "@/lib/journey/session-server";
import { userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

const schema = z.object({
  itemId: z.string().uuid(),
  journeySessionId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "background-journey"),
      120,
    ))
  )
    return tooManyRequests();
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    return NextResponse.json(
      { error: "Active Journey token required." },
      { status: 401 },
    );
  const value = schema.safeParse(await request.json().catch(() => null));
  if (!value.success)
    return NextResponse.json(
      { error: "Background Journey data is invalid." },
      { status: 400 },
    );
  try {
    const context = await getBackgroundJourneyContext(token);
    if (
      context.session.id !== value.data.journeySessionId ||
      context.session.itemId !== value.data.itemId
    )
      return NextResponse.json(
        { error: "Journey token does not match this trip." },
        { status: 403 },
      );
    const item = context.items.find((entry) => entry.id === value.data.itemId);
    if (!item)
      return NextResponse.json(
        { error: "Journey item not found." },
        { status: 404 },
      );
    const journey = await computeJourneyFromContext(item, context.settings, {
        latitude: value.data.latitude,
        longitude: value.data.longitude,
      }),
      repair = await repairBackgroundTrafficDisruption({ ...context, journey }),
      arrived = journey.distanceMeters <= 100;
    await context.admin
      .from("journey_sessions")
      .update(
        arrived
          ? {
              last_update_at: new Date().toISOString(),
              status: "arrived",
              ended_at: new Date().toISOString(),
            }
          : { last_update_at: new Date().toISOString() },
      )
      .eq("id", context.session.id);
    return NextResponse.json({ journey, repair, arrived });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Background traffic monitoring failed.") },
      { status: 422 },
    );
  }
}
const stopSchema = z.object({
  journeySessionId: z.string().uuid(),
  status: z.enum(["stopped", "arrived", "expired"]).default("stopped"),
});
export async function DELETE(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    return NextResponse.json(
      { error: "Active Journey token required." },
      { status: 401 },
    );
  const parsed = stopSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Journey stop data is invalid." },
      { status: 400 },
    );
  try {
    const context = await getBackgroundJourneyContext(token);
    if (context.session.id !== parsed.data.journeySessionId)
      return NextResponse.json(
        { error: "Journey token does not match this trip." },
        { status: 403 },
      );
    await context.admin
      .from("journey_sessions")
      .update({
        status: parsed.data.status,
        ended_at: new Date().toISOString(),
      })
      .eq("id", context.session.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Background Journey could not be stopped.") },
      { status: 422 },
    );
  }
}
