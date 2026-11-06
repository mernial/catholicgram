-- 교우 뱃지 (lib/badges.ts — 공감왕·기도의 손·인기 글·소통왕·… + 기념 '첫 열매')
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, 예전 판 위에 다시 실행해도 됨)
--
--  * 활동 뱃지(auto)는 1등에게만 저절로 달린다(관리자 계정은 뺌): refresh_auto_badges() 가 활동을 세어 1등에게 달고, 1등이 바뀌면 옮긴다
--    (앱을 열 때마다 /api/badges/refresh 가 5분에 한 번 부름 + 아침 cron /api/cron/feast-day + 관리자 '지금 다시 계산')
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
-- 관리자 계정(ADMIN_EMAILS)은 1등에서 뺀다 (운영자 2026-11-06)
create or replace function public.refresh_auto_badges()
returns table (user_id uuid, badge_key text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_kst text := 'Asia/Seoul';
begin
  if not (auth.role() = 'service_role' or public.is_app_admin() or session_user in ('postgres', 'supabase_admin')) then
    raise exception '관리자만 할 수 있습니다';
  end if;

  -- 교우마다 활동 숫자 (뱃지 키, 교우, 숫자)
  create temp table badge_stats (badge_key text, user_id uuid, s bigint) on commit drop;
  create temp table badge_admins (user_id uuid) on commit drop;
  insert into badge_admins select id from auth.users where email in ('yunho-jo@casuwon.or.kr');

  -- 글 (스토리 빼고)
  insert into badge_stats select 'hearts', p.user_id, sum(p.like_count) from posts p where coalesce(p.is_story, false) = false group by p.user_id;
  insert into badge_stats select 'prayers', p.user_id, sum(p.pray_count) from posts p where coalesce(p.is_story, false) = false group by p.user_id;
  insert into badge_stats select 'writer', p.user_id, count(*) from posts p where coalesce(p.is_story, false) = false group by p.user_id;
  insert into badge_stats select 'photo', p.user_id, count(*) from posts p where coalesce(p.is_story, false) = false and coalesce(array_length(p.images, 1), 0) > 0 group by p.user_id;
  insert into badge_stats select 'video', p.user_id, count(*) from posts p where coalesce(p.is_story, false) = false and p.video_url is not null group by p.user_id;
  insert into badge_stats select 'story', p.user_id, count(*) from posts p where coalesce(p.is_story, false) = true group by p.user_id;
  insert into badge_stats select 'trophy', p.user_id, max(p.like_count + p.pray_count) from posts p where coalesce(p.is_story, false) = false group by p.user_id;
  insert into badge_stats select 'earlybird', p.user_id, count(*) from posts p where coalesce(p.is_story, false) = false and extract(hour from p.created_at at time zone v_kst) between 4 and 6 group by p.user_id;
  insert into badge_stats select 'nightowl', p.user_id, count(*) from posts p where coalesce(p.is_story, false) = false and (extract(hour from p.created_at at time zone v_kst) >= 22 or extract(hour from p.created_at at time zone v_kst) < 3) group by p.user_id;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'music') then
    insert into badge_stats select 'dj', p.user_id, count(*) from posts p where coalesce(p.is_story, false) = false and p.music is not null and p.music <> '' group by p.user_id;
  end if;
  -- 댓글
  insert into badge_stats select 'talker', c.user_id, count(*) from comments c where c.user_id is not null group by c.user_id;
  if to_regclass('public.comment_reactions') is not null then
    insert into badge_stats select 'comment_loved', c.user_id, count(*) from comment_reactions r join comments c on c.id::text = r.comment_id where c.user_id is not null and c.user_id <> r.user_id group by c.user_id;
  end if;
  -- 내가 준 마음
  if to_regclass('public.post_reactions') is not null then
    insert into badge_stats select 'cheer', r.user_id, count(*) from post_reactions r where r.reaction_type = 'like' group by r.user_id;
    insert into badge_stats select 'intercessor', x.user_id, sum(x.n) from (
      select r.user_id, count(*) n from post_reactions r where r.reaction_type = 'pray' group by r.user_id
      union all
      select i.user_id, count(*) from intention_prayers i group by i.user_id
    ) x group by x.user_id;
  end if;
  -- 기도지향·사랑방·단체방·메시지·익명 답글·팔로우
  if to_regclass('public.prayer_intentions') is not null then
    insert into badge_stats select 'intention', i.user_id, count(*) from prayer_intentions i group by i.user_id;
  end if;
  if to_regclass('public.lounge_messages') is not null then
    insert into badge_stats select 'lounge', l.user_id, count(*) from lounge_messages l where l.content not like '%들어왔어요%' group by l.user_id;
  end if;
  if to_regclass('public.group_chat_messages') is not null then
    insert into badge_stats select 'groupchat', g.user_id, count(*) from group_chat_messages g where g.kind = 'text' and g.user_id is not null group by g.user_id;
  end if;
  if to_regclass('public.messages') is not null then
    insert into badge_stats select 'messenger', m.sender_id, count(*) from messages m where m.sender_id is not null group by m.sender_id;
  end if;
  if to_regclass('public.anon_replies') is not null then
    insert into badge_stats select 'comforter', a.user_id, count(*) from anon_replies a where coalesce(a.is_post_author, false) = false group by a.user_id;
  end if;
  if to_regclass('public.follows') is not null then
    insert into badge_stats select 'popular', f.following_id, count(*) from follows f where coalesce(f.status, 'accepted') = 'accepted' group by f.following_id;
    insert into badge_stats select 'friendly', f.follower_id, count(*) from follows f where coalesce(f.status, 'accepted') = 'accepted' group by f.follower_id;
  end if;
  -- 들른 날·건의
  if to_regclass('public.app_sessions') is not null then
    insert into badge_stats select 'daily', a.user_id, count(distinct (a.started_at at time zone v_kst)::date) from app_sessions a where a.user_id is not null group by a.user_id;
  end if;
  if to_regclass('public.feedback') is not null then
    insert into badge_stats select 'idea', f.user_id, count(*) from feedback f where f.category = 'suggestion' group by f.user_id;
    insert into badge_stats select 'detective', f.user_id, count(*) from feedback f where f.category = 'bug' group by f.user_id;
  end if;

  -- 관리자는 1등에서 뺌, 0 은 없음. 뱃지마다 최댓값인 교우(동점이면 모두)
  delete from badge_stats bs where bs.s is null or bs.s <= 0 or bs.user_id is null or bs.user_id in (select user_id from badge_admins);
  create temp table badge_winners (user_id uuid, badge_key text) on commit drop;
  insert into badge_winners
  select bs.user_id, bs.badge_key from badge_stats bs
  where bs.s = (select max(b2.s) from badge_stats b2 where b2.badge_key = bs.badge_key);

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

-- 앱을 열 때마다 1등을 다시 계산하는 기록 (/api/badges/refresh — 5분에 한 번만, 앱은 직접 못 읽고 못 씀)
create table if not exists public.badge_refresh_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  awarded int not null default 0,
  by_user uuid
);
alter table public.badge_refresh_log enable row level security;
create index if not exists badge_refresh_log_ran_idx on public.badge_refresh_log (ran_at desc);

-- 확인: 아래가 1 이면 됨
select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'member_badges' and column_name = 'auto';
