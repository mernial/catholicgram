-- 메시지 하트: 대화 속 메시지를 두 번 누르면 그 메시지 밑에 하트 (대화하는 두 사람만)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)

-- messages.id 와 같은 형식으로 만든다 (uuid 든 숫자든)
do $$
declare id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a where a.attrelid = 'public.messages'::regclass and a.attname = 'id';
  execute format(
    'create table if not exists public.message_reactions (
       message_id %s not null references public.messages(id) on delete cascade,
       user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
       created_at timestamptz not null default now(),
       primary key (message_id, user_id)
     )', id_type);
end $$;

alter table public.message_reactions enable row level security;

-- 그 메시지의 보낸 사람·받는 사람만 보고, 누르고, 취소
drop policy if exists "message hearts read" on public.message_reactions;
create policy "message hearts read" on public.message_reactions for select to authenticated
using (exists (select 1 from public.messages m where m.id = message_id and auth.uid()::text in (m.sender_id::text, m.receiver_id::text)));

drop policy if exists "message hearts add" on public.message_reactions;
create policy "message hearts add" on public.message_reactions for insert to authenticated
with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and auth.uid()::text in (m.sender_id::text, m.receiver_id::text)));

drop policy if exists "message hearts remove" on public.message_reactions;
create policy "message hearts remove" on public.message_reactions for delete to authenticated
using (user_id = auth.uid());
