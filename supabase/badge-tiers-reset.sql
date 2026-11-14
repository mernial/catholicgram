-- 활동 등급 다시 매기기 (단계 숫자를 바꾼 뒤 한 번만 — 2026-11-14 구간 넓힘)
-- member-badges.sql 을 먼저 실행한 다음 이것을 실행하세요.
-- 지금 달린 등급 뱃지와 그 기록(오늘 처음 생긴 것)을 지우고, 새 숫자로 조용히 다시 계산합니다 (여기서 계산하므로 휴대폰 알림은 가지 않음)
delete from public.badge_stamps where badge_key like 't\_%';
delete from public.member_badges where badge_key like 't\_%';
select count(*) as 다시_매긴_뱃지 from public.refresh_auto_badges();
