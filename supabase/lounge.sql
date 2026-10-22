-- 모두의 사랑방 (모든 교우가 세례명으로 함께하는 실시간 대화방)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
--
--  * 로그인한 교우만 읽고 쓸 수 있다. 이름은 각자의 세례명(프로필)으로 보인다.
--  * 대화는 7일 동안만 남는다 (새 글이 올라올 때 지난 대화를 함께 정리).
--  * 내 글은 내가, 모든 글은 관리자가 지울 수 있다. 지운 글은 관리자만 보는 보관함에 남는다.
--  * 관리자는 문제가 있는 교우의 대화를 막을 수 있다 (대화 금지).
--  * 같은 사람이 2초 안에 연달아 보내는 것은 막는다 (도배 방지).

------------------------------------------------------------
-- 테이블
------------------------------------------------------------
create table if not exists public.lounge_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists lounge_messages_created_idx on public.lounge_messages (created_at desc);
create index if not exists lounge_messages_user_idx on public.lounge_messages (user_id, created_at desc);

-- 지운 대화 보관함 (관리자만)
create table if not exists public.lounge_trash (
  id uuid primary key,
  user_id uuid,
  content text,
  created_at timestamptz,
  deleted_at timestamptz not null default now(),
  deleted_by uuid
);

-- 대화 금지 (관리자가 지정)
create table if not exists public.lounge_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- 보내기: 작성자·시간은 서버가 정하고, 도배·대화 금지 확인, 지난 대화 정리
------------------------------------------------------------
create or replace function public.lounge_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if exists (select 1 from lounge_bans where user_id = auth.uid()) then
    raise exception '사랑방 대화가 제한되었습니다. 관리자에게 문의해 주세요.';
  end if;
  if exists (select 1 from lounge_messages where user_id = auth.uid() and created_at > now() - interval '2 seconds') then
    raise exception '조금 천천히 보내 주세요.';
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  new.content := btrim(new.content);
  delete from lounge_messages where created_at < now() - interval '7 days';
  return new;
end $$;
drop trigger if exists lounge_before_insert on public.lounge_messages;
create trigger lounge_before_insert before insert on public.lounge_messages
for each row execute function public.lounge_before_insert();

-- 지울 때: 7일 안의 대화면 보관함에 남긴다 (오래돼서 정리되는 것은 남기지 않음)
create or replace function public.lounge_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.created_at > now() - interval '7 days' then
    insert into lounge_trash (id, user_id, content, created_at, deleted_by)
    values (old.id, old.user_id, old.content, old.created_at, auth.uid())
    on conflict (id) do nothing;
  end if;
  return old;
end $$;
drop trigger if exists lounge_before_delete on public.lounge_messages;
create trigger lounge_before_delete before delete on public.lounge_messages
for each row execute function public.lounge_before_delete();

------------------------------------------------------------
-- 권한
------------------------------------------------------------
alter table public.lounge_messages enable row level security;
alter table public.lounge_trash enable row level security;
alter table public.lounge_bans enable row level security;

drop policy if exists "lounge read" on public.lounge_messages;
create policy "lounge read" on public.lounge_messages for select to authenticated
using (created_at > now() - interval '7 days');

drop policy if exists "lounge insert" on public.lounge_messages;
create policy "lounge insert" on public.lounge_messages for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "lounge delete own or admin" on public.lounge_messages;
create policy "lounge delete own or admin" on public.lounge_messages for delete to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "lounge trash admin" on public.lounge_trash;
create policy "lounge trash admin" on public.lounge_trash for select to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "lounge bans read own or admin" on public.lounge_bans;
create policy "lounge bans read own or admin" on public.lounge_bans for select to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "lounge bans admin write" on public.lounge_bans;
create policy "lounge bans admin write" on public.lounge_bans for all to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

------------------------------------------------------------
-- 실시간: 새 대화·지운 대화를 바로 받는다
------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.lounge_messages;
exception when duplicate_object then null;
end $$;

------------------------------------------------------------
-- 신고에 '사랑방 대화' 추가
------------------------------------------------------------
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'anon_post', 'anon_reply', 'user', 'message', 'lounge'));
