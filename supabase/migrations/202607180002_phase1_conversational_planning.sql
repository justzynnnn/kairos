alter table public.profiles
  add column if not exists schedule_version bigint not null default 1 check (schedule_version > 0);

alter table public.calendar_items
  add column if not exists category text check (category is null or char_length(category) between 1 and 60),
  add column if not exists reminder_minutes integer not null default 10 check (reminder_minutes between 0 and 10080),
  add column if not exists source_proposal_id uuid references public.schedule_proposals(id) on delete set null;

create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  text_requests integer not null default 0 check (text_requests >= 0),
  audio_seconds integer not null default 0 check (audio_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;
alter table public.ai_usage force row level security;
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

create or replace function public.reserve_ai_usage(p_kind text, p_units integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  today_manila date := (timezone('Asia/Manila', now()))::date;
  current_text integer;
  current_audio integer;
begin
  if requesting_user is null or p_kind not in ('text', 'audio') or p_units < 1 then
    return false;
  end if;

  insert into public.ai_usage (user_id, usage_date)
  values (requesting_user, today_manila)
  on conflict (user_id, usage_date) do nothing;

  select text_requests, audio_seconds into current_text, current_audio
  from public.ai_usage
  where user_id = requesting_user and usage_date = today_manila
  for update;

  if (p_kind = 'text' and current_text + p_units > 40)
    or (p_kind = 'audio' and current_audio + p_units > 300) then
    return false;
  end if;

  update public.ai_usage
  set text_requests = text_requests + case when p_kind = 'text' then p_units else 0 end,
      audio_seconds = audio_seconds + case when p_kind = 'audio' then p_units else 0 end,
      updated_at = now()
  where user_id = requesting_user and usage_date = today_manila;
  return true;
end;
$$;

revoke all on function public.reserve_ai_usage(text, integer) from public;
grant execute on function public.reserve_ai_usage(text, integer) to authenticated;

create or replace function public.confirm_schedule_proposal(
  p_proposal_id uuid,
  p_items jsonb,
  p_preferences jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  proposal_record public.schedule_proposals%rowtype;
  current_version bigint;
  item jsonb;
  preference jsonb;
  item_type public.calendar_item_type;
  item_start timestamptz;
  item_end timestamptz;
  item_due timestamptz;
  item_latest timestamptz;
  inserted_ids jsonb := '[]'::jsonb;
  inserted_id uuid;
begin
  if requesting_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Proposal must contain between 1 and 20 items';
  end if;

  select * into proposal_record
  from public.schedule_proposals
  where id = p_proposal_id and user_id = requesting_user
  for update;
  if not found then raise exception 'Proposal not found' using errcode = '42501'; end if;
  if proposal_record.status <> 'draft' then raise exception 'Proposal is no longer pending'; end if;

  select schedule_version into current_version
  from public.profiles
  where id = requesting_user
  for update;
  if current_version <> proposal_record.base_schedule_version then
    update public.schedule_proposals set status = 'stale' where id = p_proposal_id;
    raise exception 'Schedule changed; regenerate this proposal' using errcode = '40001';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_type := (item ->> 'type')::public.calendar_item_type;
    item_start := nullif(item ->> 'start_at', '')::timestamptz;
    item_end := nullif(item ->> 'end_at', '')::timestamptz;
    item_due := nullif(item ->> 'due_at', '')::timestamptz;
    item_latest := nullif(item ->> 'latest_end', '')::timestamptz;

    if char_length(coalesce(item ->> 'title', '')) not between 1 and 160 then raise exception 'Invalid item title'; end if;
    if item_type = 'deadline' then
      if item_due is null or item_start is not null or item_end is not null then raise exception 'Invalid deadline shape'; end if;
    else
      if item_start is null or item_end is null or item_end <= item_start then raise exception 'Invalid timed item'; end if;
      if item_latest is not null and item_end > item_latest then raise exception 'Item extends past its allowed window'; end if;
      if coalesce((item ->> 'minimum_duration_minutes')::integer, 0) > extract(epoch from (item_end - item_start)) / 60 then
        raise exception 'Item is shorter than its minimum duration';
      end if;
      if exists (
        select 1 from public.calendar_items existing
        where existing.user_id = requesting_user
          and existing.status <> 'cancelled'
          and existing.start_at is not null and existing.end_at is not null
          and existing.start_at < item_end and existing.end_at > item_start
      ) then raise exception 'Item conflicts with the current schedule'; end if;
    end if;

    insert into public.calendar_items (
      user_id, item_type, title, start_at, end_at, due_at, timezone, priority,
      flexibility, earliest_start, latest_end, normal_duration_minutes,
      minimum_duration_minutes, minimum_chunk_minutes, can_shorten, can_split,
      can_skip, category, reminder_minutes, source_proposal_id
    ) values (
      requesting_user, item_type, item ->> 'title', item_start, item_end, item_due,
      coalesce(item ->> 'timezone', 'Asia/Manila'), coalesce((item ->> 'priority')::smallint, 3),
      coalesce((item ->> 'flexibility')::public.flexibility_mode, 'flexible'),
      nullif(item ->> 'earliest_start', '')::timestamptz, item_latest,
      nullif(item ->> 'normal_duration_minutes', '')::integer,
      nullif(item ->> 'minimum_duration_minutes', '')::integer,
      nullif(item ->> 'minimum_chunk_minutes', '')::integer,
      coalesce((item ->> 'can_shorten')::boolean, false),
      coalesce((item ->> 'can_split')::boolean, false),
      coalesce((item ->> 'can_skip')::boolean, false),
      nullif(item ->> 'category', ''), coalesce((item ->> 'reminder_minutes')::integer, 10),
      p_proposal_id
    ) returning id into inserted_id;
    inserted_ids := inserted_ids || to_jsonb(inserted_id);
  end loop;

  if jsonb_typeof(p_preferences) = 'array' then
    for preference in select value from jsonb_array_elements(p_preferences)
    loop
      insert into public.preferences (
        user_id, category, default_duration_minutes, flexibility,
        can_shorten, can_split, can_skip, source
      ) values (
        requesting_user, preference ->> 'category',
        nullif(preference ->> 'default_duration_minutes', '')::integer,
        nullif(preference ->> 'flexibility', '')::public.flexibility_mode,
        coalesce((preference ->> 'can_shorten')::boolean, false),
        coalesce((preference ->> 'can_split')::boolean, false),
        coalesce((preference ->> 'can_skip')::boolean, false), 'explicit'
      ) on conflict (user_id, category) do update set
        default_duration_minutes = excluded.default_duration_minutes,
        flexibility = excluded.flexibility,
        can_shorten = excluded.can_shorten,
        can_split = excluded.can_split,
        can_skip = excluded.can_skip,
        source = 'explicit',
        updated_at = now();
    end loop;
  end if;

  update public.schedule_proposals
  set status = 'approved', payload = jsonb_set(payload, '{items}', p_items, true), updated_at = now()
  where id = p_proposal_id;
  update public.profiles set schedule_version = schedule_version + 1 where id = requesting_user;
  insert into public.audit_events (user_id, action, entity_type, entity_id, metadata)
  values (requesting_user, 'proposal_confirmed', 'schedule_proposal', p_proposal_id, jsonb_build_object('item_count', jsonb_array_length(p_items)));

  return jsonb_build_object('proposal_id', p_proposal_id, 'item_ids', inserted_ids, 'schedule_version', current_version + 1);
end;
$$;

revoke all on function public.confirm_schedule_proposal(uuid, jsonb, jsonb) from public;
grant execute on function public.confirm_schedule_proposal(uuid, jsonb, jsonb) to authenticated;
