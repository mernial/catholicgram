-- 교우 뱃지 (lib/badges.ts — 공감왕·기도의 손·인기 글·소통왕·… + 기념 '첫 열매')
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, 예전 판 위에 다시 실행해도 됨)
--
--  * 활동 뱃지(auto)는 1등에게만 저절로 달린다: refresh_auto_badges() 가 활동을 세어 1등에게 달고, 1등이 바뀌면 옮긴다
--    (아침 cron /api/cron/feast-day 이 매일 부름, 관리자는 뱃지 달기 창 '지금 다시 계산'으로도)
--  * 기념 뱃지(첫 열매)는 관리자가 교우 공간의 '뱃지 달기'에서 달고 뗀다 (is_app_admin)
--  * 누구나(로그인한 교우) 모든 교우의 뱃지를 볼 수 있다. 본인이 숨기면(profiles.hide_badges) 앱이 다른 교우에게 보이지 않게 한다
create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

create table if not exists public.member_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null check (char_length(badge_key) between 1 and 40),
  note text check (note is null or char_length(note) <= 60),
  granted_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, badge_key)
);
alter table public.member_badges add column if not exists auto boolean not null default false; -- 1등 자동 뱃지
create index if not exists member_badges_user_idx on public.member_badges (user_id);

alter table public.member_badges enable row level security;

drop policy if exists "member_badges_select" on public.member_badges;
create policy "member_badges_select" on public.member_badges
  for select using (auth.role() = 'authenticated');

drop policy if exists "member_badges_insert" on public.member_badges;
create policy "member_badges_insert" on public.member_badges
  for insert with check (public.is_app_admin());

drop policy if exists "member_badges_update" on public.member_badges;
create policy "member_badges_update" on public.member_badges
  for update using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "member_badges_delete" on public.member_badges;
create policy "member_badges_delete" on public.member_badges
  for delete using (public.is_app_admin());

grant select, insert, update, delete on public.member_badges to authenticated;

-- 뱃지 숨기기 (본인이 내 공간에서 끄면 다른 교우에게 안 보임, 기본은 보임)
alter table public.profiles add column if not exists hide_badges boolean not null default false;
grant select (hide_badges) on public.profiles to anon, authenticated;
grant update (hide_badges) on public.profiles to authenticated;

-- 1등 자동 뱃지 계산 (service role·관리자만). 돌려주는 줄 = 이번에 새로 받은 교우 (앱이 알림을 보냄)
create or replace function public.refresh_auto_badges()
returns table (user_id uuid, badge_key text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  has_sessions boolean := to_regclass('public.app_sessions') is not null;
  has_lounge boolean := to_regclass('public.lounge_messages') is not null;
  has_feedback boolean := to_regclass('public.feedback') is not null;
  has_intentions boolean := to_regclass('public.prayer_intentions') is not null;
begin
  if not (auth.role() = 'service_role' or public.is_app_admin() or session_user in ('postgres', 'supabase_admin')) then
    raise exception '관리자만 할 수 있습니다';
  end if;

  create temp table badge_winners (user_id uuid, badge_key text) on commit drop;

  -- 받은 공감 / 받은 기도 / 쓴 글 / 사진 글 (스토리 빼고)
  insert into badge_winners
  select t.user_id, 'hearts' from (select p.user_id, sum(p.like_count) s from posts p where coalesce(p.is_story, false) = false group by p.user_id) t
  where t.s > 0 and t.s = (select max(s) from (select sum(like_count) s from posts where coalesce(is_story, false) = false group by user_id) m);
  insert into badge_winners
  select t.user_id, 'prayers' from (select p.user_id, sum(p.pray_count) s from posts p where coalesce(p.is_story, false) = false group by p.user_id) t
  where t.s > 0 and t.s = (select max(s) from (select sum(pray_count) s from posts where coalesce(is_story, false) = false group by user_id) m);
  insert into badge_winners
  select t.user_id, 'writer' from (select p.user_id, count(*) s from posts p where coalesce(p.is_story, false) = false group by p.user_id) t
  where t.s = (select max(s) from (select count(*) s from posts where coalesce(is_story, false) = false group by user_id) m);
  insert into badge_winners
  select t.user_id, 'photo' from (select p.user_id, count(*) s from posts p where coalesce(p.is_story, false) = false and (coalesce(array_length(p.images, 1), 0) > 0 or p.video_url is not null) group by p.user_id) t
  where t.s = (select max(s) from (select count(*) s from posts where coalesce(is_story, false) = false and (coalesce(array_length(images, 1), 0) > 0 or video_url is not null) group by user_id) m);
  -- 인기 글: 공감+기도가 가장 많은 글 한 편의 글쓴이
  insert into badge_winners
  select p.user_id, 'trophy' from posts p where coalesce(p.is_story, false) = false and (p.like_count + p.pray_count) > 0
    and (p.like_count + p.pray_count) = (select max(like_count + pray_count) from posts where coalesce(is_story, false) = false);
  -- 쓴 댓글
  insert into badge_winners
  select t.user_id, 'talker' from (select c.user_id, count(*) s from comments c where c.user_id is not null group by c.user_id) t
  where t.s = (select max(s) from (select count(*) s from comments where user_id is not null group by user_id) m);

  if has_intentions then
    insert into badge_winners
    select t.user_id, 'intention' from (select i.user_id, count(*) s from prayer_intentions i group by i.user_id) t
    where t.s = (select max(s) from (select count(*) s from prayer_intentions group by user_id) m);
  end if;
  if has_lounge then
    insert into badge_winners
    select t.user_id, 'lounge' from (select l.user_id, count(*) s from lounge_messages l where l.content not like '%들어왔어요%' group by l.user_id) t
    where t.s = (select max(s) from (select count(*) s from lounge_messages where content not like '%들어왔어요%' group by user_id) m);
  end if;
  if has_sessions then
    insert into badge_winners
    select t.user_id, 'daily' from (select a.user_id, count(distinct (a.started_at at time zone 'Asia/Seoul')::date) s from app_sessions a where a.user_id is not null group by a.user_id) t
    where t.s = (select max(s) from (select count(distinct (started_at at time zone 'Asia/Seoul')::date) s from app_sessions where user_id is not null group by user_id) m);
  end if;
  if has_feedback then
    insert into badge_winners
    select t.user_id, 'idea' from (select f.user_id, count(*) s from feedback f where f.category = 'suggestion' group by f.user_id) t
    where t.s = (select max(s) from (select count(*) s from feedback where category = 'suggestion' group by user_id) m);
    insert into badge_winners
    select t.user_id, 'detective' from (select f.user_id, count(*) s from feedback f where f.category = 'bug' group by f.user_id) t
    where t.s = (select max(s) from (select count(*) s from feedback where category = 'bug' group by user_id) m);
  end if;

  -- 더는 1등이 아닌 자동 뱃지는 떼고(관리자가 직접 단 것은 그대로), 새 1등에게 달기
  delete from member_badges mb where mb.auto and not exists (select 1 from badge_winners w where w.user_id = mb.user_id and w.badge_key = mb.badge_key);
  return query
    insert into member_badges (user_id, badge_key, auto, granted_by)
    select distinct w.user_id, w.badge_key, true, null::uuid from badge_winners w
    on conflict (user_id, badge_key) do nothing
    returning member_badges.user_id, member_badges.badge_key;
end;
$$;
revoke all on function public.refresh_auto_badges() from public, anon;
grant execute on function public.refresh_auto_badges() to authenticated, service_role;

-- 확인: 아래가 1 이면 됨
select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'member_badges' and column_name = 'auto';
