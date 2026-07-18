import { z } from "zod";
const schema=z.object({url:z.url(),publishableKey:z.string().min(20)});
export function getSupabasePublicConfig(){const value=schema.safeParse({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});return value.success?{url:value.data.url,anonKey:value.data.publishableKey}:null;}
export function isSupabaseConfigured(){return getSupabasePublicConfig()!==null;}
