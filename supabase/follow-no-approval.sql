-- 팔로우를 요청/수락 없이 바로 되도록 변경
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.

-- 기다리던 팔로우 요청은 모두 바로 팔로우로
update public.follows set status = 'accepted' where status = 'pending';
alter table public.follows alter column status set default 'accepted';

-- 본인 이름으로 바로 팔로우 (차단한 사람은 팔로우할 수 없음)
drop policy if exists "follows request" on public.follows;
drop policy if exists "follows insert" on public.follows;
create policy "follows insert" on public.follows for insert
with check (
  auth.uid()::text = follower_id::text
  and status = 'accepted'
  and not public.is_blocked(following_id::uuid, follower_id::uuid)
);
