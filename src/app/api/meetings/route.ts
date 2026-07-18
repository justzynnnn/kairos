import { NextResponse } from "next/server";
import { z } from "zod";
import { createMeeting, listMeetings } from "@/lib/meetings/server";
import { recordMeetingActivity } from "@/lib/conversations/server";
export const runtime="nodejs";
const requestSchema=z.object({command:z.string().trim().min(3).max(1000)});
export async function GET(request:Request){try{return NextResponse.json({meetings:await listMeetings(request)});}catch{return NextResponse.json({error:"Kairos could not load meeting requests."},{status:500});}}
export async function POST(request:Request){const parsed=requestSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Enter a meeting request under 1,000 characters."},{status:400});try{const result=await createMeeting(parsed.data.command,request);if(result.status==="meeting")await recordMeetingActivity(result.meeting,"created");return NextResponse.json(result,{status:result.status==="impossible"?422:200});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Kairos could not coordinate this meeting."},{status:422});}}
