-- 게시글 표 잠금(RLS) 켜기 (꼭 실행, privacy-hardening.sql 다음)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- posts 표의 RLS 가 꺼져 있으면 글에 걸어 둔 규칙(나만 보기·팔로워 공개, 지난 스토리, 본인만 쓰기·지우기)이
-- 하나도 적용되지 않는다. 앱이 그대로 동작하도록 기본 허용 규칙을 먼저 만들고 잠금을 켠다.
--   * 읽기: 누구나 — 단, 이미 걸어 둔 '제한' 규칙(공개 범위·24시간 지난 스토리)을 함께 지켜야 함
--   * 쓰기: 로그인한 본인 이름으로만
--   * 지우기: 본인·관리자만 (앱의 글 지우기·고치기는 서버가 본인 확인 후 처리)
--   * 고치기: 앱에서 직접은 불가 (security-hardening.sql 에서 막음)

create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

-- 1) 기본 허용 규칙 (기존 규칙이 무엇이든 앱이 계속 동작하도록)
drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select to anon, authenticated using (true);
drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "posts delete own or admin" on public.posts;
create policy "posts delete own or admin" on public.posts for delete to authenticated using (user_id = auth.uid() or public.is_app_admin());

-- 2) 로그인 안 한 사람은 글을 쓰거나 지울 수 없음, 앱에서 직접 고치기 금지
revoke insert, update, delete on public.posts from anon;
revoke update on public.posts from authenticated;

-- 3) 잠금 켜기
alter table public.posts enable row level security;

-- 확인: 모두 ✅ 면 정상
select 항목, case when 정상 then '✅' else '❌' end as 확인
from (
  select 1 as 번호, '게시글 표 잠금(RLS) 켜짐' as 항목,
    (select relrowsecurity from pg_class where oid = 'public.posts'::regclass) as 정상
  union all
  select 2, '나만 보기·팔로워 공개 규칙 있음',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts visibility')
  union all
  select 3, '로그인 안 한 사람은 글 지우기 불가',
    not has_table_privilege('anon', 'public.posts', 'delete')
  union all
  select 4, 'RLS 가 꺼진 표: ' || coalesce(string_agg(c.relname, ', ' order by c.relname), '없음'),
    count(*) = 0
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
) s
order by 번호;
