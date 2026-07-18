-- Phase 4: private one-to-one conversations, immutable system updates, and
-- server-mediated private attachments. Group conversations are intentionally deferred.

create table if not exists public.direct_conversations(
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  pair_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.direct_conversation_members(
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key(conversation_id,user_id)
);
create table if not exists public.conversation_messages(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_kind text not null check(sender_kind in('user','system')),
  message_type text not null check(message_type in('text','system_reminder','system_lateness','meeting_card','repair_card')),
  body text not null check(char_length(body) between 1 and 4000),
  client_nonce uuid not null,
  private_to uuid references public.profiles(id) on delete cascade,
  related_meeting_id uuid references public.meeting_requests(id) on delete set null,
  related_proposal_id uuid references public.schedule_proposals(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint message_sender_shape check((sender_kind='user' and sender_id is not null and message_type='text')or(sender_kind='system' and sender_id is null and message_type<>'text')),
  unique(conversation_id,client_nonce)
);
create table if not exists public.message_attachments(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  display_name text not null check(char_length(display_name) between 1 and 180),
  mime_type text not null check(mime_type in('application/pdf','image/png','image/jpeg','image/webp','text/plain')),
  size_bytes bigint not null check(size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

do $$ declare table_name text;begin foreach table_name in array array['direct_conversations','direct_conversation_members','conversation_messages','message_attachments'] loop execute format('alter table public.%I enable row level security',table_name);execute format('alter table public.%I force row level security',table_name);end loop;end $$;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.direct_conversation_members member where member.conversation_id=p_conversation_id and member.user_id=auth.uid() and member.removed_at is null)
$$;
revoke all on function public.can_access_conversation(uuid) from public;
grant execute on function public.can_access_conversation(uuid) to authenticated;

create policy conversations_active_member_select on public.direct_conversations for select to authenticated using(public.can_access_conversation(id));
create policy members_active_member_select on public.direct_conversation_members for select to authenticated using(public.can_access_conversation(conversation_id));
create policy messages_active_member_select on public.conversation_messages for select to authenticated using(public.can_access_conversation(conversation_id) and(private_to is null or private_to=(select auth.uid())));
create policy attachments_active_member_select on public.message_attachments for select to authenticated using(public.can_access_conversation(conversation_id) and exists(select 1 from public.conversation_messages message where message.id=message_attachments.message_id and(message.private_to is null or message.private_to=(select auth.uid()))));

revoke all on public.direct_conversations,public.direct_conversation_members,public.conversation_messages,public.message_attachments from anon,authenticated;
grant select on public.direct_conversations,public.direct_conversation_members,public.conversation_messages,public.message_attachments to authenticated;

create or replace function public.ensure_direct_conversation(p_other_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();conversation_id uuid;canonical_pair text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
  if actor=p_other_user then raise exception 'A direct conversation needs another person';end if;
  if not exists(select 1 from public.connections where status='accepted' and((requester_id=actor and addressee_id=p_other_user)or(requester_id=p_other_user and addressee_id=actor)))then raise exception 'An accepted connection is required' using errcode='42501';end if;
  canonical_pair:=case when actor::text<p_other_user::text then actor::text||':'||p_other_user::text else p_other_user::text||':'||actor::text end;
  insert into public.direct_conversations(created_by,pair_key)values(actor,canonical_pair)on conflict(pair_key)do update set updated_at=now() returning id into conversation_id;
  insert into public.direct_conversation_members(conversation_id,user_id)values(conversation_id,actor),(conversation_id,p_other_user)on conflict(conversation_id,user_id)do nothing;
  return conversation_id;
end $$;
revoke all on function public.ensure_direct_conversation(uuid) from public;
grant execute on function public.ensure_direct_conversation(uuid) to authenticated;

create or replace function public.send_conversation_message(p_conversation_id uuid,p_body text,p_client_nonce uuid,p_related_meeting uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();message_id uuid;
begin
  if actor is null or not public.can_access_conversation(p_conversation_id)then raise exception 'Conversation access denied' using errcode='42501';end if;
  if char_length(trim(p_body))not between 1 and 4000 then raise exception 'Message body is invalid';end if;
  if p_related_meeting is not null and not public.can_access_meeting(p_related_meeting)then raise exception 'Meeting access denied' using errcode='42501';end if;
  insert into public.conversation_messages(conversation_id,sender_id,sender_kind,message_type,body,client_nonce,related_meeting_id)values(p_conversation_id,actor,'user','text',trim(p_body),p_client_nonce,p_related_meeting)on conflict(conversation_id,client_nonce)do nothing returning id into message_id;
  if message_id is null then select id into message_id from public.conversation_messages where conversation_id=p_conversation_id and client_nonce=p_client_nonce;end if;
  update public.direct_conversations set updated_at=now()where id=p_conversation_id;
  return message_id;
end $$;
revoke all on function public.send_conversation_message(uuid,text,uuid,uuid) from public;
grant execute on function public.send_conversation_message(uuid,text,uuid,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kairos-attachments','kairos-attachments',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp','text/plain'])
on conflict(id)do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- Files are uploaded and signed only by authenticated server routes after an active
-- membership check. Browser roles receive no direct storage object privileges.
drop policy if exists kairos_attachments_direct_select on storage.objects;
drop policy if exists kairos_attachments_direct_insert on storage.objects;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversation_messages')then alter publication supabase_realtime add table public.conversation_messages;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_attachments')then alter publication supabase_realtime add table public.message_attachments;end if;
end $$;
