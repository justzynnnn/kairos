import { NextResponse } from "next/server";import{z}from"zod";import{getConnections,manageConnection}from"@/lib/profile/server";
import { userMessage } from "@/lib/http";
const schema=z.object({id:z.string().uuid(),action:z.enum(["accept","block","remove"])});
export async function GET(){try{return NextResponse.json({connections:await getConnections()});}catch(error){return NextResponse.json({error:userMessage(error,"Connections could not be loaded.")},{status:500});}}
export async function POST(request:Request){const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Connection action is invalid."},{status:400});try{await manageConnection(parsed.data.id,parsed.data.action);return NextResponse.json({ok:true});}catch(error){return NextResponse.json({error:userMessage(error,"Connection could not be updated.")},{status:422});}}
