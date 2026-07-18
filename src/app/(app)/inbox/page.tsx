import { InboxWorkspace } from "@/components/inbox-workspace";
import { getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic="force-dynamic";
export default async function Page(){const viewer=await getViewer();return <InboxWorkspace viewer={viewer} supabaseConfigured={isSupabaseConfigured()}/>;}
