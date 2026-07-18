import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/env";
import { getServerEnv } from "@/lib/server-env";
export function createAdminSupabaseClient(){const config=getSupabasePublicConfig(),key=getServerEnv().SUPABASE_SERVICE_ROLE_KEY;if(!config||!key)throw new Error("Supabase admin access is not configured.");return createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false}});}

