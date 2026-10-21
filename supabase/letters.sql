-- 사연 보내기: 회원이 보낸 사연은 관리자만 읽는다 (유튜브 방송에서 소개용)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,                                   -- 보낼 때의 세례명·닉네임
  content text not null check (char_length(content) between 1 and 5000),
  image_url text,
  name_display text not null default 'anonymous' check (name_display in ('name', 'anonymous')), -- 방송에서 이름 공개 여부
  broadcast_ok boolean not null default true,         -- 방송에서 소개해도 되는지
  status text not null default 'new' check (status in ('new', 'read', 'aired')), -- 새 사연 / 읽음 / 방송에서 소개함
  created_at timestamptz not null default now()
);
create index if not exists letters_created_idx on public.letters (created_at desc);
create index if not exists letters_user_idx on public.letters (user_id, created_at desc);
alter table public.letters enable row level security;

-- 보내기: 본인 이름으로만
drop policy if exists "letters insert" on public.letters;
create policy "letters insert" on public.letters for insert to authenticated
with check (user_id = auth.uid() and status = 'new');

-- 읽기: 내가 보낸 사연, 관리자는 전부
drop policy if exists "letters select" on public.letters;
create policy "letters select" on public.letters for select to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 상태 바꾸기(읽음·소개함): 관리자만
drop policy if exists "letters update" on public.letters;
create policy "letters update" on public.letters for update to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 지우기: 아직 관리자가 읽기 전인 내 사연, 관리자는 전부
drop policy if exists "letters delete" on public.letters;
create policy "letters delete" on public.letters for delete to authenticated
using ((user_id = auth.uid() and status = 'new') or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
