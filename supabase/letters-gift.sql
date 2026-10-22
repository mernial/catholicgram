-- 사연 선물: 관리자가 좋은 사연을 '선물 대상'으로 뽑는다 (supabase/letters.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
alter table public.letters add column if not exists gift boolean not null default false;
-- 바꾸기 권한은 letters.sql 의 "letters update"(관리자만) 그대로
