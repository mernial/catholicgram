-- 기도지향 "함께 기도합니다": 누가 이 기도지향을 위해 함께 기도했는지 (한 사람당 한 번)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)

create table if not exists public.intention_prayers (
  intention_id uuid not null references public.prayer_intentions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (intention_id, user_id)
);

alter table public.intention_prayers enable row level security;

drop policy if exists "intention prayers read" on public.intention_prayers;
create policy "intention prayers read" on public.intention_prayers for select using (true);

drop policy if exists "intention prayers insert own" on public.intention_prayers;
create policy "intention prayers insert own" on public.intention_prayers for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "intention prayers delete own" on public.intention_prayers;
create policy "intention prayers delete own" on public.intention_prayers for delete to authenticated
using (user_id = auth.uid());
