-- 스토리를 게시글처럼: 기도·공감·댓글·알림을 다른 게시글과 똑같이 쓰도록
-- 스토리는 posts 에 is_story = true 로 저장하고, 24시간이 지나면 화면에서 사라집니다.
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
alter table public.posts add column if not exists is_story boolean not null default false;
create index if not exists posts_story_idx on public.posts (is_story, created_at desc);
