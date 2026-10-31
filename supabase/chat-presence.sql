-- 지금 보고 있는 대화방 (운영자 요청 2026-10-31: 대화하는 상대의 메시지는 휴대폰 알림·배너가 뜨지 않게)
-- 앱이 대화방(1:1·단체방·사랑방)을 화면에 띄우고 있는 동안 8초마다 '이 방을 보는 중'을 적고, 나가거나 앱이 뒤로 가면 지운다.
-- 휴대폰 알림을 보내는 서버(/api/push/notify)는 받는 교우가 20초 안에 그 방을 보고 있었으면 그 교우의 모든 기기에 보내지 않는다
-- (아이폰·아이패드는 알림을 받으면 꼭 띄워야 해서 앱이 막을 수 없었음, 다른 기기·같은 휴대폰의 다른 앱에도 울렸음).
-- 누가 어느 방을 보는지는 본인만 쓰고 아무도 읽을 수 없다(서버만 읽음). 여러 번 실행해도 괜찮음.

create table if not exists public.chat_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  room text not null,                      -- 'dm:<상대 id>' · 'group:<방 id>' · 'lounge'
  seen_at timestamptz not null default now(),
  primary key (user_id, room)
);
alter table public.chat_presence enable row level security;
revoke all on public.chat_presence from anon, authenticated; -- 앱은 아래 두 함수로만 (시각은 서버 시계로)

create or replace function public.touch_chat_presence(p_room text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_room is null or p_room !~ '^(dm:[0-9a-f-]{36}|group:[0-9a-f-]{36}|lounge)$' then return; end if;
  insert into chat_presence (user_id, room, seen_at) values (auth.uid(), p_room, now())
  on conflict (user_id, room) do update set seen_at = now();
  delete from chat_presence where user_id = auth.uid() and seen_at < now() - interval '1 day'; -- 오래된 줄 정리
end $$;

create or replace function public.leave_chat_presence(p_room text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from chat_presence where user_id = auth.uid() and room = p_room;
end $$;

revoke all on function public.touch_chat_presence(text) from public, anon;
revoke all on function public.leave_chat_presence(text) from public, anon;
grant execute on function public.touch_chat_presence(text) to authenticated;
grant execute on function public.leave_chat_presence(text) to authenticated;

-- 확인: ✅ 면 준비됨
select '보고 있는 대화방 알림 끄기' as 항목,
  case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chat_presence')
        and exists (select 1 from pg_proc where proname = 'touch_chat_presence')
        and exists (select 1 from pg_proc where proname = 'leave_chat_presence')
  then '✅' else '❌' end as 확인;
