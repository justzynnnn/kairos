import Link from "next/link";
import type { Metadata } from "next";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { MeetingInbox } from "@/components/meeting-inbox";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meeting details" };

export default async function MeetingDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ demoUser?: string }>;
}) {
  const [{ meetingId }, { demoUser }] = await Promise.all([
    params,
    searchParams,
  ]);
  const role = demoUser === "chloe" ? "chloe" : "justin";
  const query = isSupabaseConfigured() ? "" : `?demoUser=${role}`;

  return (
    <div className="page-stack content-medium">
      <header className="page-header">
        <div>
          <Link
            href={`/inbox/meetings${query}` as Route}
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--cyan-deep)]"
          >
            <ArrowLeft className="size-4" /> Back to meetings
          </Link>
          <p className="eyebrow">Focused request</p>
          <h1 className="page-title">Meeting details</h1>
          <p className="page-description">
            Review the options, participants, and next authorized action without
            the surrounding inbox.
          </p>
        </div>
      </header>
      <MeetingInbox
        supabaseConfigured={isSupabaseConfigured()}
        role={role}
        meetingId={meetingId}
      />
    </div>
  );
}
