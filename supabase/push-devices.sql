-- 같은 휴대폰에서 알림이 두 번 오지 않게 (lib/push-devices.ts)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
--  * 한 휴대폰에 가톨릭그램이 둘(크롬 앱 + 삼성 인터넷으로 열리는 앱 등) 있으면 알림 구독이 둘이라 알림이 두 번 왔다
--  * 구독마다 기기 이름(device)과 마지막으로 앱을 연 때(last_seen)를 적고, 같은 기기에는 가장 최근에 연 앱 하나에만 보낸다
--  * 실행 뒤 각 앱을 한 번씩 열면 기기 이름이 채워진다 (그 전 구독은 예전처럼 모두 받음)
alter table public.push_subscriptions add column if not exists device text;
alter table public.push_subscriptions add column if not exists last_seen timestamptz not null default now();
