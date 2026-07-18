import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { detectMissedStarts } from "@/lib/repair/engine";
import { getDemoCalendarItems } from "@/lib/demo-data";
import { getSupabasePublicConfig } from "@/lib/env";
import { getServerEnv } from "@/lib/server-env";

export const runtime="nodejs";
export async function GET(request:Request){
  const env=getServerEnv();
  const secret=env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  const config=getSupabasePublicConfig();
  if(!config||!env.SUPABASE_SERVICE_ROLE_KEY){const missed=detectMissedStarts(getDemoCalendarItems());return NextResponse.json({ok:true,checkedAt:new Date().toISOString(),usersChecked:1,missedCount:missed.length,writes:0,preview:true});}
  const admin=createClient(config.url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.from("calendar_items").select("user_id").eq("status","scheduled").not("start_at","is",null).lte("end_at",new Date().toISOString());
  if(error)return NextResponse.json({error:"Scheduled check failed."},{status:500});
  const counts=new Map<string,number>();for(const row of data??[])counts.set(row.user_id,(counts.get(row.user_id)??0)+1);
  if(counts.size){await admin.from("audit_events").insert([...counts].map(([user_id,count])=>({user_id,action:"missed_start_check",entity_type:"calendar",metadata:{missed_count:count}})));}
  return NextResponse.json({ok:true,checkedAt:new Date().toISOString(),usersChecked:counts.size,missedCount:(data??[]).length,writes:counts.size});
}
