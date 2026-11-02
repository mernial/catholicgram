-- 알림 '확인함'을 여러 기기에서 함께 (운영자 2026-11-02: '아이패드나 핸드폰이나 여러 기기에서 쓰는데,
-- 하나의 기기에서 확인했으면 다른 기기에서도 확인한 것으로')
-- 예전엔 알림 목록을 연 때·확인한 알림·지운 알림·모두 지우기·사랑방을 본 때가 그 기기(localStorage)에만 저장되었음.
-- 이제 교우마다 한 줄에 모아 두고, 앱이 1분마다·다시 열 때·확인할 때마다 합친다 (lib/alert-sync.ts).
-- 1:1 메시지 읽음(messages.read_at)·단체방 읽음(group_chat_members.last_read_at)은 예전부터 서버에 있어 그대로.
-- 여러 번 실행해도 됩니다.

create table if not exists public.user_alert_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz,          -- 알림 목록(종)을 마지막으로 연 때 → 종 옆 숫자
  cleared_at timestamptz,            -- '모두 지우기'
  feast_cleared_at timestamptz,      -- 오늘 생일·축일 안내 접음
  lounge_seen_at timestamptz,        -- 사랑방을 마지막으로 본 때 → 사랑방 새 대화 숫자
  read_keys jsonb not null default '{}'::jsonb,    -- 눌러서 확인한 알림 { "c:댓글id": 넣은 때(ms) }
  hidden_keys jsonb not null default '{}'::jsonb,  -- 하나씩 지운 알림
  updated_at timestamptz not null default now()
);

alter table public.user_alert_state enable row level security;
drop policy if exists "alert state own read" on public.user_alert_state;
create policy "alert state own read" on public.user_alert_state for select using (auth.uid() = user_id);
-- 쓰기는 아래 함수로만 (합치기 규칙: 시각은 늦은 쪽, 알림 표시는 합집합)
revoke insert, update, delete on public.user_alert_state from anon, authenticated;
grant select on public.user_alert_state to authenticated;

-- 알림 표시 합치기: 예전 것 + 새로 넣은 것, 4일 지난 것은 뺌 (알림은 3일만 보관), 많아도 2000개
create or replace function public.alert_keys_merge(old jsonb, add text[], now_ms bigint)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, max(v) as v from (
      select key as k, (value #>> '{}')::bigint as v from jsonb_each(coalesce(old, '{}'::jsonb))
      union all
      select a, now_ms from unnest(coalesce(add, '{}'::text[])) as a where a is not null and length(a) <= 80
    ) x
    group by k
    having max(v) >= now_ms - 4::bigint * 24 * 3600 * 1000
    order by max(v) desc
    limit 2000
  ) y;
$$;

create or replace function public.merge_alert_state(
  p_last_seen timestamptz default null,
  p_cleared timestamptz default null,
  p_feast_cleared timestamptz default null,
  p_lounge_seen timestamptz default null,
  p_read text[] default '{}',
  p_hidden text[] default '{}'
) returns public.user_alert_state
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  lim timestamptz := now() + interval '1 minute';  -- 휴대폰 시계가 앞서 있어도 앞으로의 알림까지 확인한 것으로 되지 않게
  r public.user_alert_state;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.user_alert_state (user_id) values (uid) on conflict (user_id) do nothing;
  update public.user_alert_state s set
    last_seen_at     = greatest(s.last_seen_at, least(p_last_seen, lim)),
    cleared_at       = greatest(s.cleared_at, least(p_cleared, lim)),
    feast_cleared_at = greatest(s.feast_cleared_at, least(p_feast_cleared, lim)),
    lounge_seen_at   = greatest(s.lounge_seen_at, least(p_lounge_seen, lim)),
    read_keys        = public.alert_keys_merge(s.read_keys, (select array_agg(x) from (select unnest(p_read) x limit 600) t), now_ms),
    hidden_keys      = public.alert_keys_merge(s.hidden_keys, (select array_agg(x) from (select unnest(p_hidden) x limit 600) t), now_ms),
    updated_at       = now()
  where s.user_id = uid
  returning * into r;
  return r;
end;
$$;

revoke all on function public.merge_alert_state(timestamptz, timestamptz, timestamptz, timestamptz, text[], text[]) from public, anon;
grant execute on function public.merge_alert_state(timestamptz, timestamptz, timestamptz, timestamptz, text[], text[]) to authenticated;

notify pgrst, 'reload schema';

-- 확인: 표와 함수가 있으면 두 줄이 나옵니다
select 'user_alert_state' as made where to_regclass('public.user_alert_state') is not null
union all
select 'merge_alert_state' where exists (select 1 from pg_proc where proname = 'merge_alert_state');
