-- 오늘의 기도지향: 올린 사람은 관리자만 알 수 있게 (prayer-intentions.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--  * 교우들은 아래 보기(prayer_intentions_feed)로 읽는다: 올린 사람(user_id·이름) 없이, 내 것인지(is_mine)와
--    내가 차단한 교우의 것인지(blocked)만
--  * 테이블을 직접 읽는 것은 본인 글과 관리자만 (관리자 화면에서 올린 사람을 본다)

create or replace view public.prayer_intentions_feed as
select
  i.id,
  i.title,
  i.content,
  i.prayer_date,
  i.created_at,
  coalesce(i.user_id = auth.uid(), false) as is_mine,
  exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = i.user_id) as blocked
from public.prayer_intentions i;

revoke all on public.prayer_intentions_feed from public;
grant select on public.prayer_intentions_feed to anon, authenticated;

drop policy if exists "intentions read" on public.prayer_intentions;
create policy "intentions read" on public.prayer_intentions for select
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
