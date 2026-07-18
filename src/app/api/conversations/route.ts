import { NextResponse } from "next/server";
import { ensureAutomatedConversationUpdates, getConversation } from "@/lib/conversations/server";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request){try{await ensureAutomatedConversationUpdates(request);const conversation=await getConversation(request);return conversation?NextResponse.json({conversation}):NextResponse.json({error:"This conversation is unavailable."},{status:403});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Inbox could not be loaded."},{status:500});}}
