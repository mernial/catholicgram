-- 1:1 메시지(DM) 권한 설정
-- 대화 당사자(보낸 사람/받는 사람)만 메시지를 볼 수 있고, 본인 이름으로만 보낼 수 있다.
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.

alter table public.messages enable row level security;

drop policy if exists "dm read own conversations" on public.messages;
create policy "dm read own conversations"
on public.messages for select
using (auth.uid()::text in (sender_id::text, receiver_id::text));

drop policy if exists "dm send as self" on public.messages;
create policy "dm send as self"
on public.messages for insert
with check (auth.uid()::text = sender_id::text);
