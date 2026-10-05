-- 닉네임 공개 / 실명(이름+세례명) 비공개 + 댓글 답글
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.
--
-- profiles.baptismal_name 은 이제 '공개 닉네임'으로 쓰고,
-- 실명(이름 + 세례명)은 profile_private.real_name 에 보관해 본인과 관리자만 볼 수 있다.

------------------------------------------------------------
-- 1. 실명 비공개 보관
------------------------------------------------------------
create table if not exists public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  real_name text,
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;

drop policy if exists "private read own or admin" on public.profile_private;
create policy "private read own or admin" on public.profile_private for select to authenticated
using (id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "private insert own" on public.profile_private;
create policy "private insert own" on public.profile_private for insert to authenticated
with check (id = auth.uid());

drop policy if exists "private update own" on public.profile_private;
create policy "private update own" on public.profile_private for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- 닉네임을 정했는지 (기존 회원은 다음 접속 때 닉네임을 정하도록 안내)
alter table public.profiles add column if not exists nickname_set boolean not null default false;

------------------------------------------------------------
-- 2. 기존 회원: 실명을 비공개로 옮기고, 공개 이름은 우선 @핸들로 바꿔 둔다
------------------------------------------------------------
insert into public.profile_private (id, real_name)
select id, baptismal_name from public.profiles
where nickname_set = false and baptismal_name is not null
on conflict (id) do nothing;

update public.posts p set author_name = pr.handle
from public.profiles pr
where p.user_id = pr.id and pr.nickname_set = false and pr.handle is not null;

update public.comments c set author_name = pr.handle
from public.profiles pr
where c.user_id = pr.id and pr.nickname_set = false and pr.handle is not null;

update public.profiles set baptismal_name = handle
where nickname_set = false and handle is not null;

------------------------------------------------------------
-- 3. 닉네임을 바꾸면 내가 쓴 글/댓글의 작성자 이름도 함께 바꾼다
------------------------------------------------------------
create or replace function public.sync_my_author_name()
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select baptismal_name into v_name from profiles where id = auth.uid();
  if v_name is null then return; end if;
  update posts set author_name = v_name where user_id = auth.uid();
  update comments set author_name = v_name where user_id = auth.uid();
  update comments set reply_to_name = v_name where reply_to_user_id = auth.uid();
end;
$$;

------------------------------------------------------------
-- 4. 댓글 답글: 누구에게 단 댓글인지
------------------------------------------------------------
alter table public.comments add column if not exists reply_to_user_id uuid;
alter table public.comments add column if not exists reply_to_name text;
create index if not exists comments_reply_to_idx on public.comments (reply_to_user_id);

-- (함수가 reply_to_name 을 쓰므로 칼럼 추가 뒤에 권한 부여)
grant execute on function public.sync_my_author_name() to authenticated;
