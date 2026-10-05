-- 접속 통계: 앱을 열 때마다 한 줄(접속 1회), 사용하는 동안 1분마다 '아직 있음' 표시
-- 화면에서 직접 읽고 쓰지 않고 서버(/api/visit, /api/admin/stats)만 사용한다.
create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null, -- 로그인 안 한 방문자는 비어 있음
  device_id text,                                            -- 같은 기기 구분용 (임의 번호)
  standalone boolean not null default false,                 -- 홈 화면 앱으로 열었는지
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists app_sessions_started_idx on public.app_sessions (started_at desc);
create index if not exists app_sessions_seen_idx on public.app_sessions (last_seen_at desc);

alter table public.app_sessions enable row level security;
-- 정책 없음: 일반 사용자는 읽기·쓰기 불가 (서버의 service role 만 사용)
