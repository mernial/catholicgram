-- 조용히 보내기 (운영자 요청 2026-11-01): 1:1 메시지에 '조용히 보냄' 표시
-- 보내기 단추를 꾹 눌러 '🔕 조용히 보내기'로 보낸 메시지는 휴대폰 알림을 보내지 않고(앱이 알림을 부르지 않음),
-- 받는 교우가 앱을 보고 있어도 화면 위 배너·소리를 띄우지 않는다(이 표시로 앎). 안 읽은 숫자는 그대로. 여러 번 실행해도 괜찮음.
-- (단체방은 표시 없이 알림만 보내지 않음 — 단체방 배너는 휴대폰 알림으로만 뜸)

alter table public.messages add column if not exists silent boolean not null default false;

-- 확인: ✅ 면 준비됨
select '조용히 보내기' as 항목,
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'silent')
  then '✅' else '❌' end as 확인;
