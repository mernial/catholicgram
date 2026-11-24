-- 음력 생일 (루비로사 건의 2026-11-24) — 프로필 수정의 생일에서 '음력'을 고른 교우
--  * birthday_lunar: 적은 음력 날짜 'MM-DD'. birthday: 다가오는 양력 날짜 (매일 아침 8시 cron 이 해마다 다시 맞춤)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
alter table public.profiles add column if not exists birthday_lunar text;
grant select (birthday_lunar) on public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_birthday_lunar_format;
alter table public.profiles add constraint profiles_birthday_lunar_format
  check (birthday_lunar is null or birthday_lunar ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|30)$');

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'birthday_lunar')
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "음력 생일";
