-- 메시지 삭제: 보낸 사람이 지우면 대화에는 '삭제된 메시지예요'로만 보이고,
-- 원래 글·사진은 관리자만 볼 수 있는 deleted_messages 에 옮겨 둔다 (서버가 처리).
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
alter table public.messages add column if not exists deleted_at timestamptz;

create table if not exists public.deleted_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  sender_id uuid,
  receiver_id uuid,
  content text,
  image_url text,
  sent_at timestamptz,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_messages_deleted_idx on public.deleted_messages (deleted_at desc);

-- 정책을 두지 않음 = 앱 회원은 아무도 못 읽음. 관리자 화면은 서버(관리자 확인 후)로만 읽음
alter table public.deleted_messages enable row level security;
