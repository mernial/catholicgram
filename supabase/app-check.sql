-- 앱 종합 점검 (실제 데이터는 바뀌지 않음 — 시험마다 관리자·교우인 척 해 보고 바로 되돌림)
-- Supabase 대시보드 → SQL Editor 에서 실행. 맨 위에 요약, 그 아래 ❌ 가 먼저 나온다. 모두 ✅ 면 정상.
-- 교우 두 명은 최근에 로그인한 교우 중에서 고른다. (사랑방이 얼려져 있거나 정지된 교우면 사랑방 글쓰기는 ❌ 가 정상)
create temp table if not exists t_out (n serial, 영역 text, 시험 text, 기대 text, 결과 text, 자세히 text);
truncate t_out;

do $T$
declare
  a0 uuid; m1 uuid; m2 uuid;
  ca0 text; cm1 text; cm2 text;
  pid public.posts.id%type; pid2 public.posts.id%type;
  mid public.messages.id%type;
  cid text; xid uuid;
  n int; n2 int; c1 int; c2 int; s text;
  r text; d text; onerr text;
begin
  select id into a0 from auth.users where email = 'yunho-jo@casuwon.or.kr' limit 1;
  select u.id into m1 from auth.users u join public.profiles p on p.id = u.id
    where u.email is distinct from 'yunho-jo@casuwon.or.kr' order by u.last_sign_in_at desc nulls last limit 1;
  select u.id into m2 from auth.users u join public.profiles p on p.id = u.id
    where u.email is distinct from 'yunho-jo@casuwon.or.kr' and u.id <> m1 order by u.last_sign_in_at desc nulls last limit 1;
  if a0 is null or m1 is null or m2 is null then
    insert into t_out (영역, 시험, 기대, 결과) values ('준비', '관리자·교우 두 명 찾기', 'ok', '계정 부족');
    return;
  end if;
  ca0 := json_build_object('sub', a0, 'role', 'authenticated', 'email', 'yunho-jo@casuwon.or.kr')::text;
  cm1 := json_build_object('sub', m1, 'role', 'authenticated', 'email', (select email from auth.users where id = m1))::text;
  cm2 := json_build_object('sub', m2, 'role', 'authenticated', 'email', (select email from auth.users where id = m2))::text;

  ------------------------------------------------------------ 글
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m1, '점검', '[점검] 공개 글', (select images from public.posts where images is not null limit 1)) returning id into pid;
    r := 'ok'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '교우가 글 올리기', 'ok', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m2, '점검', '[점검] 남인 척', (select images from public.posts where images is not null limit 1));
    r := 'allowed'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '다른 교우 이름으로 글 올리기 막힘', 'blocked', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images, like_count, pray_count)
      values (m1, '가짜이름', '[점검] 숫자', (select images from public.posts where images is not null limit 1), 99, 99)
      returning like_count, pray_count, author_name into c1, c2, s;
    r := case when c1 = 0 and c2 = 0 then 'ok' else '숫자 ' || c1 || '/' || c2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '새 글 숫자 부풀리기 막힘', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images, visibility)
      values (m2, '점검', '[점검] 나만 보기', (select images from public.posts where images is not null limit 1), 'private') returning id into pid;
    perform set_config('request.jwt.claims', cm1, true);
    select count(*) into n from public.posts where id = pid;
    r := n::text; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '남의 ''나만 보기'' 글 안 보임', '0', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    delete from public.blocks where blocker_id = m1 and blocked_id = m2;
    delete from public.follows where follower_id = m1 and following_id = m2;
    perform set_config('request.jwt.claims', cm2, true);
    delete from public.blocks where blocker_id = m2 and blocked_id = m1;
    insert into public.posts (user_id, author_name, content, images, visibility)
      values (m2, '점검', '[점검] 팔로워 공개', (select images from public.posts where images is not null limit 1), 'followers') returning id into pid;
    perform set_config('request.jwt.claims', cm1, true);
    select count(*) into n from public.posts where id = pid;
    insert into public.follows (follower_id, following_id, status) values (m1, m2, 'accepted');
    select count(*) into n2 from public.posts where id = pid;
    r := n || '→' || n2; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '팔로워 공개 글: 팔로우 전 안 보임 → 후 보임', '0→1', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m2, '점검', '[점검] 공개', (select images from public.posts where images is not null limit 1)) returning id into pid;
    insert into public.posts (user_id, author_name, content, images, visibility)
      values (m2, '점검', '[점검] 비공개', (select images from public.posts where images is not null limit 1), 'private') returning id into pid2;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
    select count(*) into n from public.posts where id in (pid, pid2);
    r := n::text; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '로그인 안 한 사람은 공개 글만', '1', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m2, '점검', '[점검] 지우기 대상', (select images from public.posts where images is not null limit 1)) returning id into pid;
    perform set_config('request.jwt.claims', cm1, true);
    delete from public.posts where id = pid; get diagnostics n = row_count;
    r := case when n > 0 then 'allowed' else 'blocked' end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '남의 글 지우기 막힘', 'blocked', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m1, '점검', '[점검] 내 글', (select images from public.posts where images is not null limit 1)) returning id into pid;
    delete from public.posts where id = pid; get diagnostics n = row_count;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.posts (user_id, author_name, content, images)
      values (m1, '점검', '[점검] 관리자가 지울 글', (select images from public.posts where images is not null limit 1)) returning id into pid2;
    perform set_config('request.jwt.claims', ca0, true);
    delete from public.posts where id = pid2; get diagnostics n2 = row_count;
    r := case when n = 1 and n2 = 1 then 'ok' else '본인 ' || n || ', 관리자 ' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '내 글 지우기 · 관리자가 지우기', 'ok', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m1, '점검', '[점검] 고치기', (select images from public.posts where images is not null limit 1)) returning id into pid;
    update public.posts set content = '[점검] 고침' where id = pid; get diagnostics n = row_count;
    r := case when n > 0 then 'allowed' else 'blocked' end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '앱에서 글 직접 고치기 막힘 (고치기는 서버가)', 'blocked', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
    select count(*) into n from public.posts;
    r := case when n > 0 then 'ok' else '0개' end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('글', '로그인 안 해도 공개 글 보임', 'ok', r, d);

  ------------------------------------------------------------ 기도·공감
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m2, '점검', '[점검] 공감 대상', (select images from public.posts where images is not null limit 1)) returning id into pid;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.post_reactions (post_id, user_id, reaction_type) values (pid, m1, 'pray');
    insert into public.post_reactions (post_id, user_id, reaction_type) values (pid, m1, 'like');
    select pray_count, like_count into c1, c2 from public.posts where id = pid;
    delete from public.post_reactions where post_id = pid and user_id = m1;
    select pray_count + like_count into n from public.posts where id = pid;
    r := case when c1 = 1 and c2 = 1 and n = 0 then 'ok' else '기도 ' || c1 || ', 공감 ' || c2 || ', 취소 뒤 ' || n end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('기도·공감', '기도·공감 누르기·취소, 숫자 바뀜', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m1, '점검', '[점검] 공감 기록', (select images from public.posts where images is not null limit 1)) returning id into pid;
    perform set_config('request.jwt.claims', cm2, true);
    insert into public.post_reactions (post_id, user_id, reaction_type) values (pid, m2, 'like');
    perform set_config('request.jwt.claims', cm1, true);
    select count(*) into n from public.post_reactions where post_id = pid and user_id = m2;
    r := n::text; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('기도·공감', '남이 누른 기록은 안 보임', '0', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images, visibility)
      values (m2, '점검', '[점검] 비공개', (select images from public.posts where images is not null limit 1), 'private') returning id into pid;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.post_reactions (post_id, user_id, reaction_type) values (pid, m1, 'like');
    r := 'allowed'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('기도·공감', '볼 수 없는 글에 누르기 막힘', 'blocked', r, d);

  ------------------------------------------------------------ 댓글
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images)
      values (m2, '점검', '[점검] 댓글 대상', (select images from public.posts where images is not null limit 1)) returning id into pid;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.comments (post_id, user_id, author_name, content) values (pid, m1, '점검', '[점검] 댓글') returning id::text into cid;
    perform set_config('request.jwt.claims', cm2, true);
    insert into public.comment_reactions (comment_id, user_id, reaction_type) values (cid, m2, 'like');
    r := 'ok'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('댓글', '댓글 달기 · 댓글 하트', 'ok', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images, visibility)
      values (m2, '점검', '[점검] 비공개', (select images from public.posts where images is not null limit 1), 'private') returning id into pid;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.comments (post_id, user_id, author_name, content) values (pid, m1, '점검', '[점검] 몰래 댓글');
    r := 'allowed'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('댓글', '볼 수 없는 글에 댓글 막힘', 'blocked', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.posts (user_id, author_name, content, images, visibility)
      values (m2, '점검', '[점검] 비공개', (select images from public.posts where images is not null limit 1), 'private') returning id into pid;
    insert into public.comments (post_id, user_id, author_name, content) values (pid, m2, '점검', '[점검] 비밀 댓글');
    perform set_config('request.jwt.claims', cm1, true);
    select count(*) into n from public.comments where post_id = pid;
    r := n::text; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('댓글', '남의 비공개 글 댓글 안 보임', '0', r, d);

  ------------------------------------------------------------ 메시지
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    delete from public.blocks where blocker_id = m1 and blocked_id = m2;
    perform set_config('request.jwt.claims', cm2, true);
    delete from public.blocks where blocker_id = m2 and blocked_id = m1;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.messages (sender_id, receiver_id, content) values (m1, m2, '[점검] 메시지') returning id into mid;
    perform set_config('request.jwt.claims', cm2, true);
    update public.messages set read_at = now() where id = mid; get diagnostics n = row_count;
    insert into public.message_reactions (message_id, user_id) values (mid, m2);
    r := case when n = 1 then 'ok' else '읽음 표시 ' || n end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('메시지', '보내기 · 읽음 표시 · 하트', 'ok', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.messages (sender_id, receiver_id, content) values (m2, m1, '[점검] 남인 척');
    r := 'allowed'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('메시지', '남인 척 보내기 막힘', 'blocked', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    delete from public.blocks where blocker_id = m1 and blocked_id = m2;
    perform set_config('request.jwt.claims', cm2, true);
    delete from public.blocks where blocker_id = m2 and blocked_id = m1;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.messages (sender_id, receiver_id, content) values (m1, m2, '[점검] 비밀 대화') returning id into mid;
    perform set_config('request.jwt.claims', ca0, true);
    select count(*) into n from public.messages where id = mid;
    begin
      perform set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
      select count(*) into n2 from public.messages where id = mid;
    exception when others then n2 := 0; end;
    r := n || '/' || n2; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('메시지', '다른 사람(관리자/비로그인)은 대화 못 봄', '0/0', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    delete from public.blocks where blocker_id = m1 and blocked_id = m2;
    perform set_config('request.jwt.claims', cm2, true);
    delete from public.blocks where blocker_id = m2 and blocked_id = m1;
    perform set_config('request.jwt.claims', cm1, true);
    insert into public.messages (sender_id, receiver_id, content) values (m1, m2, '[점검] 원래 글') returning id into mid;
    update public.messages set content = '[점검] 바꾼 글' where id = mid; get diagnostics n = row_count;
    r := case when n > 0 then 'allowed' else 'blocked' end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('메시지', '보낸 메시지 내용 몰래 바꾸기 막힘', 'blocked', r, d);

  ------------------------------------------------------------ 팔로우·차단
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    delete from public.blocks where blocker_id = m1 and blocked_id = m2;
    perform set_config('request.jwt.claims', cm2, true);
    delete from public.blocks where blocker_id = m2 and blocked_id = m1;
    perform set_config('request.jwt.claims', cm1, true);
    delete from public.follows where follower_id = m1 and following_id = m2;
    insert into public.follows (follower_id, following_id, status) values (m1, m2, 'accepted');
    select count(*) into n from public.follows where following_id = m2 and follower_id = m1;
    delete from public.follows where follower_id = m1 and following_id = m2; get diagnostics n2 = row_count;
    r := case when n = 1 and n2 = 1 then 'ok' else n || '/' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('팔로우·차단', '팔로우하기 · 취소', 'ok', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.follows (follower_id, following_id, status) values (m2, m1, 'accepted');
    r := 'allowed'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('팔로우·차단', '남인 척 팔로우 막힘', 'blocked', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    delete from public.blocks where blocker_id = m1 and blocked_id = m2;
    insert into public.blocks (blocker_id, blocked_id) values (m1, m2);
    select count(*) into n from public.blocks where blocker_id = m1 and blocked_id = m2;
    delete from public.blocks where blocker_id = m1 and blocked_id = m2; get diagnostics n2 = row_count;
    r := case when n = 1 and n2 = 1 then 'ok' else n || '/' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('팔로우·차단', '차단하기 · 차단 목록 보기 · 풀기', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    delete from public.blocks where blocker_id = m2 and blocked_id = m1;
    insert into public.blocks (blocker_id, blocked_id) values (m2, m1);
    perform set_config('request.jwt.claims', cm1, true);
    select count(*) into n from public.blocks where blocker_id = m2;
    r := n::text; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('팔로우·차단', '남의 차단 목록 안 보임', '0', r, d);

  ------------------------------------------------------------ 사연·건의·신고
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.letters (user_id, author_name, content, status) values (m1, '점검', '[점검] 사연', 'aired') returning id, status into xid, s;
    select count(*) into n from public.letters where id = xid;
    perform set_config('request.jwt.claims', cm2, true);
    select count(*) into n2 from public.letters where id = xid;
    perform set_config('request.jwt.claims', ca0, true);
    update public.letters set status = 'read' where id = xid; get diagnostics c1 = row_count;
    r := case when s = 'new' and n = 1 and n2 = 0 and c1 = 1 then 'ok'
      else '상태 ' || s || ', 내 것 ' || n || ', 남 ' || n2 || ', 관리자 ' || c1 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('사연·건의·신고', '사연: 보내기 · 내 것만 보임 · 관리자 처리 · 상태 위조 막힘', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.feedback (category, content) values ('suggestion', '[점검] 건의') returning id into xid;
    perform set_config('request.jwt.claims', cm2, true);
    select count(*) into n2 from public.feedback where id = xid;
    perform set_config('request.jwt.claims', ca0, true);
    update public.feedback set admin_reply = '[점검] 답변' where id = xid; get diagnostics c1 = row_count;
    r := case when n2 = 0 and c1 = 1 then 'ok' else '남 ' || n2 || ', 관리자 ' || c1 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('사연·건의·신고', '건의: 보내기 · 남은 못 봄 · 관리자 답변', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.reports (target_type, target_id, reason, status) values ('post', '점검', 'other', 'resolved') returning id, status into xid, s;
    perform set_config('request.jwt.claims', cm2, true);
    select count(*) into n2 from public.reports where id = xid;
    perform set_config('request.jwt.claims', ca0, true);
    update public.reports set admin_reply = '[점검] 답변' where id = xid; get diagnostics c1 = row_count;
    r := case when s = 'open' and n2 = 0 and c1 = 1 then 'ok' else '상태 ' || s || ', 남 ' || n2 || ', 관리자 ' || c1 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('사연·건의·신고', '신고: 보내기 · 남은 못 봄 · 관리자 답변 · 상태 위조 막힘', 'ok', r, d);

  ------------------------------------------------------------ 알림·검색·실명
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (m1, 'https://diag.invalid/' || gen_random_uuid(), 'x', 'x');
    select count(*) into n from public.push_subscriptions where user_id = m1;
    perform set_config('request.jwt.claims', cm2, true);
    select count(*) into n2 from public.push_subscriptions where user_id = m1;
    r := case when n >= 1 and n2 = 0 then 'ok' else '내 것 ' || n || ', 남 ' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('알림·검색·실명', '알림 켜기 · 남의 알림 기기 안 보임', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.interest_events (kind, value) values ('search', '점검');
    perform set_config('request.jwt.claims', cm2, true);
    select count(*) into n2 from public.interest_events where user_id = m1;
    perform set_config('request.jwt.claims', cm1, true);
    delete from public.interest_events where user_id = m1 and kind = 'search' and value = '점검'; get diagnostics n = row_count;
    r := case when n >= 1 and n2 = 0 then 'ok' else '지움 ' || n || ', 남 ' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('알림·검색·실명', '검색 기록 저장 · 지우기 · 남은 못 봄', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.profile_private (id, real_name) values (m1, '[점검]')
      on conflict (id) do update set real_name = excluded.real_name;
    perform set_config('request.jwt.claims', cm2, true);
    select count(*) into n2 from public.profile_private where id = m1;
    perform set_config('request.jwt.claims', ca0, true);
    select count(*) into n from public.profile_private where id = m1;
    r := case when n2 = 0 and n = 1 then 'ok' else '남 ' || n2 || ', 관리자 ' || n end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('알림·검색·실명', '실명 저장 · 남은 못 봄 · 관리자는 봄', 'ok', r, d);

  ------------------------------------------------------------ 프로필
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    update public.profiles set bio = bio where id = m1; get diagnostics n = row_count;
    perform set_config('request.jwt.claims', ca0, true);
    update public.profiles set badge_type = badge_type where id = m1; get diagnostics n2 = row_count;
    r := case when n = 1 and n2 = 1 then 'ok' else '본인 ' || n || ', 관리자 ' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('프로필', '내 소개 고치기 · 관리자 배지 달기', 'ok', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    update public.profiles set bio = bio where id = m2; get diagnostics n = row_count;
    r := case when n > 0 then 'allowed' else 'blocked' end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('프로필', '남의 프로필 고치기 막힘', 'blocked', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    perform email from public.profiles limit 1;
    r := 'allowed'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('프로필', '교우가 남의 이메일 읽기 막힘', 'blocked', r, d);

  r := null; d := null; onerr := 'blocked';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
    perform feast_day from public.profiles limit 1;
    r := 'allowed'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('프로필', '로그인 안 한 사람 축일 읽기 막힘', 'blocked', r, d);

  ------------------------------------------------------------ 사랑방
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.lounge_messages (content) values ('[점검] 사랑방') returning id into xid;
    r := 'ok'; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('사랑방', '교우가 사랑방에 글쓰기 (얼림·정지 중이면 ❌ 정상)', 'ok', r, d);

  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    select count(*) into n from public.lounge_trash;
    perform set_config('request.jwt.claims', ca0, true);
    select count(*) into n2 from public.lounge_trash;
    begin
      perform set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
      select count(*) into c1 from public.lounge_messages;
    exception when others then c1 := 0; end;
    r := case when n = 0 and c1 = 0 then 'ok' else '교우 보관함 ' || n || ', 비로그인 대화 ' || c1 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('사랑방', '지운 대화 보관함은 관리자만 · 비로그인은 대화 못 봄', 'ok', r, d);

  ------------------------------------------------------------ 기도지향
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm2, true); set local role authenticated;
    insert into public.prayer_intentions (user_id, author_name, content) values (m2, '점검', '[점검] 기도지향')
      on conflict (user_id, prayer_date) do update set content = excluded.content returning id into xid;
    perform set_config('request.jwt.claims', cm1, true);
    delete from public.intention_prayers where intention_id = xid and user_id = m1;
    insert into public.intention_prayers (intention_id, user_id) values (xid, m1);
    select count(*) into n from public.prayer_intentions where id = xid;
    select count(*) into n2 from public.prayer_intentions_feed where id = xid;
    r := case when n = 0 and n2 = 1 then 'ok' else '원본 ' || n || ', 보기 ' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('기도지향', '올리기 · 함께 기도 · 보기에는 나오지만 올린 사람은 숨김', 'ok', r, d);

  insert into t_out (영역, 시험, 기대, 결과, 자세히)
  select '기도지향', '기도지향 보기에 이름·아이디 칸 없음', 'ok',
    case when count(*) = 0 then 'ok' else string_agg(column_name, ', ') end, null
  from information_schema.columns where table_schema = 'public' and table_name = 'prayer_intentions_feed'
    and column_name in ('user_id', 'author_name', 'blocked');

  ------------------------------------------------------------ 익명 고민
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    insert into public.anon_posts (content) values ('[점검] 익명 고민');
    perform set_config('request.jwt.claims', cm2, true);
    select count(*) into n from public.anon_posts where content = '[점검] 익명 고민';
    select count(*) into n2 from public.anon_posts_feed where content = '[점검] 익명 고민';
    r := case when n = 0 and n2 = 1 then 'ok' else '원본 ' || n || ', 게시판 ' || n2 end; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('익명 고민', '쓰기 · 게시판엔 보이지만 쓴 사람은 숨김', 'ok', r, d);

  ------------------------------------------------------------ 사진 저장소
  r := null; d := null; onerr := 'error';
  begin
    perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', cm1, true); set local role authenticated;
    select count(*) into n from storage.objects where owner_id is distinct from m1::text;
    r := n::text; raise exception 'T_RB';
  exception when others then if sqlerrm <> 'T_RB' then r := onerr; d := sqlerrm; end if; end;
  insert into t_out (영역, 시험, 기대, 결과, 자세히) values ('사진 저장소', '남이 올린 파일 목록 안 보임', '0', r, d);
end $T$;

select 확인, 영역, 시험, 결과, 자세히 from (
  select 0 as k, 0 as n,
    case when count(*) filter (where 결과 is distinct from 기대) = 0 then '✅' else '❌' end as 확인,
    '요약' as 영역,
    '전체 ' || count(*) || '개 중 ✅ ' || count(*) filter (where 결과 = 기대) || '개' as 시험,
    null as 결과, null as 자세히
  from t_out
  union all
  select case when 결과 is distinct from 기대 then 1 else 2 end, n,
    case when 결과 is distinct from 기대 then '❌' else '✅' end, 영역, 시험,
    coalesce(결과, '?') || case when 결과 is distinct from 기대 then ' (기대: ' || 기대 || ')' else '' end,
    left(자세히, 120)
  from t_out
) s order by k, n;
