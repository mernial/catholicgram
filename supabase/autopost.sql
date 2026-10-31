-- 외부 자동 게시 (/api/autopost — 인스타 자동 업로더가 매일 묵상 카드를 올릴 때): 같은 글 두 번 막기
-- 업로더가 보내는 client_key(예: 2026-11-02)를 글에 적어 두고, 같은 사람·같은 열쇠의 글은 하나만 생기게 한다.
-- 여러 번 실행해도 괜찮음.

alter table public.posts add column if not exists autopost_key text;
create unique index if not exists posts_autopost_key on public.posts (user_id, autopost_key) where autopost_key is not null;

-- 확인: ✅ 면 준비됨
select '자동 게시 준비' as 항목,
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'autopost_key')
        and exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'posts' and indexname = 'posts_autopost_key')
  then '✅' else '❌' end as 확인;
