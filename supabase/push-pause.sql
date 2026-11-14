-- 휴대폰 알림 '잠시 끄기·끄기' (운영자 2026-11-14: 휴대폰 알림은 켜 두고 앱 안에서 끄도록)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
--  * 예전엔 알림창 '휴대폰 알림'을 끄면 이 휴대폰의 알림 받기(구독)를 지웠다 → 다시 켜려면 허용을 또 받아야 했고, 휴대폰이 허용을 풀면 켤 수 없었다
--  * 이제 구독은 그대로 두고 '언제까지 끔'만 적는다. 그때까지 서버가 이 기기에 알림을 보내지 않는다 (lib/push-devices onePerDevice)
alter table public.push_subscriptions add column if not exists paused_until timestamptz;

select count(*) as "paused_until 칸 (1이면 끝)" from information_schema.columns
where table_schema = 'public' and table_name = 'push_subscriptions' and column_name = 'paused_until';
