-- 1:1 메시지: 메시지 요청(수락·거절) · 대화방 나가기
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
--  * 처음 메시지를 보낸 교우의 대화는 '메시지 요청'으로 보인다. 수락하기 전에는 읽음 표시를 하지 않아
--    상대방은 내가 읽었는지 알 수 없다. (앱이 처리, 여기에는 내가 수락한 때만 남긴다)
--  * 대화방 나가기: 나간 때보다 앞의 대화는 내 화면에서 보이지 않는다 (상대방 화면에는 그대로)
--  * 이 표는 각자 자기 줄만 읽고 쓴다 (상대방은 내가 수락했는지·나갔는지 볼 수 없음)
create table if not exists public.dm_threads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, partner_id)
);
alter table public.dm_threads enable row level security;
revoke all on public.dm_threads from anon;
grant select, insert, update, delete on public.dm_threads to authenticated;
drop policy if exists "dm threads own" on public.dm_threads;
create policy "dm threads own" on public.dm_threads for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

select case when exists (select 1 from information_schema.tables where table_name = 'dm_threads')
       then '✅ 준비됨 (메시지 요청·대화방 나가기)' else '❌ 다시 실행해 주세요' end as "메시지 요청";
