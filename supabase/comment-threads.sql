-- 대댓글: 어느 댓글에 단 답글인지 (답글을 그 댓글 바로 밑에 보여 주기 위해)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);
