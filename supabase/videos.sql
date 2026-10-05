-- 숏폼 영상 (1분 이하)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

alter table public.posts add column if not exists video_url text;
alter table public.posts add column if not exists video_poster text;

-- 영상 저장소 (공개 읽기, 50MB 이하 영상만, 본인 폴더에만 올리기)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-videos', 'post-videos', true, 52428800, array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v'];

drop policy if exists "post videos insert own" on storage.objects;
create policy "post videos insert own" on storage.objects for insert to authenticated
with check (bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "post videos delete own or admin" on storage.objects;
create policy "post videos delete own or admin" on storage.objects for delete to authenticated
using (bucket_id = 'post-videos' and ((storage.foldername(name))[1] = auth.uid()::text or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr'));
