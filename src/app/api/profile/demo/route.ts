import{NextResponse}from"next/server";import{z}from"zod";import{setDemoMode}from"@/lib/profile/server";
import { userMessage } from "@/lib/http";
const schema=z.object({enabled:z.boolean()});
export async function PATCH(request:Request){const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Demo mode setting is invalid."},{status:400});try{return NextResponse.json({result:await setDemoMode(parsed.data.enabled)});}catch(error){return NextResponse.json({error:userMessage(error,"Demo mode could not be updated.")},{status:422});}}
