-- 모두의 사랑방 관리 기능 (lounge.sql, lounge-daily.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--  * 대화 얼리기: 관리자가 얼리면 교우는 글을 쓸 수 없다 (관리자 안내 글 '얼림/다시 엶'으로 표시)
--  * 교우 뱃지: 관리자가 정한 교우 이름 옆에 뱃지
--  * 관리자 안내 글에 쓰는 보이지 않는 표시 문자(U+2063, U+2064)를 교우 글에서는 지운다 (흉내 방지)

create table if not exists public.lounge_badges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 20),
  created_at timestamptz not null default now()
);
alter table public.lounge_badges enable row level security;

drop policy if exists "lounge badges read" on public.lounge_badges;
create policy "lounge badges read" on public.lounge_badges for select to authenticated using (true);

drop policy if exists "lounge badges admin write" on public.lounge_badges;
create policy "lounge badges admin write" on public.lounge_badges for all to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

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
  if not new.is_admin then
    -- 관리자 안내 표시 문자 흉내 방지
    new.content := btrim(regexp_replace(new.content, '^[' || chr(8291) || chr(8292) || ']+', ''));
    if new.content = '' then raise exception '내용을 입력해 주세요.'; end if;
    -- 얼린 동안은 교우 글을 받지 않는다 (오늘 마지막 '얼림/다시 엶' 안내가 얼림이면)
    if coalesce((
      select substr(content, 2, 1) = 'F' from lounge_messages
      where is_admin and left(content, 1) = chr(8292) and substr(content, 2, 1) in ('F', 'U')
        and created_at >= lounge_today_start()
      order by created_at desc limit 1
    ), false) then
      raise exception '관리자가 대화를 잠시 멈췄어요. 조금 뒤에 다시 보내 주세요.';
    end if;
  end if;
  delete from lounge_messages where created_at < lounge_today_start();   -- 어제까지의 대화 정리
  return new;
end $$;
