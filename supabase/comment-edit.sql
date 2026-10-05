-- 내 댓글 수정 / 삭제 (관리자는 모든 댓글 삭제 가능)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

alter table public.comments add column if not exists edited_at timestamptz;

drop policy if exists "comments update own" on public.comments;
create policy "comments update own" on public.comments for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "comments delete own or admin" on public.comments;
create policy "comments delete own or admin" on public.comments for delete to authenticated
using (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
