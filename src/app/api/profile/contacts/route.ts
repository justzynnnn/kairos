import { NextResponse } from "next/server";
import { z } from "zod";
import { matchContacts } from "@/lib/profile/server";
import { userMessage } from "@/lib/http";
import { allowRequest, clientKey, tooManyRequests } from "@/lib/rate-limit";

export const runtime="nodejs";
// Addresses are compared against existing accounts and dropped. Contacts who do
// not already use Kairos are never stored, logged, or echoed back.
const schema=z.object({emails:z.array(z.string().trim().email()).min(1).max(200)});
export async function POST(request:Request){if(!allowRequest(clientKey(request.headers,"contacts"),10))return tooManyRequests();const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Share up to 200 valid email addresses."},{status:400});try{return NextResponse.json({users:await matchContacts(parsed.data.emails)});}catch(error){return NextResponse.json({error:userMessage(error,"Contacts could not be matched.")},{status:500});}}
