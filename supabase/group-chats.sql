-- 단체 채팅방: 교우가 방을 만들고 원하는 교우를 초대해 함께 대화한다
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
--  * 방에 들어와 있는 교우만 대화를 읽고 쓸 수 있다. 나중에 초대된 교우는 들어온 뒤의 대화만 본다.
--  * 방 만들기·초대·나가기·이름 바꾸기·읽음 표시는 서버 함수로만 한다 (남의 방에 마음대로 들어가지 못하게).
--  * 나를 차단한 교우, 내가 차단한 교우는 초대할 수 없다. 한 방은 50명까지.
--  * 관리자는 안전한 운영과 신고 처리를 위해 모든 방의 대화를 읽을 수 있다 (읽기만 — 글쓰기·읽음 표시·입장 안내 없음).
--    이 내용은 개인정보처리방침과 이용약관에 안내되어 있다.
--  * 탈퇴하면 그 교우의 글과 참여 기록이 함께 지워지고, 아무도 남지 않은 방은 저절로 없어진다.

------------------------------------------------------------
-- 테이블
------------------------------------------------------------
create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.group_chat_members (
  chat_id uuid not null references public.group_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index if not exists group_chat_members_user_idx on public.group_chat_members (user_id);

create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.group_chats(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  kind text not null default 'text' check (kind in ('text', 'system')), -- system: 초대·나감·이름 바꿈 안내
  created_at timestamptz not null default now()
);
create index if not exists group_chat_messages_chat_idx on public.group_chat_messages (chat_id, created_at desc);

------------------------------------------------------------
-- 도움 함수
------------------------------------------------------------
create or replace function public.group_is_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

-- 지금 교우가 이 방에 들어온 때 (안 들어와 있으면 null)
create or replace function public.group_joined_at(c uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select joined_at from group_chat_members where chat_id = c and user_id = auth.uid();
$$;

create or replace function public.group_name_of(u uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(baptismal_name), '') from profiles where id = u), '교우');
$$;

-- '마리아님, 요셉님' / 여럿이면 '마리아님, 요셉님, 안나님 외 3명'
create or replace function public.group_names(ids uuid[])
returns text language sql stable security definer set search_path = public as $$
  with n as (select group_name_of(u) as name, row_number() over () as i from unnest(ids) u)
  select string_agg(name || '님', ', ' order by i) filter (where i <= 3)
    || case when count(*) > 3 then ' 외 ' || (count(*) - 3) || '명' else '' end
  from n;
$$;

create or replace function public.group_system_message(c uuid, actor uuid, text_ text)
returns void language sql security definer set search_path = public as $$
  insert into group_chat_messages (chat_id, user_id, content, kind) values (c, actor, left(text_, 1000), 'system');
$$;

------------------------------------------------------------
-- 보내기: 앱에서 직접 보낸 글은 보낸 사람·종류·시간을 서버가 정하고, 도배를 막는다
-- (이 함수는 부른 사람 권한으로 돈다 → 서버 함수가 넣는 안내 글과 앱이 보낸 글을 구분)
------------------------------------------------------------
create or replace function public.group_message_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null or public.group_joined_at(new.chat_id) is null then
      raise exception '이 채팅방에 들어와 있지 않아요';
    end if;
    if exists (select 1 from group_chat_messages
               where chat_id = new.chat_id and user_id = auth.uid() and kind = 'text' and created_at > now() - interval '1 second') then
      raise exception '조금 천천히 보내 주세요.';
    end if;
    new.user_id := auth.uid();
    new.kind := 'text';
  end if;
  new.created_at := now();
  new.content := btrim(new.content);
  return new;
end $$;
drop trigger if exists group_message_before_insert on public.group_chat_messages;
create trigger group_message_before_insert before insert on public.group_chat_messages
for each row execute function public.group_message_before_insert();

create or replace function public.group_message_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update group_chats set last_message_at = new.created_at where id = new.chat_id;
  return null;
end $$;
drop trigger if exists group_message_after_insert on public.group_chat_messages;
create trigger group_message_after_insert after insert on public.group_chat_messages
for each row execute function public.group_message_after_insert();

-- 아무도 남지 않은 방은 없앤다 (나가기·탈퇴)
create or replace function public.group_member_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from group_chat_members where chat_id = old.chat_id) then
    delete from group_chats where id = old.chat_id;
  end if;
  return null;
end $$;
drop trigger if exists group_member_after_delete on public.group_chat_members;
create trigger group_member_after_delete after delete on public.group_chat_members
for each row execute function public.group_member_after_delete();

------------------------------------------------------------
-- 서버 함수 (앱은 이것으로만 방을 만들고 초대하고 나간다)
------------------------------------------------------------
-- 초대할 수 있는 교우만 골라낸다: 나 아님, 회원, 서로 차단하지 않음, 아직 방에 없음
create or replace function public.group_invitable(c uuid, ids uuid[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u), '{}')
  from unnest(coalesce(ids, '{}')) u
  where u <> auth.uid()
    and exists (select 1 from profiles where id = u)
    and not is_blocked(u, auth.uid()) and not is_blocked(auth.uid(), u)
    and (c is null or not exists (select 1 from group_chat_members where chat_id = c and user_id = u));
$$;

create or replace function public.create_group_chat(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ids uuid[];
  cid uuid;
begin
  if me is null then raise exception '로그인이 필요합니다'; end if;
  ids := group_invitable(null, p_members);
  if cardinality(ids) < 1 then raise exception '초대할 교우를 한 명 이상 골라 주세요'; end if;
  if cardinality(ids) > 49 then raise exception '한 방에는 50명까지 들어올 수 있어요'; end if;
  if (select count(*) from group_chats where created_by = me and created_at > now() - interval '1 day') >= 20 then
    raise exception '오늘은 채팅방을 더 만들 수 없어요. 내일 다시 해 주세요.';
  end if;
  insert into group_chats (name, created_by)
  values (left(coalesce(nullif(btrim(p_name), ''), '단체 채팅방'), 40), me)
  returning id into cid;
  insert into group_chat_members (chat_id, user_id, invited_by) values (cid, me, me);
  insert into group_chat_members (chat_id, user_id, invited_by) select cid, u, me from unnest(ids) u;
  perform group_system_message(cid, me, group_name_of(me) || '님이 ' || group_names(ids) || '을 초대했어요');
  return cid;
end $$;

create or replace function public.invite_to_group_chat(p_chat uuid, p_members uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ids uuid[];
begin
  if me is null or group_joined_at(p_chat) is null then raise exception '이 채팅방에 들어와 있지 않아요'; end if;
  ids := group_invitable(p_chat, p_members);
  if cardinality(ids) = 0 then return 0; end if;
  if (select count(*) from group_chat_members where chat_id = p_chat) + cardinality(ids) > 50 then
    raise exception '한 방에는 50명까지 들어올 수 있어요';
  end if;
  insert into group_chat_members (chat_id, user_id, invited_by) select p_chat, u, me from unnest(ids) u;
  perform group_system_message(p_chat, me, group_name_of(me) || '님이 ' || group_names(ids) || '을 초대했어요');
  return cardinality(ids);
end $$;

create or replace function public.leave_group_chat(p_chat uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  delete from group_chat_members where chat_id = p_chat and user_id = me;
  if not found then return; end if;
  -- 남은 교우가 있으면 안내 (아무도 없으면 방이 이미 없어짐)
  if exists (select 1 from group_chats where id = p_chat) then
    perform group_system_message(p_chat, me, group_name_of(me) || '님이 나갔어요');
  end if;
end $$;

create or replace function public.rename_group_chat(p_chat uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n text := left(btrim(coalesce(p_name, '')), 40);
begin
  if me is null or group_joined_at(p_chat) is null then raise exception '이 채팅방에 들어와 있지 않아요'; end if;
  if n = '' then raise exception '방 이름을 적어 주세요'; end if;
  if n = (select name from group_chats where id = p_chat) then return; end if;
  update group_chats set name = n where id = p_chat;
  perform group_system_message(p_chat, me, group_name_of(me) || '님이 방 이름을 ''' || n || '''(으)로 바꿨어요');
end $$;

create or replace function public.mark_group_chat_read(p_chat uuid)
returns void language sql security definer set search_path = public as $$
  update group_chat_members set last_read_at = now() where chat_id = p_chat and user_id = auth.uid();
$$;

-- 내 단체 채팅방 목록: 마지막 대화, 안 읽은 수 (내가 차단한 교우의 글은 세지 않음)
create or replace function public.my_group_chats()
returns table (id uuid, name text, member_count int, last_message text, last_sender text, last_kind text, last_message_at timestamptz, unread int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name,
    (select count(*)::int from group_chat_members m2 where m2.chat_id = c.id),
    lm.content, case when lm.user_id is null then null else group_name_of(lm.user_id) end, lm.kind, c.last_message_at,
    (select count(*)::int from group_chat_messages x
      where x.chat_id = c.id and x.created_at > m.last_read_at and x.kind = 'text'
        and x.user_id is distinct from m.user_id and not is_blocked(m.user_id, x.user_id))
  from group_chat_members m
  join group_chats c on c.id = m.chat_id
  left join lateral (
    select x.content, x.user_id, x.kind from group_chat_messages x
    where x.chat_id = c.id and x.created_at >= m.joined_at and not is_blocked(m.user_id, x.user_id)
    order by x.created_at desc limit 1
  ) lm on true
  where m.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

-- 관리자: 모든 단체 채팅방 (참여한 교우, 대화 수, 마지막 대화)
create or replace function public.admin_group_chats()
returns table (id uuid, name text, created_at timestamptz, last_message_at timestamptz, member_count int, member_names text, message_count int, last_message text, last_sender text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.created_at, c.last_message_at,
    (select count(*)::int from group_chat_members m where m.chat_id = c.id),
    (select string_agg(group_name_of(m.user_id), ', ' order by m.joined_at) from group_chat_members m where m.chat_id = c.id),
    (select count(*)::int from group_chat_messages x where x.chat_id = c.id and x.kind = 'text'),
    lm.content, case when lm.user_id is null then null else group_name_of(lm.user_id) end
  from group_chats c
  left join lateral (
    select x.content, x.user_id from group_chat_messages x where x.chat_id = c.id and x.kind = 'text'
    order by x.created_at desc limit 1
  ) lm on true
  where public.group_is_admin()
  order by c.last_message_at desc;
$$;

------------------------------------------------------------
-- 권한
------------------------------------------------------------
alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_chat_messages enable row level security;

revoke all on public.group_chats, public.group_chat_members, public.group_chat_messages from anon;
revoke insert, update, delete on public.group_chats, public.group_chat_members from authenticated;
revoke update on public.group_chat_messages from authenticated;
grant select on public.group_chats, public.group_chat_members to authenticated;
grant select, insert, delete on public.group_chat_messages to authenticated;

drop policy if exists "group chats read" on public.group_chats;
create policy "group chats read" on public.group_chats for select to authenticated
using (public.group_joined_at(id) is not null or public.group_is_admin());

drop policy if exists "group members read" on public.group_chat_members;
create policy "group members read" on public.group_chat_members for select to authenticated
using (public.group_joined_at(chat_id) is not null or public.group_is_admin());

-- 들어온 뒤의 대화만 (관리자는 전부, 읽기만)
drop policy if exists "group messages read" on public.group_chat_messages;
create policy "group messages read" on public.group_chat_messages for select to authenticated
using (created_at >= public.group_joined_at(chat_id) or public.group_is_admin());

drop policy if exists "group messages send" on public.group_chat_messages;
create policy "group messages send" on public.group_chat_messages for insert to authenticated
with check (user_id = auth.uid() and kind = 'text' and public.group_joined_at(chat_id) is not null);

drop policy if exists "group messages delete own" on public.group_chat_messages;
create policy "group messages delete own" on public.group_chat_messages for delete to authenticated
using (user_id = auth.uid() and kind = 'text');

-- 안내 글 넣기·초대 가능 확인은 서버 함수 안에서만 (앱이 직접 부르지 못하게 — 가짜 안내 글, 차단 여부 엿보기 방지)
revoke execute on function public.group_system_message(uuid, uuid, text), public.group_invitable(uuid, uuid[]),
  public.group_names(uuid[]) from public, anon, authenticated;
revoke execute on function public.create_group_chat(text, uuid[]), public.invite_to_group_chat(uuid, uuid[]),
  public.leave_group_chat(uuid), public.rename_group_chat(uuid, text), public.mark_group_chat_read(uuid),
  public.my_group_chats(), public.admin_group_chats() from public, anon;
grant execute on function public.create_group_chat(text, uuid[]), public.invite_to_group_chat(uuid, uuid[]),
  public.leave_group_chat(uuid), public.rename_group_chat(uuid, text), public.mark_group_chat_read(uuid),
  public.my_group_chats(), public.admin_group_chats() to authenticated;

------------------------------------------------------------
-- 실시간: 새 대화·지운 대화를 바로 받는다
------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.group_chat_messages;
exception when duplicate_object then null;
end $$;

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from pg_class where relname = 'group_chat_messages' and relrowsecurity)
       then '✅ 준비됨 (방에 들어온 교우만 대화를 봐요)' else '❌ 다시 실행해 주세요' end as "단체 채팅방";
