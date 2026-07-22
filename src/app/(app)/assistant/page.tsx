import type { Metadata } from "next";
import Image from "next/image";
import { AssistantWorkspace } from "@/components/assistant-workspace";
import { getViewer } from "@/lib/data";
import { isGeminiConfigured } from "@/lib/scheduling/gemini";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ command?: string }>;
}) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <header className="flex items-center gap-4">
        <Image
          src="/kairos-mascot.png"
          alt=""
          width={96}
          height={96}
          className="size-20 shrink-0 rounded-full object-cover"
          priority
        />
        <div>
          <p className="eyebrow text-[var(--cyan-deep)]">
            Conversational scheduling
          </p>
          <h1 className="page-title mt-1">Plan with Kairos</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Describe the outcome. Review every assumption and change before it
            reaches your schedule.
          </p>
        </div>
      </header>
      <AssistantWorkspace
        cloudFallbackConfigured={isGeminiConfigured()}
        initialCommand={params.command?.slice(0, 2000) ?? ""}
        timezone={viewer.timezone}
      />
    </div>
  );
}
