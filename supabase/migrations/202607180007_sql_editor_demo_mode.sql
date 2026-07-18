-- Quick-hosting support: an authenticated user may seed or remove their own
-- database-backed demo schedule from Profile. This keeps the Vercel demo on
-- Supabase instead of relying on process memory.

alter table public.profiles add column if not exists demo_mode boolean not null default false;
alter table public.calendar_items add column if not exists demo_seeded boolean not null default false;
alter table public.preferences add column if not exists demo_seeded boolean not null default false;

create or replace function public.set_demo_mode(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  actor_email text;
  counterpart_email text;
  counterpart uuid;
  connection_id uuid;
  conversation_id uuid;
  canonical_pair text;
  base_day timestamptz;
  class_id uuid;
  gym_id uuid;
  deadline_id uuid;
  seeded_items integer:=0;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select email into actor_email from public.profiles where id=actor for update;
  if actor_email is null then raise exception 'Profile not found' using errcode='42501';end if;

  if not p_enabled then
    delete from public.calendar_items where user_id=actor and demo_seeded=true;
    get diagnostics seeded_items=row_count;
    delete from public.preferences where user_id=actor and demo_seeded=true;
    delete from public.private_activity_events where user_id=actor and source_key like 'demo:%';
    update public.profiles set demo_mode=false,schedule_version=schedule_version+1,updated_at=now()where id=actor;
    return jsonb_build_object('enabled',false,'removed_items',seeded_items);
  end if;

  update public.profiles set demo_mode=true,updated_at=now()where id=actor;
  if not exists(select 1 from public.calendar_items where user_id=actor and demo_seeded=true)then
    base_day:=(date_trunc('day',now()at time zone 'Asia/Manila')at time zone 'Asia/Manila');
    insert into public.calendar_items(user_id,item_type,title,description,start_at,end_at,timezone,priority,flexibility,normal_duration_minutes,minimum_duration_minutes,location_label,category,recurrence_rule,demo_seeded)
      values(actor,'event','Systems Design Class','Kairos hosted demo data',base_day+interval '10 hours',base_day+interval '11 hours 30 minutes','Asia/Manila',4,'fixed',90,90,'Engineering Building','Class','FREQ=WEEKLY;BYDAY=MO,WE',true)returning id into class_id;
    insert into public.calendar_items(user_id,item_type,title,description,start_at,end_at,timezone,priority,flexibility,earliest_start,latest_end,normal_duration_minutes,minimum_duration_minutes,location_label,category,demo_seeded)
      values(actor,'task','Gym Session','Kairos hosted demo data',base_day+interval '12 hours 15 minutes',base_day+interval '13 hours 15 minutes','Asia/Manila',3,'flexible',base_day+interval '11 hours 30 minutes',base_day+interval '18 hours',60,60,'Campus Gym','Fitness',true)returning id into gym_id;
    insert into public.calendar_items(user_id,item_type,title,description,due_at,timezone,priority,flexibility,category,demo_seeded)
      values(actor,'deadline','Research Paper Due','Kairos hosted demo data',base_day+interval '3 days 17 hours','Asia/Manila',5,'fixed','Deadline',true)returning id into deadline_id;
    insert into public.calendar_items(user_id,item_type,title,description,start_at,end_at,timezone,priority,flexibility,earliest_start,latest_end,normal_duration_minutes,minimum_duration_minutes,minimum_chunk_minutes,can_split,location_label,related_deadline_id,category,demo_seeded)
      values(actor,'preparation','Paper Research','Kairos hosted demo data',base_day+interval '14 hours',base_day+interval '15 hours 30 minutes','Asia/Manila',4,'flexible',base_day+interval '13 hours 30 minutes',base_day+interval '1 day 19 hours',90,90,30,true,'Library',deadline_id,'Preparation',true);
    insert into public.calendar_items(user_id,item_type,title,description,start_at,end_at,timezone,priority,flexibility,normal_duration_minutes,minimum_duration_minutes,location_label,category,demo_seeded)
      values(actor,'event','Team Project Sync','Kairos hosted demo data',base_day+interval '1 day 15 hours',base_day+interval '1 day 16 hours','Asia/Manila',3,'protected',60,60,'Online','Meeting',true);
    insert into public.calendar_item_dependencies(item_id,depends_on_id,user_id)values(gym_id,class_id,actor)on conflict do nothing;
    get diagnostics seeded_items=row_count;
    seeded_items:=5;
    update public.profiles set schedule_version=schedule_version+1 where id=actor;
  end if;

  insert into public.preferences(user_id,category,default_duration_minutes,flexibility,can_shorten,can_split,can_skip,source,demo_seeded)
    values(actor,'Fitness',60,'flexible',false,false,false,'explicit',true),(actor,'Preparation',90,'protected',false,true,false,'explicit',true)
    on conflict(user_id,category)do nothing;
  insert into public.private_activity_events(user_id,activity_type,title,score,source_key,created_at)
    select actor,(array['task_completion','deadline','meeting','preparation','schedule_adherence'])[1+(entry%5)],(array['Task completed','Deadline protected','Meeting coordinated','Preparation finished','Protected time followed'])[1+(entry%5)],1+(entry%4),'demo:'||entry::text,now()-(entry*2+1)*interval '1 day'
    from generate_series(0,33)entry on conflict(user_id,source_key)do nothing;

  -- If both standard rehearsal accounts already registered through Supabase Auth,
  -- enabling Demo mode on either account connects them automatically.
  counterpart_email:=case when lower(actor_email)='demo@kairos.app'then'chloe@kairos.app'when lower(actor_email)='chloe@kairos.app'then'demo@kairos.app'else null end;
  if counterpart_email is not null then
    select id into counterpart from public.profiles where lower(email)=counterpart_email limit 1;
    if counterpart is not null then
      select id into connection_id from public.connections where(requester_id=actor and addressee_id=counterpart)or(requester_id=counterpart and addressee_id=actor)limit 1;
      if connection_id is null then insert into public.connections(requester_id,addressee_id,status)values(actor,counterpart,'accepted')returning id into connection_id;else update public.connections set status='accepted'where id=connection_id;end if;
      insert into public.schedule_permissions(owner_id,grantee_id,scope,categories)values(actor,counterpart,'free_busy','{}'::text[]),(counterpart,actor,'free_busy','{}'::text[])on conflict(owner_id,grantee_id)do nothing;
      canonical_pair:=case when actor::text<counterpart::text then actor::text||':'||counterpart::text else counterpart::text||':'||actor::text end;
      insert into public.direct_conversations(created_by,pair_key)values(actor,canonical_pair)on conflict(pair_key)do update set updated_at=now()returning id into conversation_id;
      insert into public.direct_conversation_members(conversation_id,user_id)values(conversation_id,actor),(conversation_id,counterpart)on conflict(conversation_id,user_id)do update set removed_at=null;
    end if;
  end if;
  return jsonb_build_object('enabled',true,'seeded_items',seeded_items,'demo_connection_ready',counterpart is not null);
end $$;
revoke all on function public.set_demo_mode(boolean)from public;
grant execute on function public.set_demo_mode(boolean)to authenticated;
