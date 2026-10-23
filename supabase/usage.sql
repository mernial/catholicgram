-- 앱 사용량 한눈에 보기 (읽기만 함)
-- Supabase 대시보드 → SQL Editor 에서 실행
with x as (
  select 1 as 순서, '회원 수' as 항목, (select count(*) from auth.users)::text as 값
  union all select 2, '최근 30일 동안 로그인한 회원', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')::text
  union all select 3, '최근 7일 동안 로그인한 회원', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days')::text
  union all select 4, '데이터베이스 전체 크기 (Pro 기본 8GB)', pg_size_pretty(pg_database_size(current_database()))
  union all select 5, '수파베이스 파일 저장소 전체 (예전 사진·영상)',
    pg_size_pretty(coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0))
  union all select 6, '글 수 (스토리 포함)', (select count(*) from public.posts)::text
  union all select 7, '최근 30일 새 글', (select count(*) from public.posts where created_at > now() - interval '30 days')::text
  union all select 8, '댓글 수', (select count(*) from public.comments)::text
  union all select 9, '1:1 메시지 수', (select count(*) from public.messages)::text
)
select 항목, 값 from (
  select 순서, 항목, 값 from x
  union all
  select 20 + row_number() over (order by sum((o.metadata ->> 'size')::bigint) desc),
    '파일 저장소 · ' || o.bucket_id || ' (' || count(*) || '개)',
    pg_size_pretty(sum((o.metadata ->> 'size')::bigint))
  from storage.objects o group by o.bucket_id
  union all
  select 40 + row_number() over (order by pg_total_relation_size(c.oid) desc),
    '큰 표 · ' || c.relname || ' (' || greatest(c.reltuples::bigint, 0) || '줄쯤)',
    pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by 1
  limit 100
) s
order by 순서
limit 30;
