import { NextResponse } from "next/server";
import { downloadAttachment } from "@/lib/conversations/server";
export const runtime = "nodejs",
  dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    result = await downloadAttachment(request, id);
  if (!result)
    return NextResponse.json(
      { error: "This attachment is unavailable or you no longer have access." },
      { status: 404 },
    );
  if (result.kind === "redirect") return NextResponse.redirect(result.url);
  return new NextResponse(result.bytes as BodyInit, {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(result.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
