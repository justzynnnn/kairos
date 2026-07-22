import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCalendarItems,getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import { repairTrafficDisruption } from "@/lib/repair/traffic-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
const schema=z.object({itemId:z.string().min(1).max(100),delayMinutes:z.number().int().min(5).max(360),journeySessionId:z.string().uuid().optional()});
export async function POST(request:Request){const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a traffic delay between 5 minutes and 6 hours."},{status:400});try{const now=new Date(),[viewer,items]=await Promise.all([getViewer(),getCalendarItems()]),item=items.find((entry)=>entry.id===parsed.data.itemId);if(!item)throw new Error("Calendar item not found.");const predictedArrival=new Date(now.getTime()+parsed.data.delayMinutes*60_000).toISOString(),repair=await repairTrafficDisruption({supabase:isSupabaseConfigured()?await createServerSupabaseClient():null,viewer,items,journey:{itemId:item.id,destinationLabel:item.locationLabel??item.title,durationMinutes:parsed.data.delayMinutes,distanceMeters:0,leaveAt:now.toISOString(),predictedArrival,delayMinutes:parsed.data.delayMinutes,freshAt:now.toISOString(),source:"seeded_demo",accuracyWarning:"User-reported traffic delay."},journeySessionId:parsed.data.journeySessionId??randomUUID()});return NextResponse.json({repair});}catch(error){return NextResponse.json({error:userMessage(error,"Traffic repair could not be applied.")},{status:422});}}
