-- 오늘의 기도지향 (하루 한 번, 한국 시간 자정에 새로 시작)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

create table if not exists public.prayer_intentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  content text not null check (char_length(content) between 1 and 100),
  prayer_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now(),
  unique (user_id, prayer_date)
);
create index if not exists prayer_intentions_date_idx on public.prayer_intentions (prayer_date, created_at);

alter table public.prayer_intentions enable row level security;

drop policy if exists "intentions read" on public.prayer_intentions;
create policy "intentions read" on public.prayer_intentions for select using (true);

drop policy if exists "intentions insert own" on public.prayer_intentions;
create policy "intentions insert own" on public.prayer_intentions for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "intentions update own" on public.prayer_intentions;
create policy "intentions update own" on public.prayer_intentions for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "intentions delete own or admin" on public.prayer_intentions;
create policy "intentions delete own or admin" on public.prayer_intentions for delete to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 기도지향(짧은 제목, 30자) — 홈 맨 위에 흐르는 글. content 는 기도 내용(100자)
alter table public.prayer_intentions add column if not exists title text;
alter table public.prayer_intentions drop constraint if exists prayer_intentions_title_len;
alter table public.prayer_intentions add constraint prayer_intentions_title_len
  check (title is null or char_length(title) between 1 and 30);
