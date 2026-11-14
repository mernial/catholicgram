-- 대표 뱃지 (운영자 2026-11-14: '뱃지는 내가 고른 하나만 보이고, 나머지는 +4 처럼 숫자로, 누르면 모두 보기')
-- profiles.featured_badge = 교우가 고른 대표 뱃지 키 (member_badges.badge_key). 비어 있으면 앱이 첫 뱃지를 보여 줌.
-- 누구나 읽고(이름 옆에 보여야 하므로), 본인만 바꿈(profiles 의 기존 '본인만 고치기' 정책을 따름)
alter table public.profiles add column if not exists featured_badge text check (featured_badge is null or char_length(featured_badge) <= 40);
grant select (featured_badge) on public.profiles to anon, authenticated;
grant update (featured_badge) on public.profiles to authenticated;

-- 확인: 1 이 나오면 됨
select count(*) as featured_badge_column from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'featured_badge';
