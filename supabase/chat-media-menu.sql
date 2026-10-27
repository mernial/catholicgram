-- 대화방 꾹 누르기 메뉴·사진 묶음 (1:1 메시지 · 단체 채팅방 · 모두의 사랑방)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- group-chats.sql, lounge.sql(·lounge-daily.sql), message-extras.sql 을 먼저 실행해 두어야 합니다.
--
--  * 사진 여러 장을 한 메시지로 묶어 보내기 (images 칸)
--  * 단체 채팅방·사랑방에서도 사진·동영상 보내기 (image_url 칸)
--  * 사랑방: 답장 · 감정 표시(꾹 누르기)
--  * 감정 줄의 ＋ 로 고르는 감정 더 받기 (앱의 components/MessageMenu.tsx 목록과 같음)

------------------------------------------------------------
-- 1) 사진·동영상 칸
------------------------------------------------------------
alter table public.messages add column if not exists images text[];
alter table public.deleted_messages add column if not exists images text[];   -- 지운 메시지 원래 사진 (관리자만)
alter table public.group_chat_messages add column if not exists image_url text;
alter table public.group_chat_messages add column if not exists images text[];
alter table public.lounge_messages add column if not exists image_url text;
alter table public.lounge_messages add column if not exists images text[];
alter table public.lounge_trash add column if not exists image_url text;
alter table public.lounge_trash add column if not exists images text[];

-- 사랑방 글을 지울 때 사진도 관리자 보관함에 (보관함에 넣는 원래 트리거 다음에 실행되도록 이름을 뒤로)
create or replace function public.lounge_trash_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.image_url is not null or old.images is not null then
    update lounge_trash set image_url = old.image_url, images = old.images where id = old.id;
  end if;
  return old;
end $$;
drop trigger if exists lounge_trash_media on public.lounge_messages;
create trigger lounge_trash_media before delete on public.lounge_messages
for each row execute function public.lounge_trash_media();

------------------------------------------------------------
-- 2) 사랑방 답장
------------------------------------------------------------
alter table public.lounge_messages add column if not exists reply_to uuid references public.lounge_messages(id) on delete set null;

------------------------------------------------------------
-- 3) 사랑방 감정 표시 (한 사람이 한 글에 하나, 대화 금지된 교우는 못 함)
------------------------------------------------------------
create table if not exists public.lounge_reactions (
  message_id uuid not null references public.lounge_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.lounge_reactions enable row level security;
revoke all on public.lounge_reactions from anon;
grant select, insert, delete on public.lounge_reactions to authenticated;
grant update (emoji) on public.lounge_reactions to authenticated;

drop policy if exists "lounge reactions read" on public.lounge_reactions;
create policy "lounge reactions read" on public.lounge_reactions for select to authenticated using (true);
drop policy if exists "lounge reactions add" on public.lounge_reactions;
create policy "lounge reactions add" on public.lounge_reactions for insert to authenticated
with check (user_id = auth.uid()
  and not exists (select 1 from public.lounge_bans b where b.user_id = auth.uid())
  and exists (select 1 from public.lounge_messages m where m.id = message_id));
drop policy if exists "lounge reactions change" on public.lounge_reactions;
create policy "lounge reactions change" on public.lounge_reactions for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "lounge reactions remove" on public.lounge_reactions;
create policy "lounge reactions remove" on public.lounge_reactions for delete to authenticated
using (user_id = auth.uid());

------------------------------------------------------------
-- 4) 고를 수 있는 감정 (기본 7개 + ＋ 로 더 고르는 24개)
------------------------------------------------------------
alter table public.lounge_reactions drop constraint if exists lounge_reactions_emoji_check;
alter table public.lounge_reactions add constraint lounge_reactions_emoji_check check (emoji in ('❤️', '👍', '😊', '😂', '😮', '😢', '🙏', '✅', '👏', '🙌', '🥰', '😍', '😆', '🤗', '🙂', '😭', '😥', '😡', '😱', '🎉', '🌹', '🌸', '💐', '🎂', '🍀', '⛪', '✝️', '🕊️', '📿', '💪', '👌'));
alter table public.group_chat_reactions drop constraint if exists group_chat_reactions_emoji_check;
alter table public.group_chat_reactions add constraint group_chat_reactions_emoji_check check (emoji in ('❤️', '👍', '😊', '😂', '😮', '😢', '🙏', '✅', '👏', '🙌', '🥰', '😍', '😆', '🤗', '🙂', '😭', '😥', '😡', '😱', '🎉', '🌹', '🌸', '💐', '🎂', '🍀', '⛪', '✝️', '🕊️', '📿', '💪', '👌'));
do $$
begin
  -- 1:1 메시지 감정 칸은 message-extras.sql 에서 생김 (없으면 건너뜀)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'emoji') then
    alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
    alter table public.message_reactions add constraint message_reactions_emoji_check check (emoji in ('❤️', '👍', '😊', '😂', '😮', '😢', '🙏', '✅', '👏', '🙌', '🥰', '😍', '😆', '🤗', '🙂', '😭', '😥', '😡', '😱', '🎉', '🌹', '🌸', '💐', '🎂', '🍀', '⛪', '✝️', '🕊️', '📿', '💪', '👌'));
  end if;
end $$;

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'images')
         and exists (select 1 from information_schema.columns where table_name = 'lounge_messages' and column_name = 'reply_to')
         and exists (select 1 from information_schema.tables where table_name = 'lounge_reactions')
       then '✅ 준비됨 (사진 묶음·단체방/사랑방 사진·사랑방 답장과 감정 표시)' else '❌ 다시 실행해 주세요' end as "대화방 기능";
