-- 전체 공지
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  content text not null check (char_length(content) between 1 and 2000),
  pinned boolean not null default true,   -- 홈 맨 위에 보이기
  pushed_at timestamptz,                  -- 휴대폰 알림을 보낸 시각
  created_at timestamptz not null default now()
);
create index if not exists announcements_created_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "announcements read" on public.announcements;
create policy "announcements read" on public.announcements for select using (true);

drop policy if exists "announcements admin write" on public.announcements;
create policy "announcements admin write" on public.announcements for all to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
