import { NextResponse } from "next/server";
import { downloadAttachment } from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs",
  dynamic = "force-dynamic";

/**
 * The web download route redirects to a signed URL, but a redirect carrying
 * Authorization would be followed by the web view without it. The phone gets
 * the URL itself instead and opens it directly; it expires in a minute.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticateBearerRequest(request);
    const { id } = await params;
    const result = await downloadAttachment(request, id);
    if (!result || result.kind !== "redirect")
      return NextResponse.json(
        {
          error: "This attachment is unavailable or you no longer have access.",
        },
        { status: 404 },
      );
    return NextResponse.json(
      { url: result.url },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "This attachment is unavailable.") },
      { status: errorStatus(error, 404) },
    );
  }
}
