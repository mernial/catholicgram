-- 휴대폰 푸시 알림 구독 정보를 저장하는 테이블
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- 각자 자기 기기의 구독만 보고/추가/수정/삭제할 수 있다
-- (알림 발송은 서버가 service_role 키로 처리)
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions"
on public.push_subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
