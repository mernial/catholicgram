-- 교우가 한 명 이하인 단체 채팅방 지우기 (운영자 요청 2026-11-03: '관리자가 보는 단체톡방은 구성원이 없으면 자동으로 방을 지워줘' → '한 명만 있어도 지우자')
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, group-chats.sql 다음)
--
--  * 지금 남아 있는 교우 0명·1명인 방을 지운다 (그 방의 대화·감정 표시도 함께 지워짐, 남은 한 명의 목록에서도 사라짐).
--  * 나가기·내보내기·탈퇴로 한 명 이하만 남으면 방을 지우는 장치(트리거)를 건다 (group-chats.sql 도 같게 바꿈).
--  * 관리자가 '모든 단체방'을 열 때마다 한 명 이하인 방을 먼저 지우고 목록을 보여 준다.

-- 한 명 이하만 남으면(나가기·내보내기·탈퇴) 방을 없앤다
create or replace function public.group_member_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from group_chat_members where chat_id = old.chat_id) <= 1 then
    delete from group_chats where id = old.chat_id;
  end if;
  return null;
end $$;
drop trigger if exists group_member_after_delete on public.group_chat_members;
create trigger group_member_after_delete after delete on public.group_chat_members
for each row execute function public.group_member_after_delete();

-- 방장의 내보내기: 한 명만 남아 방이 없어졌으면 안내 글을 넣지 않는다 (chat-settings.sql 과 같은 것 — 그 SQL 을 실행했을 때만 쓰임)
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
  if exists (select 1 from group_chats where id = p_chat) then
    perform group_system_message(p_chat, me, group_name_of(me) || '님이 ' || group_name_of(p_user) || '님을 내보냈어요');
  end if;
end $$;
revoke execute on function public.remove_from_group_chat(uuid, uuid) from public, anon;
grant execute on function public.remove_from_group_chat(uuid, uuid) to authenticated;

-- 관리자: 모든 단체 채팅방 — 교우가 한 명 이하인 방은 먼저 지우고 보여 준다
create or replace function public.admin_group_chats()
returns table (id uuid, name text, created_at timestamptz, last_message_at timestamptz, member_count int, member_names text, message_count int, last_message text, last_sender text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.group_is_admin() then return; end if;
  delete from group_chats g where (select count(*) from group_chat_members m where m.chat_id = g.id) <= 1;
  return query
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
  order by c.last_message_at desc;
end $$;
revoke execute on function public.admin_group_chats() from public, anon;
grant execute on function public.admin_group_chats() to authenticated;

-- 지금 남아 있는 한 명 이하 방 지우기
delete from public.group_chats g where (select count(*) from public.group_chat_members m where m.chat_id = g.id) <= 1;

-- 확인: '한 명 이하 방' 0 이 나오면 끝
select '한 명 이하 방' as what, count(*) from public.group_chats g where (select count(*) from public.group_chat_members m where m.chat_id = g.id) <= 1
union all select '남은 단체방', count(*) from public.group_chats;
