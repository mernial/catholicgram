-- 전체 공지 팝업: 앱에 들어오면 팝업으로 띄울 공지 표시
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
alter table public.announcements add column if not exists popup boolean not null default false;
