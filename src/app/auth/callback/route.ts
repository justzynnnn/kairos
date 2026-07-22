import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code && isSupabaseConfigured())
    await (
      await createServerSupabaseClient()
    ).auth.exchangeCodeForSession(code);
  const requested = request.nextUrl.searchParams.get("next");
  const destination = requested === "/auth/reset" ? requested : "/";
  return NextResponse.redirect(new URL(destination, request.url));
}
