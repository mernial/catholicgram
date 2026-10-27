-- 댓글에도 🙏 기도할게요 / ❤️ 공감해요 — 꾹 누르면 👍 😊 😂 😮 😢 도 (한 사람이 여러 개 고를 수 있음)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전 — 새 감정이 생기면 다시 실행)

create table if not exists public.comment_reactions (
  comment_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('pray', 'like')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, reaction_type)
);
create index if not exists comment_reactions_comment_idx on public.comment_reactions (comment_id);

alter table public.comment_reactions enable row level security;

drop policy if exists "comment reactions read" on public.comment_reactions;
create policy "comment reactions read" on public.comment_reactions for select using (true);

drop policy if exists "comment reactions insert own" on public.comment_reactions;
create policy "comment reactions insert own" on public.comment_reactions for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "comment reactions delete own" on public.comment_reactions;
create policy "comment reactions delete own" on public.comment_reactions for delete to authenticated
using (user_id = auth.uid());

-- 꾹 눌러 고르는 감정: like ❤️ · pray 🙏 · thumbs 👍 · smile 😊 · laugh 😂 · wow 😮 · sad 😢
alter table public.comment_reactions drop constraint if exists comment_reactions_reaction_type_check;
alter table public.comment_reactions add constraint comment_reactions_reaction_type_check
  check (reaction_type in ('pray', 'like', 'thumbs', 'smile', 'laugh', 'wow', 'sad'));
