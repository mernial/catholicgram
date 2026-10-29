-- 생일 (월·일만, 연도는 받지 않음) — 생일 당일 프로필 사진 위에 '오늘 생일이에요' 리본
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--  * 가입할 때·프로필 수정에서 적는다 (선택). 비어 있으면 로그인 정보(네이버 생일)가 있으면 그것으로 채운다
--  * 축일(feast_day)처럼 'MM-DD' 형식. 본인만 고칠 수 있는 것은 profiles 의 기존 정책 그대로
alter table public.profiles add column if not exists birthday text;

-- 앱이 생일 칸을 읽을 수 있게 (profiles-email-private.sql 로 앱은 허락된 칸만 읽음 — 이게 없으면 생일을 저장할 때
-- '저장하지 못했어요'가 뜨고 생일 리본·앱 안 생일 알림이 안 보임). 로그인한 교우만
grant select (birthday) on public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_birthday_format;
alter table public.profiles add constraint profiles_birthday_format
  check (birthday is null or birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'birthday')
             and has_column_privilege('authenticated', 'public.profiles', 'birthday', 'select')
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "생일";
