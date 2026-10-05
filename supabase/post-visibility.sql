-- 게시글 공개 범위: public(전체 공개) / followers(팔로워만) / private(나만 보기)
alter table public.posts add column if not exists visibility text not null default 'public';
alter table public.posts drop constraint if exists posts_visibility_check;
alter table public.posts add constraint posts_visibility_check check (visibility in ('public', 'followers', 'private'));

-- 이 글을 볼 수 있는지 (본인, 관리자, 전체 공개, 팔로워 공개면 나를 팔로우 중인 사람)
create or replace function public.can_see_post(owner uuid, vis text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    coalesce(vis, 'public') = 'public'
    or owner = auth.uid()
    or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr'
    or (vis = 'followers' and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = owner and f.status = 'accepted'
    ));
$$;

-- 기존 읽기 정책은 그대로 두고, 공개 범위 조건을 '추가로' 반드시 만족하도록 (restrictive)
drop policy if exists "posts visibility" on public.posts;
create policy "posts visibility" on public.posts as restrictive for select to anon, authenticated
using (public.can_see_post(user_id, visibility));
