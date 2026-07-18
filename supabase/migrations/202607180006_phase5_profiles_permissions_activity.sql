-- Phase 5: profile controls, connection lifecycle, category permissions,
-- explicit preferences, and private server-generated activity.

alter table public.profiles
  add column if not exists location_enabled boolean not null default false,
  add column if not exists automation_reminders boolean not null default true,
  add column if not exists automation_lateness boolean not null default true,
  add column if not exists activity_aggregate_sharing boolean not null default false;

alter table public.schedule_permissions drop constraint if exists schedule_permissions_scope_check;
alter table public.schedule_permissions add column if not exists categories text[] not null default '{}'::text[];
alter table public.schedule_permissions add constraint schedule_permissions_scope_check check(scope in('none','free_busy','categories')and(scope='categories' or cardinality(categories)=0)and(scope<>'categories' or cardinality(categories)between 1 and 20));

create table if not exists public.private_activity_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check(activity_type in('task_completion','deadline','meeting','preparation','schedule_adherence')),
  entity_id uuid,
  title text not null check(char_length(title)between 1 and 160),
  score smallint not null default 1 check(score between 1 and 4),
  source_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint private_activity_no_sensitive_metadata check(not(metadata ?| array['location','coordinates','attachment','event_title','raw_content'])),
  unique(user_id,source_key)
);
alter table public.private_activity_events enable row level security;
alter table public.private_activity_events force row level security;
create policy private_activity_select_own on public.private_activity_events for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.private_activity_events from anon,authenticated;
grant select on public.private_activity_events to authenticated;
revoke insert on public.audit_events from authenticated;

create or replace function public.manage_connection(p_connection_id uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();connection_record public.connections%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into connection_record from public.connections where id=p_connection_id and(actor=requester_id or actor=addressee_id)for update;
  if not found then raise exception 'Connection not found' using errcode='42501';end if;
  if p_action='accept' then if actor<>connection_record.addressee_id or connection_record.status<>'pending' then raise exception 'Only the recipient can accept a pending connection';end if;update public.connections set status='accepted' where id=connection_record.id;
  elsif p_action='block' then update public.connections set status='blocked' where id=connection_record.id;delete from public.schedule_permissions where(owner_id=connection_record.requester_id and grantee_id=connection_record.addressee_id)or(owner_id=connection_record.addressee_id and grantee_id=connection_record.requester_id);update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);
  elsif p_action='remove' then delete from public.schedule_permissions where(owner_id=connection_record.requester_id and grantee_id=connection_record.addressee_id)or(owner_id=connection_record.addressee_id and grantee_id=connection_record.requester_id);update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);delete from public.connections where id=connection_record.id;return 'removed';
  else raise exception 'Invalid connection action';end if;return p_action;
end $$;
revoke all on function public.manage_connection(uuid,text) from public;
grant execute on function public.manage_connection(uuid,text) to authenticated;

create or replace function public.update_schedule_permission(p_grantee uuid,p_scope text,p_categories text[] default '{}'::text[])
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();clean_categories text[];
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if not exists(select 1 from public.connections where status='accepted' and((requester_id=actor and addressee_id=p_grantee)or(requester_id=p_grantee and addressee_id=actor)))then raise exception 'Accepted connection required' using errcode='42501';end if;
  if p_scope not in('none','free_busy','categories')then raise exception 'Invalid permission scope';end if;
  select coalesce(array_agg(distinct left(trim(value),60))filter(where trim(value)<>''),'{}'::text[])into clean_categories from unnest(coalesce(p_categories,'{}'::text[]))value;
  if p_scope='categories' and cardinality(clean_categories)not between 1 and 20 then raise exception 'Choose 1 to 20 categories';end if;
  insert into public.schedule_permissions(owner_id,grantee_id,scope,categories)values(actor,p_grantee,p_scope,case when p_scope='categories'then clean_categories else '{}'::text[]end)on conflict(owner_id,grantee_id)do update set scope=excluded.scope,categories=excluded.categories,updated_at=now();
end $$;
revoke all on function public.update_schedule_permission(uuid,text,text[]) from public;
grant execute on function public.update_schedule_permission(uuid,text,text[]) to authenticated;

create or replace function public.complete_calendar_item(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();item public.calendar_items%rowtype;activity_kind text;on_time boolean;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into item from public.calendar_items where id=p_item_id and user_id=actor for update;
  if not found then raise exception 'Calendar item not found' using errcode='42501';end if;
  if item.item_type not in('task','preparation')or item.status<>'scheduled'then raise exception 'This item cannot be completed';end if;
  activity_kind:=case when item.item_type='preparation'then 'preparation'else 'task_completion'end;on_time:=item.end_at is null or now()<=item.end_at+interval '15 minutes';
  update public.calendar_items set status='completed',version=version+1,updated_at=now()where id=item.id;
  update public.profiles set schedule_version=schedule_version+1 where id=actor;
  insert into public.private_activity_events(user_id,activity_type,entity_id,title,score,source_key)values(actor,activity_kind,item.id,item.title,case when on_time then 3 else 2 end,'complete:'||item.id::text)on conflict(user_id,source_key)do nothing;
  if on_time then insert into public.private_activity_events(user_id,activity_type,entity_id,title,score,source_key)values(actor,'schedule_adherence',item.id,'Protected time followed',2,'adherence:'||item.id::text)on conflict(user_id,source_key)do nothing;end if;
  return jsonb_build_object('item_id',item.id,'status','completed','schedule_version',(select schedule_version from public.profiles where id=actor));
end $$;
revoke all on function public.complete_calendar_item(uuid) from public;
grant execute on function public.complete_calendar_item(uuid) to authenticated;

create or replace function public.get_shared_activity_aggregate(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles where id=p_user and activity_aggregate_sharing=true)or not exists(select 1 from public.connections where status='accepted' and((requester_id=actor and addressee_id=p_user)or(requester_id=p_user and addressee_id=actor)))then return null;end if;
  select jsonb_build_object('active_days',count(distinct created_at::date),'total_actions',count(*),'current_streak',0)into result from public.private_activity_events where user_id=p_user and created_at>=now()-interval '30 days';return result;
end $$;
revoke all on function public.get_shared_activity_aggregate(uuid) from public;
grant execute on function public.get_shared_activity_aggregate(uuid) to authenticated;
