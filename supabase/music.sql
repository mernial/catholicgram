-- 게시물 배경음악 (유튜브 링크 / 앱 배경음악 목록)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

-- 게시물에 음악 정보 ('yt:영상ID' 또는 'bgm:트랙ID') 와 곡 제목
alter table public.posts add column if not exists music text;
alter table public.posts add column if not exists music_title text;

-- 관리자가 올리는 배경음악 목록
create table if not exists public.bgm_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,                -- 연주자/출처
  url text not null,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.bgm_tracks enable row level security;

drop policy if exists "bgm read" on public.bgm_tracks;
create policy "bgm read" on public.bgm_tracks for select
using (active or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "bgm admin write" on public.bgm_tracks;
create policy "bgm admin write" on public.bgm_tracks for all to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 음악 파일 저장소 (공개 읽기, 관리자만 업로드/삭제)
insert into storage.buckets (id, name, public)
values ('bgm', 'bgm', true)
on conflict (id) do update set public = true;

drop policy if exists "bgm files admin insert" on storage.objects;
create policy "bgm files admin insert" on storage.objects for insert to authenticated
with check (bucket_id = 'bgm' and (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "bgm files admin update" on storage.objects;
create policy "bgm files admin update" on storage.objects for update to authenticated
using (bucket_id = 'bgm' and (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "bgm files admin delete" on storage.objects;
create policy "bgm files admin delete" on storage.objects for delete to authenticated
using (bucket_id = 'bgm' and (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
