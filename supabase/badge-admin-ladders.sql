-- 관리자도 활동 등급(달성 기록)은 받게 (운영자 2026-11-16) — 1등 순위에서는 그대로 빠짐 (교우들의 1등에 영향 없음)
-- 지금 데이터베이스에 있는 refresh_auto_badges() 의 '관리자 빼기' 세 군데만 고쳐서 다시 만든다. 여러 번 실행해도 됨
do $$
declare d text;
begin
  d := pg_get_functiondef('public.refresh_auto_badges()'::regprocedure);
  d := replace(d, ' and bs.user_id not in (select user_id from badge_admins); -- 관리자는 모든 등급에서 뺌 (운영자 2026-11-14)', '; -- 관리자도 달성 기록은 받음');
  d := replace(d, 'bs.s >= l.min_s and bs.user_id not in (select user_id from badge_admins) group by', 'bs.s >= l.min_s group by');
  d := replace(d, $r$delete from member_badges mb where (mb.badge_key like 't\_%' or mb.badge_key like 'm\_%') and mb.user_id in (select user_id from badge_admins);$r$, '-- 관리자 등급 뱃지 떼지 않음');
  execute d;
end $$;
-- 관리자의 등급을 지금 바로 계산 (여기서 하면 휴대폰 알림은 가지 않음)
select count(*) as 새로_달린_뱃지 from public.refresh_auto_badges();
-- 확인: 관리자 계정에 달린 등급 뱃지
select mb.badge_key from public.member_badges mb join auth.users u on u.id = mb.user_id where u.email = 'yunho-jo@casuwon.or.kr' and mb.badge_key like 't\_%' order by 1;
