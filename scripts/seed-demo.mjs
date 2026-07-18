import { createClient } from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY,password=process.env.DEMO_ACCOUNT_PASSWORD??"KairosDemo2026!";
if(!url||!key){console.error("Missing Supabase URL or service role key.");process.exit(1);}
const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const accounts=[{email:"demo@kairos.app",fullName:"Justin",username:"justin"},{email:"chloe@kairos.app",fullName:"Chloe",username:"chloe"}];
async function ensureUser(account){const{data}=await supabase.auth.admin.listUsers({perPage:1000});let user=data.users.find((candidate)=>candidate.email===account.email);if(!user){const result=await supabase.auth.admin.createUser({email:account.email,password,email_confirm:true,user_metadata:{full_name:account.fullName,username:account.username}});if(result.error)throw result.error;user=result.data.user;}const{error}=await supabase.from("profiles").upsert({id:user.id,email:account.email,full_name:account.fullName,username:account.username,timezone:"Asia/Manila",onboarding_completed:true,schedule_version:1,location_enabled:false,automation_reminders:true,automation_lateness:true,activity_aggregate_sharing:false,demo_mode:true});if(error)throw error;return user;}
const[justin,chloe]=await Promise.all(accounts.map(ensureUser));const userIds=[justin.id,chloe.id];
await supabase.from("meeting_requests").delete().in("created_by",userIds);
await supabase.from("calendar_items").delete().in("user_id",userIds);
const base=new Date();const at=(day,hour,minute=0)=>{const value=new Date(base);value.setDate(value.getDate()+day);value.setHours(hour,minute,0,0);return value.toISOString();};
async function add(value){const{data,error}=await supabase.from("calendar_items").insert({...value,demo_seeded:true}).select("id").single();if(error)throw error;return data.id;}
const classId=await add({user_id:justin.id,item_type:"event",title:"Systems Design Class",start_at:at(0,10),end_at:at(0,11,30),priority:4,flexibility:"fixed",normal_duration_minutes:90,minimum_duration_minutes:90,location_label:"Engineering Building",category:"Class",recurrence_rule:"FREQ=WEEKLY;BYDAY=MO,WE"});
const gymId=await add({user_id:justin.id,item_type:"task",title:"Gym Session",start_at:at(0,12,15),end_at:at(0,13,15),earliest_start:at(0,11,30),latest_end:at(0,18),normal_duration_minutes:60,minimum_duration_minutes:60,location_label:"Campus Gym",category:"Fitness"});
const deadlineId=await add({user_id:justin.id,item_type:"deadline",title:"Research Paper Due",due_at:at(3,17),priority:5,flexibility:"fixed",category:"Deadline"});
await add({user_id:justin.id,item_type:"preparation",title:"Paper Research",start_at:at(0,14),end_at:at(0,15,30),priority:4,earliest_start:at(0,13,30),latest_end:at(1,19),normal_duration_minutes:90,minimum_duration_minutes:90,minimum_chunk_minutes:30,can_split:true,location_label:"Library",related_deadline_id:deadlineId,category:"Preparation"});
await add({user_id:justin.id,item_type:"event",title:"Team Project Sync",start_at:at(1,15),end_at:at(1,16),flexibility:"protected",normal_duration_minutes:60,minimum_duration_minutes:60,location_label:"Online",category:"Meeting"});
await add({user_id:chloe.id,item_type:"event",title:"Client Review",start_at:at(1,10),end_at:at(1,11),priority:5,flexibility:"fixed",normal_duration_minutes:60,minimum_duration_minutes:60,location_label:"Online",category:"Meeting"});
await supabase.from("calendar_item_dependencies").upsert({item_id:gymId,depends_on_id:classId,user_id:justin.id});
await supabase.from("connections").upsert({requester_id:justin.id,addressee_id:chloe.id,status:"accepted"},{onConflict:"requester_id,addressee_id"});
await supabase.from("schedule_permissions").upsert([{owner_id:justin.id,grantee_id:chloe.id,scope:"free_busy",categories:[]},{owner_id:chloe.id,grantee_id:justin.id,scope:"free_busy",categories:[]}]);
await supabase.from("preferences").upsert([{user_id:justin.id,category:"Fitness",default_duration_minutes:60,flexibility:"flexible",can_shorten:false,can_split:false,can_skip:false,source:"explicit",demo_seeded:true},{user_id:justin.id,category:"Preparation",default_duration_minutes:90,flexibility:"protected",can_shorten:false,can_split:true,can_skip:false,source:"explicit",demo_seeded:true}],{onConflict:"user_id,category"});
const pair=[justin.id,chloe.id].sort().join(":"),{data:conversation,error:conversationError}=await supabase.from("direct_conversations").upsert({created_by:justin.id,pair_key:pair},{onConflict:"pair_key"}).select("id").single();if(conversationError)throw conversationError;
await supabase.from("direct_conversation_members").upsert([{conversation_id:conversation.id,user_id:justin.id,removed_at:null},{conversation_id:conversation.id,user_id:chloe.id,removed_at:null}]);
await supabase.from("conversation_messages").delete().eq("conversation_id",conversation.id);
await supabase.from("conversation_messages").insert([
  {conversation_id:conversation.id,sender_id:chloe.id,sender_kind:"user",message_type:"text",body:"The optimized time works for me. Want to keep 15 minutes before it for notes?",client_nonce:"65555555-5555-4555-8555-555555555551"},
  {conversation_id:conversation.id,sender_id:null,sender_kind:"system",message_type:"system_reminder",body:"Paper Research starts in 30 minutes. This reminder is private to you.",client_nonce:"65555555-5555-4555-8555-555555555552",private_to:justin.id},
  {conversation_id:conversation.id,sender_id:null,sender_kind:"system",message_type:"system_lateness",body:"Gym Session may be running late. Share a status only if you choose to.",client_nonce:"65555555-5555-4555-8555-555555555553",private_to:justin.id}
]);
await supabase.from("audit_events").delete().in("user_id",userIds);
const activity=Array.from({length:28},(_,index)=>({user_id:justin.id,action:"demo_schedule_protected",entity_type:"calendar_item",metadata:{seeded_demo:true},created_at:at(-index*2-1,9+(index%6))}));
await supabase.from("audit_events").insert(activity);
await supabase.from("private_activity_events").delete().in("user_id",userIds);
const activityTypes=["task_completion","deadline","meeting","preparation","schedule_adherence"],activityTitles=["Task completed","Deadline protected","Meeting coordinated","Preparation finished","Protected time followed"];
await supabase.from("private_activity_events").insert(Array.from({length:34},(_,index)=>({user_id:justin.id,activity_type:activityTypes[index%5],title:activityTitles[index%5],score:1+index%4,source_key:`demo:seed:${index}`,created_at:at(-index*2-1,9+(index%6))})));
console.log("Kairos demo accounts, Phase 5 controls, private activity, permissions, conversations, and schedules are ready.");
