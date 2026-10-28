-- 전용 이모티콘 선물 (관리자 → 교우)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
--  * 관리자가 교우 프로필 카드의 '🎁 이모티콘 선물'에서 전용 이모티콘(신부님·루비로사 등)을 주고 거둔다
--  * 받은 교우는 그 이모티콘을 고르고 보낼 수 있다 (받는 사람에게는 누구나 그림으로 보임)
--  * 교우는 자기가 받은 것만 볼 수 있고, 주고 거두기는 관리자만 (is_app_admin: security-hardening.sql)
--  * 코드에 적어 둔 선물(lib/stickers.ts giftHandles, 예: 루비로사 → @rubyrosa)은 이 표 없이도 된다
create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

create table if not exists public.sticker_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null check (char_length(pack_id) between 1 and 40),
  granted_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, pack_id)
);
create index if not exists sticker_grants_user_idx on public.sticker_grants (user_id);

alter table public.sticker_grants enable row level security;

drop policy if exists "sticker_grants_select" on public.sticker_grants;
create policy "sticker_grants_select" on public.sticker_grants
  for select using (auth.uid() = user_id or public.is_app_admin());

drop policy if exists "sticker_grants_insert" on public.sticker_grants;
create policy "sticker_grants_insert" on public.sticker_grants
  for insert with check (public.is_app_admin());

drop policy if exists "sticker_grants_delete" on public.sticker_grants;
create policy "sticker_grants_delete" on public.sticker_grants
  for delete using (public.is_app_admin());
