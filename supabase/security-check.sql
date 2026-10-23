-- 보안 점검 (읽기만 함, 아무것도 바꾸지 않음)
-- Supabase 대시보드 → SQL Editor 에서 실행하면 항목마다 ✅ 또는 ❌ 가 나온다. 모두 ✅ 면 정상.
-- ❌ 가 있으면 profiles-email-private.sql, security-hardening.sql 을 다시 실행한다.
select 항목, case when 결과 is not distinct from 정상값 then '✅' else '❌' end as 확인
from (values
  (1, '이메일: 로그인 안 한 사람은 못 읽음',
      has_column_privilege('anon', 'public.profiles', 'email', 'select'), false),
  (2, '이메일: 교우끼리도 못 읽음',
      has_column_privilege('authenticated', 'public.profiles', 'email', 'select'), false),
  (3, '남의 글 고치기 막힘',
      has_table_privilege('authenticated', 'public.posts', 'update'), false),
  (4, '다른 사람 이름으로 글 쓰기 막힘',
      exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts own insert (restrictive)'), true),
  (5, '공감 숫자는 DB 가 직접 셈',
      exists (select 1 from pg_trigger where tgname = 'post_reaction_counts' and not tgisinternal), true),
  (6, '1:1 메시지는 대화한 두 사람만 읽음',
      exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'dm only participants (restrictive)'), true),
  (7, '메시지 내용 고치기 막힘',
      has_column_privilege('authenticated', 'public.messages', 'content', 'update'), false),
  (8, '메시지 읽음 표시는 됨',
      has_column_privilege('authenticated', 'public.messages', 'read_at', 'update'), true),
  (9, '가짜 신고(처리 완료로 보내기) 막힘',
      exists (select 1 from pg_trigger where tgname = 'reports_before_insert' and not tgisinternal), true),
  (10, '남들끼리 차단 여부 엿보기 막힘',
      coalesce(has_function_privilege('anon', to_regprocedure('public.is_blocked(uuid, uuid)')::oid, 'execute'), false), false),
  (11, '기도지향 올린 사람 엿보기 막힘',
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prayer_intentions_feed' and column_name = 'blocked'), false),
  (12, '모든 표 잠금(RLS) 켜짐 — ❌ 면 posts-rls.sql 실행',
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), false)
) as t(번호, 항목, 결과, 정상값)
order by 번호;
