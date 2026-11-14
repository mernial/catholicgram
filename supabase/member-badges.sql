-- 교우 뱃지 (lib/badges.ts — 공감왕·기도의 손·인기 글·소통왕·… + 기념 '첫 열매')
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, 예전 판 위에 다시 실행해도 됨)
--
--  * 활동 뱃지(auto)는 1등에게만 저절로 달린다(관리자 계정은 뺌, 활동 숫자 5 이상일 때만): refresh_auto_badges() 가 활동을 세어 1등에게 달고, 1등이 바뀌면 옮긴다
--    (앱을 열 때마다 /api/badges/refresh 가 5분에 한 번 부름 + 아침 cron /api/cron/feast-day + 관리자 '지금 다시 계산')
--  * 달성 도장(permanent, lib/badges.ts milestone — 글 10편·출석 30일·함께 1년…)은 기준을 넘은 교우 모두에게 저절로, 한 번 받으면 떼지 않는다
--  * 받은 기록(badge_stamps)은 뱃지를 받을 때마다 한 줄 남아(트리거), 1등이 바뀌어 뱃지가 떨어져도 '몇 월 며칠에 받음' 도장으로 남는다 (운영자 2026-11-06 '스탬프 모으듯')
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
alter table public.member_badges add column if not exists permanent boolean not null default false; -- 달성 도장 (떼지 않음)
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

-- 받은 기록(도장): 뱃지를 받을 때마다 한 줄, 뱃지가 떨어져도 남음. 앱은 읽기만(로그인한 교우 누구나), 쓰기는 트리거만
create table if not exists public.badge_stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  auto boolean not null default false,
  note text
);
create index if not exists badge_stamps_user_idx on public.badge_stamps (user_id, earned_at desc);
alter table public.badge_stamps enable row level security;
drop policy if exists "badge_stamps_select" on public.badge_stamps;
create policy "badge_stamps_select" on public.badge_stamps for select using (auth.role() = 'authenticated');
grant select on public.badge_stamps to authenticated;

create or replace function public.member_badges_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 같은 뱃지를 하루 안에 다시 받으면(1등이 오락가락) 도장은 한 번만
  if not exists (select 1 from public.badge_stamps s where s.user_id = new.user_id and s.badge_key = new.badge_key and s.earned_at > new.created_at - interval '1 day') then
    insert into public.badge_stamps (user_id, badge_key, earned_at, auto, note) values (new.user_id, new.badge_key, new.created_at, new.auto, new.note);
  end if;
  return new;
end;
$$;
drop trigger if exists member_badges_stamp on public.member_badges;
create trigger member_badges_stamp after insert on public.member_badges for each row execute function public.member_badges_stamp();
-- 이미 달려 있는 뱃지도 도장으로 (한 번만)
insert into public.badge_stamps (user_id, badge_key, earned_at, auto, note)
select mb.user_id, mb.badge_key, mb.created_at, mb.auto, mb.note from public.member_badges mb
where not exists (select 1 from public.badge_stamps s where s.user_id = mb.user_id and s.badge_key = mb.badge_key);

-- 활동 등급 단계 숫자 (lib/badges.ts LADDERS 와 같아야 함 — 2026-11-14 운영자 요청으로 넓힘). 이 파일을 다시 실행하면 이 숫자로 맞춰짐
create table if not exists public.badge_ladder_steps (family text not null, stat text not null, tier int not null, min_s bigint not null, primary key (family, tier));
alter table public.badge_ladder_steps enable row level security;
delete from public.badge_ladder_steps;
insert into public.badge_ladder_steps values
  ('comments', 'talker', 1, 10), ('comments', 'talker', 2, 50), ('comments', 'talker', 3, 150), ('comments', 'talker', 4, 400), ('comments', 'talker', 5, 1000), ('comments', 'talker', 6, 2500), ('comments', 'talker', 7, 5000),
  ('hearts', 'hearts', 1, 30), ('hearts', 'hearts', 2, 100), ('hearts', 'hearts', 3, 300), ('hearts', 'hearts', 4, 1000), ('hearts', 'hearts', 5, 3000), ('hearts', 'hearts', 6, 7000), ('hearts', 'hearts', 7, 15000),
  ('posts', 'writer', 1, 3), ('posts', 'writer', 2, 10), ('posts', 'writer', 3, 30), ('posts', 'writer', 4, 80), ('posts', 'writer', 5, 200), ('posts', 'writer', 6, 400), ('posts', 'writer', 7, 800),
  ('days', 'daily', 1, 7), ('days', 'daily', 2, 30), ('days', 'daily', 3, 60), ('days', 'daily', 4, 120), ('days', 'daily', 5, 200), ('days', 'daily', 6, 300), ('days', 'daily', 7, 365),
  ('streak', 'streak', 1, 7), ('streak', 'streak', 2, 14), ('streak', 'streak', 3, 30), ('streak', 'streak', 4, 60), ('streak', 'streak', 5, 100), ('streak', 'streak', 6, 200), ('streak', 'streak', 7, 365),
  ('prays', 'intercessor', 1, 30), ('prays', 'intercessor', 2, 100), ('prays', 'intercessor', 3, 300), ('prays', 'intercessor', 4, 1000), ('prays', 'intercessor', 5, 3000), ('prays', 'intercessor', 6, 7000), ('prays', 'intercessor', 7, 15000);

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

  -- 글 (스토리 빼고). is_story·video_url·music 칸이 없을 수도 있어 동적으로, 사진 칸은 text[]·jsonb 어느 쪽이든 글자로 비교
  declare
    v_story text := case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'is_story') then 'coalesce(p.is_story, false) = false' else 'true' end;
    v_story_only text := case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'is_story') then 'coalesce(p.is_story, false) = true' else 'false' end;
    v_has_video boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'video_url');
    v_has_music boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'music');
    v_img text := $x$length(regexp_replace(coalesce(p.images::text, ''), '[\[\]{}\s]', '', 'g')) > 0$x$;
  begin
    execute format('insert into badge_stats select ''hearts'', p.user_id, sum(p.like_count) from posts p where %s group by p.user_id', v_story);
    execute format('insert into badge_stats select ''prayers'', p.user_id, sum(p.pray_count) from posts p where %s group by p.user_id', v_story);
    execute format('insert into badge_stats select ''writer'', p.user_id, count(*) from posts p where %s group by p.user_id', v_story);
    execute format('insert into badge_stats select ''photo'', p.user_id, count(*) from posts p where %s and %s group by p.user_id', v_story, v_img);
    if v_has_video then
      execute format('insert into badge_stats select ''video'', p.user_id, count(*) from posts p where %s and p.video_url is not null group by p.user_id', v_story);
    end if;
    execute format('insert into badge_stats select ''story'', p.user_id, count(*) from posts p where %s group by p.user_id', v_story_only);
    execute format('insert into badge_stats select ''trophy'', p.user_id, max(p.like_count + p.pray_count) from posts p where %s group by p.user_id', v_story);
    execute format('insert into badge_stats select ''earlybird'', p.user_id, count(*) from posts p where %s and extract(hour from p.created_at at time zone %L) between 4 and 6 group by p.user_id', v_story, v_kst);
    execute format('insert into badge_stats select ''nightowl'', p.user_id, count(*) from posts p where %s and (extract(hour from p.created_at at time zone %L) >= 22 or extract(hour from p.created_at at time zone %L) < 3) group by p.user_id', v_story, v_kst, v_kst);
    if v_has_music then
      execute format('insert into badge_stats select ''dj'', p.user_id, count(*) from posts p where %s and p.music is not null and p.music <> '''' group by p.user_id', v_story);
    end if;
    -- 주일 글·긴 글·해시태그 글
    execute format('insert into badge_stats select ''sunday'', p.user_id, count(*) from posts p where %s and extract(dow from p.created_at at time zone %L) = 0 group by p.user_id', v_story, v_kst);
    execute format('insert into badge_stats select ''longform'', p.user_id, count(*) from posts p where %s and char_length(coalesce(p.content, '''')) >= 300 group by p.user_id', v_story);
    execute format('insert into badge_stats select ''hashtag'', p.user_id, count(*) from posts p where %s and p.content like ''%%#%%'' group by p.user_id', v_story);
  end;
  -- 댓글
  insert into badge_stats select 'talker', c.user_id, count(*) from comments c where c.user_id is not null group by c.user_id;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'parent_id') then
    insert into badge_stats select 'replier', c.user_id, count(*) from comments c where c.user_id is not null and c.parent_id is not null group by c.user_id;
  end if;
  -- 환영 천사: 가입 2주 안인 교우의 글에 단 댓글 (본인 글 빼고)
  insert into badge_stats select 'welcomer', c.user_id, count(*) from comments c join posts p on p.id = c.post_id join auth.users u on u.id = p.user_id
    where c.user_id is not null and c.user_id <> p.user_id and c.created_at < u.created_at + interval '14 days' group by c.user_id;
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
  if to_regclass('public.letters') is not null then
    insert into badge_stats select 'letter', l.user_id, count(*) from letters l group by l.user_id;
  end if;
  -- 리액션왕: 댓글·1:1·단체방·사랑방 감정 표시를 남긴 수 (있는 표만)
  create temp table badge_react (user_id uuid, n bigint) on commit drop;
  if to_regclass('public.comment_reactions') is not null then insert into badge_react select r.user_id, count(*) from comment_reactions r group by r.user_id; end if;
  if to_regclass('public.message_reactions') is not null then insert into badge_react select r.user_id, count(*) from message_reactions r group by r.user_id; end if;
  if to_regclass('public.group_chat_reactions') is not null then insert into badge_react select r.user_id, count(*) from group_chat_reactions r group by r.user_id; end if;
  if to_regclass('public.lounge_reactions') is not null then insert into badge_react select r.user_id, count(*) from lounge_reactions r group by r.user_id; end if;
  insert into badge_stats select 'reactor', r.user_id, sum(r.n) from badge_react r group by r.user_id;
  -- 이모티콘 애호가: 이모티콘 글('[아멘이] 안녕!' 꼴, lib/stickers)을 보낸 수 (1:1·단체방·사랑방)
  create temp table badge_stk (user_id uuid, n bigint) on commit drop;
  if to_regclass('public.messages') is not null then insert into badge_stk select m.sender_id, count(*) from messages m where m.sender_id is not null and m.content ~ '(^|\n)\[[^\]]{1,20}\] ' group by m.sender_id; end if;
  if to_regclass('public.group_chat_messages') is not null then insert into badge_stk select g.user_id, count(*) from group_chat_messages g where g.user_id is not null and g.content ~ '(^|\n)\[[^\]]{1,20}\] ' group by g.user_id; end if;
  if to_regclass('public.lounge_messages') is not null then insert into badge_stk select l.user_id, count(*) from lounge_messages l where l.content ~ '(^|\n)\[[^\]]{1,20}\] ' group by l.user_id; end if;
  insert into badge_stats select 'sticker', r.user_id, sum(r.n) from badge_stk r group by r.user_id;
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
    -- 연속 출석: 가장 길게 이어진 날 수 (날짜 - 순번 이 같으면 연속)
    insert into badge_stats select 'streak', x.user_id, max(x.n) from (
      select g.user_id, count(*) n from (
        select d.user_id, d.d - (row_number() over (partition by d.user_id order by d.d))::int grp from (
          select distinct a.user_id, (a.started_at at time zone v_kst)::date d from app_sessions a where a.user_id is not null
        ) d
      ) g group by g.user_id, g.grp
    ) x group by x.user_id;
  end if;
  -- 함께한 햇수 (가입일)
  insert into badge_stats select 'years', u.id, floor(extract(epoch from now() - u.created_at) / (365.25 * 86400))::bigint from auth.users u;
  if to_regclass('public.feedback') is not null then
    insert into badge_stats select 'idea', f.user_id, count(*) from feedback f where f.category = 'suggestion' group by f.user_id;
    insert into badge_stats select 'detective', f.user_id, count(*) from feedback f where f.category = 'bug' group by f.user_id;
  end if;

  -- 달성 도장: 기준을 넘은 교우 모두에게(관리자도), 한 번 받으면 떼지 않음 (lib/badges.ts milestone 과 같아야 함)
  create temp table badge_milestones (badge_key text, stat text, min_s bigint) on commit drop;
  -- (예전 달성 도장 글 10편·댓글 100개 등은 2026-11-14 활동 등급으로 바뀜 — 함께 1년만 남음)
  insert into badge_milestones values ('m_year1', 'years', 1);
  create temp table badge_new (user_id uuid, badge_key text) on commit drop;
  insert into badge_new
    select distinct bs.user_id, m.badge_key from badge_stats bs join badge_milestones m on m.stat = bs.badge_key where bs.user_id is not null and bs.s >= m.min_s;

  -- 활동 등급 (2026-11-14): 활동마다 닿은 가장 높은 등급 하나 't_<활동>_<1~7>' (일반·고급·희귀·영웅·전설·신화·유일, lib/badges.ts LADDERS 와 같아야 함)
  -- 관리자도 받음. 낮은 등급은 떼고(받은 기록은 badge_stamps 에 남음), 숫자가 줄어도 등급은 내려가지 않음
  create temp table badge_ladders on commit drop as select family, stat, tier, min_s from public.badge_ladder_steps;
  insert into badge_new
    select x.user_id, 't_' || x.family || '_' || x.tier from (
      select bs.user_id, l.family, max(l.tier) as tier from badge_stats bs join badge_ladders l on l.stat = bs.badge_key
      where bs.user_id is not null and bs.s >= l.min_s group by bs.user_id, l.family) x;
  -- 이미 같거나 더 높은 등급이 달려 있으면 새로 달지 않음
  delete from badge_new n where n.badge_key like 't\_%' and exists (
    select 1 from member_badges mb where mb.user_id = n.user_id and mb.badge_key like 't\_%'
      and split_part(mb.badge_key, '_', 2) = split_part(n.badge_key, '_', 2)
      and split_part(mb.badge_key, '_', 3)::int >= split_part(n.badge_key, '_', 3)::int);
  -- 더 높은 등급을 새로 받으면 낮은 등급은 뗌
  delete from member_badges mb where mb.badge_key like 't\_%' and exists (
    select 1 from badge_new n where n.user_id = mb.user_id and n.badge_key like 't\_%'
      and split_part(n.badge_key, '_', 2) = split_part(mb.badge_key, '_', 2)
      and split_part(n.badge_key, '_', 3)::int > split_part(mb.badge_key, '_', 3)::int);
  -- 예전 달성 도장은 활동 등급으로 바뀜 (받은 기록은 badge_stamps 에 그대로)
  delete from member_badges mb where mb.badge_key in ('m_posts10', 'm_posts50', 'm_comments100', 'm_hearts100', 'm_prays100', 'm_days30', 'm_days100', 'm_streak7');

  -- 관리자는 1등에서 뺌, 최소 기준 5 미만은 없음(운영자 2026-11-06: '최소 기준 5개 이상'). 뱃지마다 최댓값인 교우(동점이면 모두)
  delete from badge_stats bs where bs.s is null or bs.s < 5 or bs.user_id is null or bs.user_id in (select user_id from badge_admins);
  create temp table badge_winners (user_id uuid, badge_key text) on commit drop;
  insert into badge_winners
  select bs.user_id, bs.badge_key from badge_stats bs
  where bs.s = (select max(b2.s) from badge_stats b2 where b2.badge_key = bs.badge_key);

  -- 더는 1등이 아닌 자동 뱃지는 떼고(관리자가 직접 단 것은 그대로), 새 1등에게 달기
  delete from member_badges mb where mb.auto and not mb.permanent and not exists (select 1 from badge_winners w where w.user_id = mb.user_id and w.badge_key = mb.badge_key);
  insert into badge_new select distinct w.user_id, w.badge_key from badge_winners w;
  return query
    insert into member_badges (user_id, badge_key, auto, permanent, granted_by)
    select distinct n.user_id, n.badge_key, true, (n.badge_key like 'm\_%' or n.badge_key like 't\_%'), null::uuid from badge_new n
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
select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'badge_stamps';
