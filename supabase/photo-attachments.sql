-- 메시지·건의함 사진 첨부
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
alter table public.messages add column if not exists image_url text;
alter table public.feedback add column if not exists image_url text;
