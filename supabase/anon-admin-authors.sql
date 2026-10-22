-- 익명 고민상담: 관리자만 글쓴이(세례명 @아이디)를 볼 수 있게 (supabase/anon-board.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 다른 교우에게는 여전히 '익명 #코드'만 보인다. 관리자 이메일이 아니면 아무것도 돌려주지 않는다.
create or replace function public.admin_anon_authors(p_post_ids uuid[])
returns table (kind text, id uuid, user_id uuid, baptismal_name text, handle text)
language sql stable security definer set search_path = public as $$
  select 'post', p.id, p.user_id, pr.baptismal_name, pr.handle
  from anon_posts p left join profiles pr on pr.id = p.user_id
  where (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr' and p.id = any(p_post_ids)
  union all
  select 'reply', r.id, r.user_id, pr.baptismal_name, pr.handle
  from anon_replies r left join profiles pr on pr.id = r.user_id
  where (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr' and r.post_id = any(p_post_ids);
$$;
revoke execute on function public.admin_anon_authors(uuid[]) from public, anon;
grant execute on function public.admin_anon_authors(uuid[]) to authenticated;
