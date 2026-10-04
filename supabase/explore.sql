-- 탐색 탭: 검색 기록 / 누른 해시태그 (맞춤 추천에 사용)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
-- (실행 전에도 탐색 탭은 동작하며, 기록은 각 기기에만 저장됩니다)

create table if not exists public.interest_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('search', 'tag')),
  value text not null check (char_length(value) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists interest_events_user_idx on public.interest_events (user_id, created_at desc);

alter table public.interest_events enable row level security;

-- 본인 기록만 보고/추가/삭제
drop policy if exists "own interest events" on public.interest_events;
create policy "own interest events" on public.interest_events for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
