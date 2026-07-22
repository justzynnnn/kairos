import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCalendarItems } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import { createHostedJourneySession } from "@/lib/journey/session-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema=z.object({itemId:z.string().min(1).max(100)});export const runtime="nodejs";
export async function POST(request:Request){const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a valid Journey item."},{status:400});try{const item=(await getCalendarItems()).find((entry)=>entry.id===parsed.data.itemId);if(!item)throw new Error("Calendar item not found.");if(!item.endAt||item.status!=="scheduled"||item.destinationLatitude==null||item.destinationLongitude==null)throw new Error("Choose a destination for a scheduled item before starting Journey.");if(new Date(item.endAt).getTime()<=Date.now())throw new Error("This event has already ended.");if(!isSupabaseConfigured())return NextResponse.json({session:{id:randomUUID(),token:null,expiresAt:item.endAt,backgroundCapable:false}});const session=await createHostedJourneySession(await createServerSupabaseClient(),item);return NextResponse.json({session:{...session,backgroundCapable:true}});}catch(error){return NextResponse.json({error:userMessage(error,"Journey could not be started.")},{status:422});}}
