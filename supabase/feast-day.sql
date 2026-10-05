-- 축일 (주보성인 축일) + 축일 알림 중복 발송 방지
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.

-- 프로필에 축일 저장 ('MM-DD' 형식, 예: 09-29)
alter table public.profiles add column if not exists feast_day text;

alter table public.profiles drop constraint if exists profiles_feast_day_format;
alter table public.profiles add constraint profiles_feast_day_format
  check (feast_day is null or feast_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

create index if not exists profiles_feast_day_idx on public.profiles (feast_day);

-- 하루에 한 번만 축일 푸시를 보내기 위한 기록 (서버만 사용)
create table if not exists public.feast_day_sends (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sent_on date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, sent_on)
);

alter table public.feast_day_sends enable row level security;
-- 정책을 만들지 않으므로 일반 사용자는 읽기/쓰기 불가 (서버의 service role 만 사용)
