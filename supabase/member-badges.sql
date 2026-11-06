-- 교우 뱃지 (관리자가 일반 신자에게 달아 주는 뱃지 — 봉사의 손·성가대·교리교사·… lib/badges.ts)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
--  * 관리자가 교우 공간의 '뱃지 달기'에서 달고 뗀다 (is_app_admin: sticker-gifts.sql / security-hardening.sql)
--  * 누구나(로그인한 교우) 모든 교우의 뱃지를 볼 수 있다 (공간·프로필 카드에 보임)
--  * 한 교우가 같은 뱃지를 두 번 받지 않는다 (unique)
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

-- 확인: 아래가 1 이면 됨
select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'member_badges';
