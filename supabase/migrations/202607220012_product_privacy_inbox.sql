begin;

alter table public.profiles
  add column if not exists schedule_visibility text not null default 'private';

alter table public.profiles drop constraint if exists profiles_schedule_visibility_check;
alter table public.profiles add constraint profiles_schedule_visibility_check
  check (schedule_visibility in ('public','friends','private'));

-- Existing accounts remain private. This statement also protects databases where
-- the column was introduced manually without a default.
update public.profiles set schedule_visibility='private'
where schedule_visibility is null or schedule_visibility not in ('public','friends','private');

alter table public.direct_conversation_members
  add column if not exists last_read_at timestamptz;

update public.direct_conversation_members member
set last_read_at=coalesce(member.last_read_at,now());

create index if not exists conversation_messages_cursor_idx
  on public.conversation_messages(conversation_id,created_at desc,id desc);
create index if not exists direct_conversation_members_unread_idx
  on public.direct_conversation_members(user_id,last_read_at)
  where removed_at is null;

create table if not exists public.rate_limit_windows(
  key_hash text primary key check(length(key_hash)=64),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check(request_count>=0),
  updated_at timestamptz not null default now()
);
alter table public.rate_limit_windows enable row level security;
alter table public.rate_limit_windows force row level security;
revoke all on public.rate_limit_windows from anon,authenticated;
create index if not exists rate_limit_windows_cleanup_idx
  on public.rate_limit_windows(updated_at);

create or replace function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_count integer;
begin
  if p_key!~'^[0-9a-f]{64}$' or p_limit not between 1 and 10000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters';
  end if;
  if mod(hashtextextended(p_key,1),64)=0 then
    delete from public.rate_limit_windows where updated_at<now()-interval '7 days';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key,0));
  insert into public.rate_limit_windows(key_hash,window_started_at,request_count,updated_at)
  values(p_key,now(),1,now())
  on conflict(key_hash)do update set
    window_started_at=case when public.rate_limit_windows.window_started_at<=now()-make_interval(secs=>p_window_seconds)then now()else public.rate_limit_windows.window_started_at end,
    request_count=case when public.rate_limit_windows.window_started_at<=now()-make_interval(secs=>p_window_seconds)then 1 else public.rate_limit_windows.request_count+1 end,
    updated_at=now()
  returning request_count into current_count;
  return current_count<=p_limit;
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();marked_at timestamptz:=now();
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  update public.direct_conversation_members
  set last_read_at=marked_at
  where conversation_id=p_conversation_id and user_id=actor and removed_at is null;
  if not found then raise exception 'Conversation access denied' using errcode='42501';end if;
  return marked_at;
end $$;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.can_view_schedule_availability(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.profiles owner
    where owner.id=p_owner and (
      owner.id=auth.uid()
      or owner.schedule_visibility='public'
      or (
        owner.schedule_visibility='friends' and exists(
          select 1 from public.connections connection
          where connection.status='accepted' and (
            (connection.requester_id=owner.id and connection.addressee_id=auth.uid())
            or (connection.addressee_id=owner.id and connection.requester_id=auth.uid())
          )
        )
      )
    )
  )
$$;
revoke all on function public.can_view_schedule_availability(uuid) from public;
grant execute on function public.can_view_schedule_availability(uuid) to authenticated;

-- The only cross-user schedule read surface returns intervals. No identifiers or
-- descriptive calendar fields cross this boundary.
create or replace function public.get_schedule_availability(p_owner uuid,p_start timestamptz,p_end timestamptz)
returns table(start_at timestamptz,end_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '31 days' then
    raise exception 'Invalid availability range';
  end if;
  if not public.can_view_schedule_availability(p_owner) then
    raise exception 'Schedule availability is private' using errcode='42501';
  end if;
  return query
    select item.start_at,item.end_at
    from public.calendar_items item
    where item.user_id=p_owner and item.status in('scheduled','in_progress')
      and item.start_at is not null and item.end_at is not null
      and item.start_at<p_end and item.end_at>p_start
    order by item.start_at;
end $$;
revoke all on function public.get_schedule_availability(uuid,timestamptz,timestamptz) from public;
grant execute on function public.get_schedule_availability(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.create_meeting_request(p_title text,p_duration integer,p_range_start timestamptz,p_range_end timestamptz,p_timezone text,p_recipient_user uuid,p_recipient_email text,p_recipient_name text,p_send boolean,p_options jsonb,p_token_hash text default null,p_token_expires timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();meeting_id uuid;option jsonb;recipient_name text;recipient_email text;recipient_active uuid;base_versions jsonb;initial_state public.meeting_state:=case when p_send then 'options_sent'::public.meeting_state else 'draft'::public.meeting_state end;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if p_duration not between 15 and 480 or p_range_end<=p_range_start or jsonb_array_length(p_options) not between 1 and 5 then raise exception 'Invalid meeting request';end if;
  if p_recipient_user is not null then
    if not exists(select 1 from public.connections where status='accepted' and ((requester_id=actor and addressee_id=p_recipient_user)or(requester_id=p_recipient_user and addressee_id=actor))) then raise exception 'Connection required' using errcode='42501';end if;
    if not public.can_view_schedule_availability(p_recipient_user) then raise exception 'Schedule availability is private' using errcode='42501';end if;
    select full_name,email into recipient_name,recipient_email from public.profiles where id=p_recipient_user;
    recipient_active:=case when p_send then p_recipient_user else actor end;
  else
    if p_recipient_email is null or p_token_hash is null or p_token_expires<=now() then raise exception 'External recipient requires an expiring token';end if;
    recipient_name:=p_recipient_name;recipient_email:=p_recipient_email;recipient_active:=case when p_send then null else actor end;
  end if;
  base_versions:=jsonb_build_object(actor::text,(select schedule_version from public.profiles where id=actor));
  if p_recipient_user is not null then base_versions:=base_versions||jsonb_build_object(p_recipient_user::text,(select schedule_version from public.profiles where id=p_recipient_user));end if;
  insert into public.meeting_requests(created_by,title,duration_minutes,range_start,range_end,timezone,state,active_responder,base_schedule_versions)values(actor,p_title,p_duration,p_range_start,p_range_end,p_timezone,initial_state,recipient_active,base_versions)returning id into meeting_id;
  insert into public.meeting_participants(meeting_id,user_id,name,role)select meeting_id,actor,full_name,'organizer' from public.profiles where id=actor;
  insert into public.meeting_participants(meeting_id,user_id,email,name,role)values(meeting_id,p_recipient_user,case when p_recipient_user is null then recipient_email end,recipient_name,'recipient');
  for option in select value from jsonb_array_elements(p_options) loop insert into public.meeting_options(id,meeting_id,start_at,end_at,label,reason,source,created_by)values((option->>'id')::uuid,meeting_id,(option->>'startAt')::timestamptz,(option->>'endAt')::timestamptz,option->>'label',option->>'reason','kairos',actor);end loop;
  if p_recipient_user is null then insert into public.external_booking_tokens(meeting_id,token_hash,expires_at)values(meeting_id,p_token_hash,p_token_expires);end if;
  insert into public.meeting_transitions(meeting_id,to_state,actor_id,version)values(meeting_id,initial_state,actor,1);
  return meeting_id;
end $$;

-- Connection lifecycle now controls relationship and chat access only.
create or replace function public.manage_connection(p_connection_id uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();connection_record public.connections%rowtype;conversation_id uuid;canonical_pair text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into connection_record from public.connections where id=p_connection_id and(actor=requester_id or actor=addressee_id)for update;
  if not found then raise exception 'Connection not found' using errcode='42501';end if;
  if p_action='accept' then
    if actor<>connection_record.addressee_id or connection_record.status<>'pending' then raise exception 'Only the recipient can accept a pending connection';end if;
    update public.connections set status='accepted'where id=connection_record.id;
    canonical_pair:=case when connection_record.requester_id::text<connection_record.addressee_id::text then connection_record.requester_id::text||':'||connection_record.addressee_id::text else connection_record.addressee_id::text||':'||connection_record.requester_id::text end;
    insert into public.direct_conversations(created_by,pair_key)values(actor,canonical_pair)on conflict(pair_key)do update set updated_at=now()returning id into conversation_id;
    insert into public.direct_conversation_members(conversation_id,user_id,last_read_at)values(conversation_id,connection_record.requester_id,now()),(conversation_id,connection_record.addressee_id,now())on conflict(conversation_id,user_id)do update set removed_at=null,last_read_at=now();
    insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'connection_accepted','connection',connection_record.id);
  elsif p_action='block' then
    update public.connections set status='blocked'where id=connection_record.id;
    update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);
    insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'connection_blocked','connection',connection_record.id);
  elsif p_action='remove' then
    update public.direct_conversation_members set removed_at=now()where conversation_id in(select conversation_id from public.direct_conversation_members where user_id in(connection_record.requester_id,connection_record.addressee_id)group by conversation_id having count(distinct user_id)=2);
    delete from public.connections where id=connection_record.id;
    insert into public.audit_events(user_id,action,entity_type,entity_id)values(actor,'connection_removed','connection',connection_record.id);
    return 'removed';
  else raise exception 'Invalid connection action';end if;
  return p_action;
end $$;

create or replace function public.soft_cancel_calendar_item(p_item_id uuid,p_item_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();next_item_version integer;next_schedule_version bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  update public.calendar_items set status='cancelled',version=version+1,updated_at=now()
  where id=p_item_id and user_id=actor and version=p_item_version and status in('scheduled','in_progress')
  returning version into next_item_version;
  if next_item_version is null then raise exception 'Calendar item changed or cannot be cancelled' using errcode='40001';end if;
  update public.profiles set schedule_version=schedule_version+1 where id=actor returning schedule_version into next_schedule_version;
  update public.schedule_proposals set status='stale',updated_at=now()where user_id=actor and status='draft';
  insert into public.audit_events(user_id,action,entity_type,entity_id,metadata)values(actor,'calendar_item_cancelled','calendar_item',p_item_id,jsonb_build_object('item_version',next_item_version,'schedule_version',next_schedule_version));
  return jsonb_build_object('id',p_item_id,'status','cancelled','version',next_item_version,'schedule_version',next_schedule_version);
end $$;
revoke all on function public.soft_cancel_calendar_item(uuid,integer) from public;
grant execute on function public.soft_cancel_calendar_item(uuid,integer) to authenticated;

drop function if exists public.update_schedule_permission(uuid,text,text[]);
drop function if exists public.set_demo_mode(boolean);
drop table if exists public.schedule_permissions;

commit;
