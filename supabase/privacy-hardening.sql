-- 개인정보 보호 2차 보강 (security-hardening.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, 없는 표·칸은 건너뜀)
--
--  1) 비공개·팔로워 공개 글의 댓글은 그 글을 볼 수 있는 사람만 읽고 쓸 수 있다.
--  2) 누가 어느 글에 기도·공감했는지는 본인 것만 읽는다 (숫자는 글의 숫자 칸으로 보여 줌).
--  3) 본인·관리자만 봐야 하는 표(차단·사연·건의·신고·알림 기기·검색 기록·실명·익명글 작성자 등)에
--     '제한' 읽기 정책을 하나 더 건다 — 대시보드에서 예전에 너그러운 정책을 만들어 두었어도 남의 것은 읽을 수 없다.
--  4) 사진 저장소(수파베이스 Storage)의 파일 목록은 올린 본인·관리자만 (예전 메시지 사진 목록을 훑지 못하게).
--  5) 로그인하지 않은 사람은 교우의 축일을 볼 수 없다.
--  6) 새 글의 기도·공감 숫자는 0 에서 시작 (부풀린 숫자로 올리지 못하게).
--  마지막에 확인 표가 나온다. 모두 ✅ 면 정상.

create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

------------------------------------------------------------
-- 1) 댓글은 그 글을 볼 수 있을 때만 (글의 공개 범위·지난 스토리 규칙을 그대로 따름)
------------------------------------------------------------
drop policy if exists "comments follow post visibility (restrictive)" on public.comments;
create policy "comments follow post visibility (restrictive)" on public.comments as restrictive for select to anon, authenticated
using (exists (select 1 from public.posts p where p.id = comments.post_id));
drop policy if exists "comments only on visible posts (restrictive)" on public.comments;
create policy "comments only on visible posts (restrictive)" on public.comments as restrictive for insert to anon, authenticated
with check (exists (select 1 from public.posts p where p.id = comments.post_id));

------------------------------------------------------------
-- 2) 기도·공감: 본인 것만 읽기, 볼 수 있는 글에만 누르기
------------------------------------------------------------
do $$
begin
  if to_regclass('public.post_reactions') is not null then
    execute 'drop policy if exists "reactions visible post (restrictive)" on public.post_reactions';
    execute 'create policy "reactions visible post (restrictive)" on public.post_reactions as restrictive for insert to anon, authenticated
             with check (exists (select 1 from public.posts p where p.id = post_reactions.post_id))';
  end if;
end $$;

------------------------------------------------------------
-- 3) 본인·관리자만 읽는 표 (표가 없으면 건너뜀)
------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values
    ('post_reactions',     'user_id = auth.uid()'),
    ('blocks',             'blocker_id = auth.uid()'),
    ('letters',            'user_id = auth.uid() or public.is_app_admin()'),
    ('feedback',           'user_id = auth.uid() or public.is_app_admin()'),
    ('reports',            'reporter_id = auth.uid() or public.is_app_admin()'),
    ('push_subscriptions', 'user_id = auth.uid()'),
    ('interest_events',    'user_id = auth.uid()'),
    ('profile_private',    'id = auth.uid() or public.is_app_admin()'),
    ('lounge_bans',        'user_id = auth.uid() or public.is_app_admin()'),
    ('anon_posts',         'user_id = auth.uid() or public.is_app_admin()'),
    ('anon_replies',       'user_id = auth.uid() or public.is_app_admin()'),
    ('anon_reactions',     'user_id = auth.uid()'),
    ('lounge_trash',       'public.is_app_admin()'),
    ('deleted_messages',   'public.is_app_admin()'),
    ('app_sessions',       'public.is_app_admin()'),
    ('feast_day_sends',    'public.is_app_admin()')
  ) as t(tbl, cond)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('alter table public.%I enable row level security', r.tbl);
      execute format('drop policy if exists "privacy read (restrictive)" on public.%I', r.tbl);
      execute format('create policy "privacy read (restrictive)" on public.%I as restrictive for select to anon, authenticated using (%s)', r.tbl, r.cond);
    end if;
  end loop;
end $$;

------------------------------------------------------------
-- 4) 사진 저장소 파일 목록: 올린 본인·관리자만 (사진 주소로 보는 것은 그대로 됨)
------------------------------------------------------------
do $$
declare
  owner_cond text;
begin
  if to_regclass('storage.objects') is null then return; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
    owner_cond := 'owner_id = auth.uid()::text';
  else
    owner_cond := 'owner = auth.uid()';
  end if;
  execute 'drop policy if exists "app files list own (restrictive)" on storage.objects';
  execute format('create policy "app files list own (restrictive)" on storage.objects as restrictive for select to anon, authenticated using (%s or public.is_app_admin())', owner_cond);
end $$;

------------------------------------------------------------
-- 5) 축일은 로그인한 교우만 (로그인 안 한 사람은 이름·사진·아이디·소개만)
------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'feast_day') then
    revoke select (feast_day) on public.profiles from anon;
  end if;
end $$;

------------------------------------------------------------
-- 6) 새 글의 숫자는 0 에서 시작
------------------------------------------------------------
create or replace function public.posts_reset_counts()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new := jsonb_populate_record(new, jsonb_build_object('pray_count', 0, 'like_count', 0));
  end if;
  return new;
end $$;
drop trigger if exists posts_reset_counts on public.posts;
create trigger posts_reset_counts before insert on public.posts
for each row execute function public.posts_reset_counts();

------------------------------------------------------------
-- 확인: 모두 ✅ 면 정상
--  (마지막 줄 'RLS 가 꺼진 표'에 이름이 나오면, 그 표는 앱 밖에서 누구나 읽을 수 있다는 뜻 — 화면을 찍어 보내 주세요)
------------------------------------------------------------
select 항목, case when 정상 then '✅' else '❌' end as 확인
from (
  select 1 as 번호, '비공개 글의 댓글은 볼 수 있는 사람만' as 항목,
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments follow post visibility (restrictive)') as 정상
  union all
  select 2, '누가 기도·공감했는지는 본인 것만',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_reactions' and policyname = 'privacy read (restrictive)')
  union all
  select 3, '본인·관리자만 보는 표 잠금 (' || count(*) filter (where p.policyname is not null) || '/' || count(*) || ')',
    count(*) = count(*) filter (where p.policyname is not null)
  from (values ('blocks'), ('letters'), ('feedback'), ('reports'), ('push_subscriptions'), ('interest_events'), ('profile_private'),
               ('lounge_bans'), ('anon_posts'), ('anon_replies'), ('anon_reactions'), ('lounge_trash'), ('deleted_messages'),
               ('app_sessions'), ('feast_day_sends')) as t(tbl)
  left join pg_policies p on p.schemaname = 'public' and p.tablename = t.tbl and p.policyname = 'privacy read (restrictive)'
  where to_regclass('public.' || t.tbl) is not null
  union all
  select 4, '사진 저장소 파일 목록은 본인·관리자만',
    to_regclass('storage.objects') is null
    or exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'app files list own (restrictive)')
  union all
  select 5, '로그인 안 한 사람은 축일을 못 봄',
    not has_column_privilege('anon', 'public.profiles', 'feast_day', 'select')
  union all
  select 6, '새 글 숫자는 0 에서 시작',
    exists (select 1 from pg_trigger where tgname = 'posts_reset_counts' and not tgisinternal)
  union all
  select 7, 'RLS 가 꺼진 표: ' || coalesce(string_agg(c.relname, ', ' order by c.relname), '없음'),
    count(*) = 0
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
) s
order by 번호;
