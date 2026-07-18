import { NextResponse } from "next/server";
import { resetDemoCalendar } from "@/lib/demo-data";
import { resetPreviewMeetings } from "@/lib/meetings/preview-store";
import { resetPreviewConversations } from "@/lib/conversations/preview-store";
import { resetPreviewProfile } from "@/lib/profile/preview-store";
import { isSupabaseConfigured } from "@/lib/env";
import { getServerEnv } from "@/lib/server-env";

export const runtime="nodejs";
export async function POST(request:Request){
  if(isSupabaseConfigured())return NextResponse.json({error:"The preview reset is disabled for hosted account data."},{status:403});
  const secret=getServerEnv().CRON_SECRET;
  const authorized=process.env.NODE_ENV!=="production"||(secret&&request.headers.get("authorization")===`Bearer ${secret}`);
  if(!authorized)return NextResponse.json({error:"Unauthorized"},{status:401});
  resetDemoCalendar();
  resetPreviewMeetings();
  resetPreviewConversations();
  resetPreviewProfile();
  return NextResponse.json({ok:true});
}
