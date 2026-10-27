-- 1:1 메시지: 답장 · 여러 감정 표시 · 내 메시지 고치기
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- supabase/message-hearts.sql(메시지 하트)을 먼저 실행해 두어야 합니다.
--
--  * 답장: 대화 속 특정 메시지를 골라 답장한다. 같은 대화의 메시지만 가리킬 수 있다.
--  * 감정 표시: 메시지를 꾹 누르면 ❤️ 👍 😊 😂 😮 😢 🙏 중 하나 (한 사람이 한 메시지에 하나, 두 번 누르면 하트)
--  * 고치기: 보낸 사람이 24시간 안에만. 원래 내용은 관리자만 보는 message_edits 에 남긴다 (신고 처리용).

------------------------------------------------------------
-- 답장
------------------------------------------------------------
do $$
declare id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a where a.attrelid = 'public.messages'::regclass and a.attname = 'id';
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'messages' and column_name = 'reply_to') then
    execute format('alter table public.messages add column reply_to %s references public.messages(id) on delete set null', id_type);
  end if;
end $$;

-- 다른 대화의 메시지를 가리키면 답장 표시를 뗀다
create or replace function public.messages_reply_same_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from messages m where m.id = new.reply_to
      and ((m.sender_id::text = new.sender_id::text and m.receiver_id::text = new.receiver_id::text)
        or (m.sender_id::text = new.receiver_id::text and m.receiver_id::text = new.sender_id::text))
  ) then
    new.reply_to := null;
  end if;
  return new;
end $$;
drop trigger if exists messages_reply_same_chat on public.messages;
create trigger messages_reply_same_chat before insert on public.messages
for each row execute function public.messages_reply_same_chat();

------------------------------------------------------------
-- 감정 표시 (메시지 하트를 넓힌다)
------------------------------------------------------------
alter table public.message_reactions add column if not exists emoji text not null default '❤️';
alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions add constraint message_reactions_emoji_check
  check (emoji in ('❤️', '👍', '😊', '😂', '😮', '😢', '🙏'));

-- 내 감정 표시 바꾸기 (하트 → 웃음 등)
drop policy if exists "message reactions change" on public.message_reactions;
create policy "message reactions change" on public.message_reactions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and auth.uid()::text in (m.sender_id::text, m.receiver_id::text)));
grant update (emoji) on public.message_reactions to authenticated;

------------------------------------------------------------
-- 내 메시지 고치기
------------------------------------------------------------
alter table public.messages add column if not exists edited_at timestamptz;

-- 고치기 전 내용 (관리자만 읽음)
create table if not exists public.message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  sender_id text,
  old_content text,
  new_content text,
  edited_at timestamptz not null default now()
);
create index if not exists message_edits_message_idx on public.message_edits (message_id);
alter table public.message_edits enable row level security;
revoke insert, update, delete on public.message_edits from anon, authenticated;
drop policy if exists "message edits admin read" on public.message_edits;
create policy "message edits admin read" on public.message_edits for select to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

create or replace function public.edit_my_message(p_id text, p_content text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  c text := left(btrim(coalesce(p_content, '')), 2000);
begin
  select id, sender_id, content, created_at, deleted_at into m from messages where id::text = p_id;
  if not found or m.sender_id::text is distinct from auth.uid()::text then raise exception '내가 보낸 메시지만 고칠 수 있어요'; end if;
  if m.deleted_at is not null then raise exception '삭제된 메시지는 고칠 수 없어요'; end if;
  if m.created_at < now() - interval '24 hours' then raise exception '보낸 지 하루가 지난 메시지는 고칠 수 없어요'; end if;
  if c = '' then raise exception '내용을 적어 주세요'; end if;
  if c = m.content then return; end if;
  insert into message_edits (message_id, sender_id, old_content, new_content) values (p_id, m.sender_id::text, m.content, c);
  update messages set content = c, edited_at = now() where id = m.id;
end $$;
revoke execute on function public.edit_my_message(text, text) from public, anon;
grant execute on function public.edit_my_message(text, text) to authenticated;

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'reply_to')
         and exists (select 1 from information_schema.columns where table_name = 'message_reactions' and column_name = 'emoji')
       then '✅ 준비됨 (답장·감정 표시·고치기)' else '❌ 다시 실행해 주세요' end as "메시지 기능";
