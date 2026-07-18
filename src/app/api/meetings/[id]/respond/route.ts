import { NextResponse } from "next/server";
import { z } from "zod";
import { actOnMeeting } from "@/lib/meetings/server";
import { recordMeetingActivity } from "@/lib/conversations/server";
export const runtime="nodejs";
const schema=z.object({action:z.enum(["send","accept","counter","decline","confirm","cancel"]),optionId:z.string().uuid().optional(),counterStart:z.iso.datetime({offset:true}).optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const body=schema.safeParse(await request.json().catch(()=>null));if(!body.success)return NextResponse.json({error:"This meeting response is invalid."},{status:400});try{const{id}=await params,meeting=await actOnMeeting(id,body.data.action,body.data,request);await recordMeetingActivity(meeting,body.data.action);return NextResponse.json({meeting});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"That meeting response is no longer valid."},{status:409});}}
