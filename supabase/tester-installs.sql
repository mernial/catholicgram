-- 테스터가 Play 스토어 테스트 앱을 실제로 설치해 열었는지 (android-testers.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--  * 앱이 Play 테스트 앱(TWA)으로 열리면 mark_tester_play_opened() 를 불러 그 교우의 신청 줄에 때를 적는다
--  * 관리자 → 테스터 신청 화면에서 '📱 앱 설치 확인' 으로 보임 (정식 출시 조건: 12명 이상이 14일 동안)
--  * 교우는 '등록함' 뒤에는 자기 줄을 고칠 수 없으므로(tester update own), 이 때만 적는 함수를 따로 둔다
alter table public.tester_signups add column if not exists play_opened_at timestamptz; -- 마지막으로 Play 앱을 연 때
alter table public.tester_signups add column if not exists play_first_at timestamptz;  -- 처음 Play 앱을 연 때

create or replace function public.mark_tester_play_opened()
returns void language sql security definer set search_path = public as $$
  update public.tester_signups
     set play_opened_at = now(), play_first_at = coalesce(play_first_at, now())
   where user_id = auth.uid()
     and (play_opened_at is null or play_opened_at < now() - interval '1 hour');
$$;
revoke all on function public.mark_tester_play_opened() from public, anon;
grant execute on function public.mark_tester_play_opened() to authenticated;

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'tester_signups' and column_name = 'play_first_at')
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "테스터 앱 설치 확인";
