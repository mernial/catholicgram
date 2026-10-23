-- 기도·공감이 안 눌릴 때 원인 찾기 (읽기 전용 — 시험으로 눌러 본 것은 바로 되돌림)
-- Supabase 대시보드 → SQL Editor 에서 실행하고, 나온 표를 화면으로 보내 주세요.
create temp table if not exists diag (n serial, 항목 text, 결과 text);
truncate diag;

do $$
declare
  v_admin uuid;
  v_member uuid;
  v_who uuid;
  v_label text;
  v_post public.posts.id%type;
  v_before int;
  v_after int;
  v_msg text;
begin
  select id into v_admin from auth.users where email = 'yunho-jo@casuwon.or.kr' limit 1;
  select id into v_member from auth.users where email is distinct from 'yunho-jo@casuwon.or.kr' order by last_sign_in_at desc nulls last limit 1;

  foreach v_label in array array['관리자', '교우'] loop
    v_who := case when v_label = '관리자' then v_admin else v_member end;
    v_msg := null;
    if v_who is null then
      insert into diag (항목, 결과) values (v_label || ' 공감 시험', '계정 없음');
      continue;
    end if;
    -- 이 사람이 아직 공감하지 않은 최근 공개 글 하나
    select p.id, p.like_count into v_post, v_before from public.posts p
    where coalesce(p.is_story, false) = false
      and not exists (select 1 from public.post_reactions r where r.post_id = p.id and r.user_id = v_who and r.reaction_type = 'like')
    order by p.created_at desc limit 1;
    if v_post is null then
      insert into diag (항목, 결과) values (v_label || ' 공감 시험', '시험할 글 없음');
      continue;
    end if;
    begin
      perform set_config('request.jwt.claim.sub', v_who::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_who, 'role', 'authenticated',
        'email', (select email from auth.users where id = v_who))::text, true);
      execute 'set local role authenticated';
      insert into public.post_reactions (post_id, user_id, reaction_type) values (v_post, v_who, 'like');
      select like_count into v_after from public.posts where id = v_post;
      v_msg := '성공 (공감 수 ' || coalesce(v_before::text, '?') || ' → ' || coalesce(v_after::text, '못 읽음') || ')';
      raise exception 'diag-rollback';
    exception when others then
      if sqlerrm <> 'diag-rollback' then v_msg := '실패: ' || sqlerrm; end if;
    end;
    insert into diag (항목, 결과) values (v_label || ' 공감 시험', v_msg);
  end loop;
end $$;

-- 참고 정보: 표 주인·잠금, 규칙, 트리거
insert into diag (항목, 결과)
select '표 ' || c.relname, '주인=' || pg_get_userbyid(c.relowner) || ', 잠금(RLS)=' || c.relrowsecurity
from pg_class c where c.oid in ('public.posts'::regclass, 'public.post_reactions'::regclass);
insert into diag (항목, 결과)
select '역할 postgres', 'RLS 무시 가능=' || rolbypassrls from pg_roles where rolname = 'postgres';
insert into diag (항목, 결과)
select '숫자 세기 함수 주인', pg_get_userbyid(proowner) from pg_proc where proname = 'post_reaction_counts';
insert into diag (항목, 결과)
select '규칙 ' || tablename || ' · ' || policyname,
  cmd || ' / ' || permissive || ' / ' || array_to_string(roles, ',') || ' / ' || left(coalesce(qual, '') || ' | ' || coalesce(with_check, ''), 160)
from pg_policies where schemaname = 'public' and tablename in ('posts', 'post_reactions')
order by tablename, policyname;
insert into diag (항목, 결과)
select '트리거 ' || event_object_table || ' · ' || trigger_name, action_timing || ' ' || event_manipulation
from information_schema.triggers where event_object_schema = 'public' and event_object_table in ('posts', 'post_reactions');

select 항목, 결과 from diag order by n;
