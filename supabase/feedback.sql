-- 운영자 건의함
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
-- 관리자 이메일을 바꾸려면 아래 'yunho-jo@casuwon.or.kr' 와 app/page.tsx 의 ADMIN_EMAILS 를 함께 바꾸세요.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  author_handle text,
  category text not null default 'suggestion' check (category in ('suggestion', 'bug', 'other')),
  content text not null check (char_length(content) between 1 and 2000),
  status text not null default 'received' check (status in ('received', 'reviewing', 'done')),
  admin_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);

-- 작성자 정보는 서버가 채운다
create or replace function public.feedback_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  new.user_id := auth.uid();
  new.status := 'received';
  new.admin_reply := null;
  new.replied_at := null;
  new.created_at := now();
  select baptismal_name, handle into new.author_name, new.author_handle from profiles where id = auth.uid();
  return new;
end;
$$;
drop trigger if exists feedback_before_insert on public.feedback;
create trigger feedback_before_insert before insert on public.feedback
for each row execute function public.feedback_before_insert();

alter table public.feedback enable row level security;

drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own" on public.feedback for insert to authenticated
with check (user_id = auth.uid());

-- 본인 건의만 보기, 관리자는 전체
drop policy if exists "feedback read own or admin" on public.feedback;
create policy "feedback read own or admin" on public.feedback for select to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 관리자만 상태 변경/답변
drop policy if exists "feedback admin update" on public.feedback;
create policy "feedback admin update" on public.feedback for update to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 본인(아직 접수 상태일 때) 또는 관리자 삭제
drop policy if exists "feedback delete" on public.feedback;
create policy "feedback delete" on public.feedback for delete to authenticated
using ((user_id = auth.uid() and status = 'received') or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
