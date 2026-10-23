-- 잠금(RLS)을 켠 표에 '허용 규칙'이 없어 앱이 막히는 문제 고치기 (privacy-hardening.sql 다음에 꼭 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- RLS 를 켜면 '허용(permissive)' 규칙이 하나 이상 있어야 읽고 쓸 수 있다. '제한(restrictive)' 규칙만 있으면 모두 막힌다.
-- privacy-hardening.sql 이 잠금을 켠 표 중 허용 규칙이 하나도 없는 표에만, 원래 의도한 범위의 허용 규칙을 만든다.
-- (이미 허용 규칙이 있는 표는 건드리지 않음. 서버만 쓰는 표 — 지운 메시지 보관·접속 기록·축일 발송 — 는 그대로 잠가 둔다)
-- 마지막에 기도·공감을 관리자·교우인 척 눌러 보고(바로 되돌림) 결과를 보여 준다.

create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

do $$
declare
  r record;
begin
  for r in select * from (values
    -- 표, 규칙 이름, 동작, 대상, 조건(using), 조건(with check)
    ('post_reactions',     'app read',   'select', 'anon, authenticated', 'true', null),
    ('post_reactions',     'app add',    'insert', 'authenticated', null, 'user_id = auth.uid()'),
    ('post_reactions',     'app remove', 'delete', 'authenticated', 'user_id = auth.uid()', null),
    ('blocks',             'app own',    'all',    'authenticated', 'blocker_id = auth.uid()', 'blocker_id = auth.uid()'),
    ('letters',            'app read',   'select', 'authenticated', 'user_id = auth.uid() or public.is_app_admin()', null),
    ('letters',            'app add',    'insert', 'authenticated', null, 'user_id = auth.uid()'),
    ('letters',            'app admin',  'update', 'authenticated', 'public.is_app_admin()', 'public.is_app_admin()'),
    ('letters',            'app remove', 'delete', 'authenticated', 'user_id = auth.uid() or public.is_app_admin()', null),
    ('feedback',           'app read',   'select', 'authenticated', 'user_id = auth.uid() or public.is_app_admin()', null),
    ('feedback',           'app add',    'insert', 'authenticated', null, 'user_id = auth.uid()'),
    ('feedback',           'app admin',  'update', 'authenticated', 'public.is_app_admin()', 'public.is_app_admin()'),
    ('feedback',           'app remove', 'delete', 'authenticated', 'user_id = auth.uid() or public.is_app_admin()', null),
    ('reports',            'app read',   'select', 'authenticated', 'reporter_id = auth.uid() or public.is_app_admin()', null),
    ('reports',            'app add',    'insert', 'authenticated', null, 'reporter_id = auth.uid()'),
    ('reports',            'app admin',  'update', 'authenticated', 'public.is_app_admin()', 'public.is_app_admin()'),
    ('reports',            'app remove', 'delete', 'authenticated', 'public.is_app_admin()', null),
    ('push_subscriptions', 'app own',    'all',    'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('interest_events',    'app own',    'all',    'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
    ('profile_private',    'app read',   'select', 'authenticated', 'id = auth.uid() or public.is_app_admin()', null),
    ('profile_private',    'app add',    'insert', 'authenticated', null, 'id = auth.uid()'),
    ('profile_private',    'app edit',   'update', 'authenticated', 'id = auth.uid()', 'id = auth.uid()'),
    ('lounge_bans',        'app read',   'select', 'authenticated', 'user_id = auth.uid() or public.is_app_admin()', null),
    ('lounge_bans',        'app admin',  'all',    'authenticated', 'public.is_app_admin()', 'public.is_app_admin()'),
    ('anon_posts',         'app add',    'insert', 'authenticated', null, 'user_id = auth.uid()'),
    ('anon_replies',       'app add',    'insert', 'authenticated', null, 'user_id = auth.uid()'),
    ('lounge_trash',       'app admin',  'select', 'authenticated', 'public.is_app_admin()', null)
  ) as t(tbl, pname, cmd, roles, using_expr, check_expr)
  loop
    -- 표가 있고, 그 표에 허용 규칙이 하나도 없을 때만 (우리가 이번에 만드는 'app ...' 규칙은 다시 만들 수 있게 제외하고 셈)
    if to_regclass('public.' || r.tbl) is not null and not exists (
      select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.tbl
        and p.permissive = 'PERMISSIVE' and p.policyname not like 'app %'
    ) then
      execute format('drop policy if exists %I on public.%I', r.pname, r.tbl);
      execute format('create policy %I on public.%I for %s to %s%s%s', r.pname, r.tbl, r.cmd, r.roles,
        case when r.using_expr is not null then ' using (' || r.using_expr || ')' else '' end,
        case when r.check_expr is not null then ' with check (' || r.check_expr || ')' else '' end);
    end if;
  end loop;
end $$;

-- 글(posts): 대시보드에서 예전에 만든 '누구나 읽고 쓰기' 규칙은 지운다 (읽기·본인 쓰기·본인/관리자 지우기 규칙은 posts-rls.sql 에 있음)
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts read') then
    drop policy if exists "Allow public read-write for posts" on public.posts;
  end if;
end $$;

-- 확인 1: 기도·공감을 관리자·교우인 척 눌러 보기 (바로 되돌림)
create temp table if not exists fixcheck (n serial, 항목 text, 결과 text);
truncate fixcheck;
do $$
declare
  v_who uuid;
  v_label text;
  v_post public.posts.id%type;
  v_before int;
  v_after int;
  v_msg text;
begin
  foreach v_label in array array['관리자', '교우'] loop
    if v_label = '관리자' then
      select id into v_who from auth.users where email = 'yunho-jo@casuwon.or.kr' limit 1;
    else
      select id into v_who from auth.users where email is distinct from 'yunho-jo@casuwon.or.kr' order by last_sign_in_at desc nulls last limit 1;
    end if;
    v_post := null; v_msg := null;
    select p.id, p.like_count into v_post, v_before from public.posts p
    where v_who is not null and coalesce(p.is_story, false) = false
      and not exists (select 1 from public.post_reactions x where x.post_id = p.id and x.user_id = v_who and x.reaction_type = 'like')
    order by p.created_at desc limit 1;
    if v_post is null then
      insert into fixcheck (항목, 결과) values (v_label || ' 공감 누르기', '시험할 글·계정 없음');
      continue;
    end if;
    begin
      perform set_config('request.jwt.claim.sub', v_who::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_who, 'role', 'authenticated',
        'email', (select email from auth.users where id = v_who))::text, true);
      execute 'set local role authenticated';
      insert into public.post_reactions (post_id, user_id, reaction_type) values (v_post, v_who, 'like');
      select like_count into v_after from public.posts where id = v_post;
      delete from public.post_reactions where post_id = v_post and user_id = v_who and reaction_type = 'like';
      v_msg := '✅ 누르기·취소 됨 (공감 수 ' || coalesce(v_before::text, '?') || ' → ' || coalesce(v_after::text, '?') || ')';
      raise exception 'fix-rollback';
    exception when others then
      if sqlerrm <> 'fix-rollback' then v_msg := '❌ ' || sqlerrm; end if;
    end;
    insert into fixcheck (항목, 결과) values (v_label || ' 공감 누르기', v_msg);
  end loop;
end $$;

-- 확인 2: 잠금은 켜졌는데 허용 규칙이 없는 표 (서버만 쓰는 표는 정상)
insert into fixcheck (항목, 결과)
select '허용 규칙 없는 표',
  coalesce(string_agg(c.relname, ', ' order by c.relname), '없음')
  || '  (deleted_messages, app_sessions, feast_day_sends, anon_reactions 는 서버만 쓰므로 정상)'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'PERMISSIVE');

select 항목, 결과 from fixcheck order by n;
