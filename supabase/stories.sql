-- 스토리: 24시간 뒤 사라지는 사진 + 한마디
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  caption text check (caption is null or char_length(caption) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists stories_created_idx on public.stories (created_at desc);

alter table public.stories enable row level security;

-- 24시간 안의 스토리만 보임
drop policy if exists "stories read recent" on public.stories;
create policy "stories read recent" on public.stories for select
using (created_at > now() - interval '24 hours');

-- 내 스토리만 올리기
drop policy if exists "stories insert own" on public.stories;
create policy "stories insert own" on public.stories for insert to authenticated
with check (auth.uid() = user_id);

-- 내 스토리 지우기 (관리자는 모두)
drop policy if exists "stories delete own or admin" on public.stories;
create policy "stories delete own or admin" on public.stories for delete to authenticated
using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
