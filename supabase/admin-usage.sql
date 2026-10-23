-- 관리자 화면 '데이터 사용량'에 쓰는 함수 (한 번만 실행, 여러 번 실행해도 안전)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- 서버(service_role)만 부를 수 있다. 교우·로그인 안 한 사람은 부를 수 없음.
create or replace function public.admin_usage()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'members',      (select count(*) from auth.users),
    'active30',     (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'active7',      (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'new30',        (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'dbBytes',      pg_database_size(current_database()),
    'storageBytes', coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('name', bucket_id, 'files', n, 'bytes', b) order by b desc)
      from (select bucket_id, count(*) as n, coalesce(sum((metadata ->> 'size')::bigint), 0) as b from storage.objects group by bucket_id) s
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('name', relname, 'rows', greatest(reltuples::bigint, 0), 'bytes', bytes) order by bytes desc)
      from (select c.relname, c.reltuples, pg_total_relation_size(c.oid) as bytes
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r') t
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'posts',     (select count(*) from public.posts),
      'posts30',   (select count(*) from public.posts where created_at > now() - interval '30 days'),
      'comments',  (select count(*) from public.comments),
      'messages',  (select count(*) from public.messages),
      'reactions', (select count(*) from public.post_reactions)
    )
  );
$$;
revoke execute on function public.admin_usage() from public, anon, authenticated;
grant execute on function public.admin_usage() to service_role;

-- 확인: '준비됨'이 나오면 정상
select case when has_function_privilege('service_role', 'public.admin_usage()', 'execute')
             and not has_function_privilege('authenticated', 'public.admin_usage()', 'execute')
       then '✅ 준비됨 (서버만 부를 수 있음)' else '❌ 다시 실행해 주세요' end as "데이터 사용량 함수";
