-- 사연 글자 수 5,000자 → 10,000자 (운영자 2026-11-16). 여러 번 실행해도 됨
alter table public.letters drop constraint if exists letters_content_check;
alter table public.letters add constraint letters_content_check check (char_length(content) between 1 and 10000);
