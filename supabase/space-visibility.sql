-- 공간 공개 범위 (운영자 2026-11-15): 내 공간의 게시물 목록을 누가 볼 수 있는지 — public(모든 교우) / followers(팔로워만) / private(나만)
-- 글 하나하나의 공개 범위는 supabase/post-visibility.sql(posts.visibility)
alter table public.profiles add column if not exists space_visibility text not null default 'public';
alter table public.profiles drop constraint if exists profiles_space_visibility_check;
alter table public.profiles add constraint profiles_space_visibility_check check (space_visibility in ('public', 'followers', 'private'));
-- 확인: 아래가 1 이면 됨
select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'space_visibility';
