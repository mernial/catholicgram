-- 사연 답장: 관리자가 사연함에서 보낸 분께 답장을 쓴다 (supabase/letters.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--  * 보낸 분은 '사연 보내기 → 보낸 사연'에서 답장을 보고, 휴대폰 알림('💌 운영자가 사연에 답장했어요')을 받는다
--  * 쓰기 권한은 letters.sql 의 "letters update"(관리자만) 그대로, 읽기는 "letters select"(본인·관리자) 그대로
alter table public.letters add column if not exists reply text check (reply is null or char_length(reply) <= 3000);
alter table public.letters add column if not exists replied_at timestamptz;

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'letters' and column_name = 'reply')
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "사연 답장";
