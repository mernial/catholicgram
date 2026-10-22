-- 모두의 사랑방 v2 (supabase/lounge.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--  * 관리자 글 표시(is_admin): 관리자 글은 사랑방 위쪽 칸에 따로 보인다
--  * 대화는 매일 자정(한국 시간)에 새로 시작: 오늘 대화만 보이고, 지난 대화는 새 글이 올라올 때 지운다

alter table public.lounge_messages add column if not exists is_admin boolean not null default false;

-- 한국 시간 오늘 0시
create or replace function public.lounge_today_start()
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
$$;

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
  new.is_admin := coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
  delete from lounge_messages where created_at < lounge_today_start();   -- 어제까지의 대화 정리
  return new;
end $$;

-- 지울 때: 오늘 대화면 보관함에 남긴다 (자정 정리는 남기지 않음)
create or replace function public.lounge_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.created_at >= lounge_today_start() then
    insert into lounge_trash (id, user_id, content, created_at, deleted_by)
    values (old.id, old.user_id, old.content, old.created_at, auth.uid())
    on conflict (id) do nothing;
  end if;
  return old;
end $$;

-- 읽기: 오늘(한국 시간) 대화만
drop policy if exists "lounge read" on public.lounge_messages;
create policy "lounge read" on public.lounge_messages for select to authenticated
using (created_at >= public.lounge_today_start());
