import { NextResponse } from "next/server";
import { getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import { getPreviewIncident } from "@/lib/repair/incident-preview-store";
import { getHostedIncident } from "@/lib/repair/incidents-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params,viewer=await getViewer(),incident=isSupabaseConfigured()?await getHostedIncident(await createServerSupabaseClient(),id,viewer.scheduleVersion,false):getPreviewIncident(id);if(!incident)return NextResponse.json({error:"This repair incident is no longer available."},{status:404});return NextResponse.json({incident});}catch(error){return NextResponse.json({error:userMessage(error,"Repair status could not be loaded.")},{status:422});}}
