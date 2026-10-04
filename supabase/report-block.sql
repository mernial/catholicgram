-- 신고 / 차단 (구글 플레이·앱스토어 사용자 콘텐츠 정책 필수)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

------------------------------------------------------------
-- 신고
------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'anon_post', 'anon_reply', 'user', 'message')),
  target_id text not null,
  target_user_id uuid,          -- 신고 대상 작성자 (익명글은 비워 둠)
  target_preview text,          -- 관리자가 볼 수 있도록 신고 시점의 내용 일부
  reason text not null check (reason in ('spam', 'abuse', 'sexual', 'hate', 'privacy', 'other')),
  detail text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists reports_created_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "reports admin read" on public.reports;
create policy "reports admin read" on public.reports for select to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "reports admin update" on public.reports;
create policy "reports admin update" on public.reports for update to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "reports admin delete" on public.reports;
create policy "reports admin delete" on public.reports for delete to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

------------------------------------------------------------
-- 차단
------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "blocks own" on public.blocks;
create policy "blocks own" on public.blocks for all to authenticated
using (blocker_id = auth.uid())
with check (blocker_id = auth.uid());

-- a 가 b 를 차단했는지 (다른 사람의 차단 목록은 읽을 수 없으므로 서버 함수로 확인)
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where blocker_id = a and blocked_id = b);
$$;

-- 차단한 사람에게서는 메시지가 오지 않음
drop policy if exists "dm send as self" on public.messages;
create policy "dm send as self" on public.messages for insert
with check (
  auth.uid()::text = sender_id::text
  and not public.is_blocked(receiver_id::uuid, sender_id::uuid)
);

-- 차단한 사람에게서는 팔로우 요청이 오지 않음
drop policy if exists "follows request" on public.follows;
create policy "follows request" on public.follows for insert
with check (
  auth.uid()::text = follower_id::text
  and status = 'pending'
  and not public.is_blocked(following_id::uuid, follower_id::uuid)
);
