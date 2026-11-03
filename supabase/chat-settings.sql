-- 채팅방 설정: ① 채팅방 알림 끄기 (1:1·단체방) ② 단체방 방장 — 방 사진 바꾸기·교우 내보내기
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, group-chats.sql 다음)
--
--  * 알림 끄기: 교우마다 '이 방은 휴대폰 알림을 받지 않음'을 적어 둔다 (본인 것만 읽고 쓰기).
--    서버(/api/push/notify)가 1:1·단체방 새 메시지 알림을 보낼 때 이 표를 보고 그 교우에게는 보내지 않는다.
--    방 이름: 'dm:<상대 교우 id>' · 'group:<단체방 id>'
--  * 방장: 단체방을 만든 교우. 방장이 나가면(탈퇴·내보내짐 포함) 가장 먼저 들어온 교우가 방장이 된다.
--    (한 명만 남으면 방이 없어진다 — group-cleanup.sql)
--    방장만 방 사진을 바꾸고 다른 교우를 내보낼 수 있다 (서버 함수로만).

------------------------------------------------------------
-- ① 채팅방 알림 끄기
------------------------------------------------------------
create table if not exists public.chat_mutes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room text not null check (room ~ '^(dm|group):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, room)
);

alter table public.chat_mutes enable row level security;
revoke all on public.chat_mutes from anon;
revoke update on public.chat_mutes from authenticated;
grant select, insert, delete on public.chat_mutes to authenticated;

drop policy if exists "chat mutes own read" on public.chat_mutes;
create policy "chat mutes own read" on public.chat_mutes for select to authenticated using (user_id = auth.uid());
drop policy if exists "chat mutes own add" on public.chat_mutes;
create policy "chat mutes own add" on public.chat_mutes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "chat mutes own remove" on public.chat_mutes;
create policy "chat mutes own remove" on public.chat_mutes for delete to authenticated using (user_id = auth.uid());

-- 한 교우가 끌 수 있는 방은 1000개까지 (표를 함부로 키우지 못하게)
create or replace function public.chat_mutes_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from chat_mutes where user_id = new.user_id) >= 1000 then
    raise exception '알림을 끈 채팅방이 너무 많아요';
  end if;
  return new;
end $$;
drop trigger if exists chat_mutes_limit on public.chat_mutes;
create trigger chat_mutes_limit before insert on public.chat_mutes
for each row execute function public.chat_mutes_limit();

------------------------------------------------------------
-- ② 단체방 방장 · 방 사진
------------------------------------------------------------
alter table public.group_chats add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.group_chats add column if not exists avatar_url text;

-- 예전 방: 만든 교우가 아직 방에 있으면 그 교우, 아니면 가장 먼저 들어온 교우
update public.group_chats g set owner_id = coalesce(
  (select m.user_id from group_chat_members m where m.chat_id = g.id and m.user_id = g.created_by),
  (select m.user_id from group_chat_members m where m.chat_id = g.id order by m.joined_at, m.user_id limit 1))
where g.owner_id is null;

-- 새 방: 만든 교우가 방장 (create_group_chat 은 그대로 두고 여기서 채움)
create or replace function public.group_chat_owner_default()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.owner_id is null then new.owner_id := new.created_by; end if;
  return new;
end $$;
drop trigger if exists group_chat_owner_default on public.group_chats;
create trigger group_chat_owner_default before insert on public.group_chats
for each row execute function public.group_chat_owner_default();

-- 앱이 방 정보를 직접 고치지 못하게 (방장·사진은 아래 서버 함수로만) — group-chats.sql 에서 이미 막혀 있지만 한 번 더
revoke insert, update, delete on public.group_chats from authenticated;

-- 방장이 나가면 가장 먼저 들어온 교우에게 (아무도 없으면 방이 이미 없어짐 — group_member_after_delete)
create or replace function public.group_owner_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare next_owner uuid;
begin
  if not exists (select 1 from group_chats where id = old.chat_id and owner_id = old.user_id) then return null; end if;
  select user_id into next_owner from group_chat_members where chat_id = old.chat_id order by joined_at, user_id limit 1;
  if next_owner is null then return null; end if;
  update group_chats set owner_id = next_owner where id = old.chat_id;
  return null; -- 안내 글은 나가기 함수가 '나갔어요'와 한 줄로 (같은 시각의 안내 글 둘은 순서가 뒤섞일 수 있어서)
end $$;
drop trigger if exists group_owner_after_delete on public.group_chat_members;
create trigger group_owner_after_delete after delete on public.group_chat_members
for each row execute function public.group_owner_after_delete();

-- 나가기: 방장이 나가면 '○○님이 나갔어요 · △△님이 새 방장이 되었어요' (group-chats.sql 의 나가기를 바꿈)
create or replace function public.leave_group_chat(p_chat uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  was_owner boolean := exists (select 1 from group_chats where id = p_chat and owner_id = auth.uid());
  next_owner uuid;
begin
  delete from group_chat_members where chat_id = p_chat and user_id = me;
  if not found then return; end if;
  -- 남은 교우가 있으면 안내 (아무도 없으면 방이 이미 없어짐)
  if exists (select 1 from group_chats where id = p_chat) then
    select owner_id into next_owner from group_chats where id = p_chat;
    perform group_system_message(p_chat, me, group_name_of(me) || '님이 나갔어요'
      || case when was_owner and next_owner is not null and next_owner <> me then ' · ' || group_name_of(next_owner) || '님이 새 방장이 되었어요' else '' end);
  end if;
end $$;

-- 방장: 방 사진 바꾸기 (p_url 이 비어 있으면 사진 빼기)
create or replace function public.set_group_chat_avatar(p_chat uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  u text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if me is null or not exists (select 1 from group_chats where id = p_chat and owner_id = me) then
    raise exception '방장만 채팅방 사진을 바꿀 수 있어요';
  end if;
  if group_joined_at(p_chat) is null then raise exception '이 채팅방에 들어와 있지 않아요'; end if;
  if u is not null and (u !~ '^https://[^\s]+$' or char_length(u) > 600) then raise exception '사진 주소가 올바르지 않아요'; end if;
  if u is not distinct from (select avatar_url from group_chats where id = p_chat) then return; end if;
  update group_chats set avatar_url = u where id = p_chat;
  perform group_system_message(p_chat, me, group_name_of(me) || '님이 채팅방 사진을 ' || case when u is null then '지웠어요' else '바꿨어요' end);
end $$;

-- 방장: 교우 내보내기 (방장 자신은 '나가기'로)
create or replace function public.remove_from_group_chat(p_chat uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from group_chats where id = p_chat and owner_id = me) then
    raise exception '방장만 교우를 내보낼 수 있어요';
  end if;
  if p_user is null or p_user = me then raise exception '방장은 내보낼 수 없어요. 방에서 나가려면 나가기를 눌러 주세요'; end if;
  delete from group_chat_members where chat_id = p_chat and user_id = p_user;
  if not found then return; end if;
  -- 한 명만 남으면 방이 없어지므로(group_member_after_delete) 남아 있을 때만 안내
  if exists (select 1 from group_chats where id = p_chat) then
    perform group_system_message(p_chat, me, group_name_of(me) || '님이 ' || group_name_of(p_user) || '님을 내보냈어요');
  end if;
end $$;

revoke execute on function public.set_group_chat_avatar(uuid, text), public.remove_from_group_chat(uuid, uuid) from public, anon;
grant execute on function public.set_group_chat_avatar(uuid, text), public.remove_from_group_chat(uuid, uuid) to authenticated;

-- 확인: 아래 세 줄이 나오면 끝
select 'chat_mutes' as what, count(*) from public.chat_mutes
union all select 'group owners', count(*) from public.group_chats where owner_id is not null
union all select 'owner functions', count(*) from pg_proc where proname in ('set_group_chat_avatar', 'remove_from_group_chat');
