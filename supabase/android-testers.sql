-- 안드로이드 앱 테스터 신청 (구글 플레이 비공개 테스트) — 한 번만 실행, 여러 번 실행해도 안전
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- 회원이 동의하고 직접 적어 낸 구글 계정 이메일만 모은다. 관리자가 Play Console 테스터 목록에 붙여넣는다.
create table if not exists public.tester_signups (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  google_email text not null check (char_length(google_email) <= 254 and google_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status text not null default 'requested' check (status in ('requested', 'added')), -- 신청함 / 관리자가 구글에 등록함
  consent_at timestamptz not null default now(), -- 구글 테스터 목록 등록에 동의한 때
  created_at timestamptz not null default now()
);
alter table public.tester_signups enable row level security;
revoke all on public.tester_signups from anon;

-- 보기: 내 신청, 관리자는 전부
drop policy if exists "tester select" on public.tester_signups;
create policy "tester select" on public.tester_signups for select to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 신청: 본인 이름으로만, 처음엔 '신청함' 상태로만
drop policy if exists "tester insert" on public.tester_signups;
create policy "tester insert" on public.tester_signups for insert to authenticated
with check (user_id = auth.uid() and status = 'requested');

-- 고치기: 본인은 이메일만 다시 적을 수 있고(다시 '신청함'으로), '등록함' 표시는 관리자만
drop policy if exists "tester update own" on public.tester_signups;
create policy "tester update own" on public.tester_signups for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'requested');
drop policy if exists "tester update admin" on public.tester_signups;
create policy "tester update admin" on public.tester_signups for update to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr') with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 취소: 본인, 관리자는 전부
drop policy if exists "tester delete" on public.tester_signups;
create policy "tester delete" on public.tester_signups for delete to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from pg_class where relname = 'tester_signups' and relrowsecurity)
       then '✅ 준비됨 (본인과 관리자만 볼 수 있음)' else '❌ 다시 실행해 주세요' end as "테스터 신청";
