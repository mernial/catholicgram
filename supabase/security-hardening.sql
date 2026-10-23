-- 보안·개인정보 점검 후 보강 (꼭 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, 없는 표·칸은 건너뜀)
--
-- 앱은 공개 키로 데이터베이스에 바로 접속하므로, 앱 밖에서 같은 키로 직접 요청해도 막히도록 서버(DB)에서 권한을 좁힌다.
-- '제한(restrictive)' 정책은 기존 정책에 더해 반드시 함께 지켜야 하는 조건이라, 대시보드에서 예전에 만든 정책이
-- 너그럽게 열려 있어도 아래 조건을 넘을 수 없다.
--
--  1) 글(posts): 앱은 글을 직접 고칠 수 없다 (고치기는 서버 /api/posts 가 본인 확인 후 처리). 기도·공감 수는 DB 가 센다.
--     글·댓글·반응은 본인 이름으로만 쓰고, 글 지우기는 본인·관리자만. 작성자 이름은 프로필 이름으로 채운다.
--     스토리는 24시간이 지나면 본인·관리자만 볼 수 있다.
--  2) 1:1 메시지: 보낸 사람·받은 사람만 읽고, 받은 사람은 읽음 표시만 바꿀 수 있다.
--  3) 팔로우: 남의 팔로우 기록을 고칠 수 없다. 댓글: 직접 고칠 수 없다 (고치기는 서버).
--  4) 프로필: 본인(뱃지는 관리자)만 쓴다. 이메일 칸을 로그인 정보로 바로잡는다.
--  5) 신고·사연·건의: 상태·답변·선물 표시를 보낸 사람이 정할 수 없고, 한 시간에 보낼 수 있는 수를 제한.
--  6) is_blocked: 남들끼리의 차단 여부를 알아낼 수 없게.
--  7) 기도지향 보기: '차단' 표시로 올린 사람을 알아낼 수 없게 그 칸을 뺀다.
--  8) 사랑방 지운 대화 보관함은 30일이 지나면 정리.

create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

------------------------------------------------------------
-- 1) 글·댓글·반응
------------------------------------------------------------
-- 기도·공감 수는 반응이 생기거나 없어질 때 DB 가 다시 센다
do $$
begin
  if to_regclass('public.post_reactions') is not null and to_regclass('public.posts') is not null then
    execute $f$
      create or replace function public.post_reaction_counts()
      returns trigger language plpgsql security definer set search_path = public as $b$
      declare pid public.post_reactions.post_id%type;
      begin
        if tg_op = 'DELETE' then pid := old.post_id; else pid := new.post_id; end if;
        update posts set
          pray_count = (select count(*) from post_reactions where post_id = pid and reaction_type = 'pray'),
          like_count = (select count(*) from post_reactions where post_id = pid and reaction_type = 'like')
        where id = pid;
        return null;
      end $b$;
    $f$;
    execute 'drop trigger if exists post_reaction_counts on public.post_reactions';
    execute 'create trigger post_reaction_counts after insert or delete on public.post_reactions for each row execute function public.post_reaction_counts()';
    -- 지금 숫자를 한 번 맞춰 둔다
    update public.posts p set
      pray_count = (select count(*) from public.post_reactions r where r.post_id = p.id and r.reaction_type = 'pray'),
      like_count = (select count(*) from public.post_reactions r where r.post_id = p.id and r.reaction_type = 'like');

    revoke update on public.post_reactions from anon, authenticated;
    execute 'drop policy if exists "reactions own insert (restrictive)" on public.post_reactions';
    execute 'create policy "reactions own insert (restrictive)" on public.post_reactions as restrictive for insert to anon, authenticated with check (user_id = auth.uid())';
    execute 'drop policy if exists "reactions own delete (restrictive)" on public.post_reactions';
    execute 'create policy "reactions own delete (restrictive)" on public.post_reactions as restrictive for delete to anon, authenticated using (user_id = auth.uid())';
  end if;
end $$;

-- 글: 앱에서 직접 고치기 금지, 본인 이름으로만 쓰기, 지우기는 본인·관리자
revoke update on public.posts from anon, authenticated;
drop policy if exists "posts own insert (restrictive)" on public.posts;
create policy "posts own insert (restrictive)" on public.posts as restrictive for insert to anon, authenticated
with check (user_id = auth.uid());
drop policy if exists "posts own delete (restrictive)" on public.posts;
create policy "posts own delete (restrictive)" on public.posts as restrictive for delete to anon, authenticated
using (user_id = auth.uid() or public.is_app_admin());

-- 스토리는 24시간이 지나면 본인·관리자만
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'is_story') then
    execute 'drop policy if exists "stories expire (restrictive)" on public.posts';
    execute $p$create policy "stories expire (restrictive)" on public.posts as restrictive for select to anon, authenticated
      using (coalesce(is_story, false) = false or created_at > now() - interval '24 hours' or user_id = auth.uid() or public.is_app_admin())$p$;
  end if;
end $$;

-- 댓글: 본인 이름으로만 쓰기, 앱에서 직접 고치기 금지 (고치기는 서버 /api/comments)
drop policy if exists "comments update own" on public.comments;
revoke update on public.comments from anon, authenticated;
drop policy if exists "comments own insert (restrictive)" on public.comments;
create policy "comments own insert (restrictive)" on public.comments as restrictive for insert to anon, authenticated
with check (user_id = auth.uid());

-- 글·댓글 작성자 이름은 프로필 이름으로 (다른 사람이나 '관리자'인 척 못 하게)
create or replace function public.set_author_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.author_name := coalesce((select baptismal_name from profiles where id = auth.uid()), new.author_name);
  end if;
  return new;
end $$;
drop trigger if exists set_author_from_profile on public.posts;
create trigger set_author_from_profile before insert on public.posts
for each row execute function public.set_author_from_profile();
drop trigger if exists set_author_from_profile on public.comments;
create trigger set_author_from_profile before insert on public.comments
for each row execute function public.set_author_from_profile();
-- 답글 받는 사람 이름도 그 사람의 프로필 이름으로
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'reply_to_user_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'reply_to_name') then
    execute $f$
      create or replace function public.set_reply_name_from_profile()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        if auth.uid() is not null and new.reply_to_user_id is not null then
          new.reply_to_name := coalesce((select baptismal_name from profiles where id = new.reply_to_user_id), new.reply_to_name);
        end if;
        return new;
      end $b$;
    $f$;
    execute 'drop trigger if exists set_reply_name_from_profile on public.comments';
    execute 'create trigger set_reply_name_from_profile before insert on public.comments for each row execute function public.set_reply_name_from_profile()';
  end if;
end $$;

------------------------------------------------------------
-- 2) 1:1 메시지: 두 사람만 읽고, 받은 사람은 읽음 표시만
------------------------------------------------------------
drop policy if exists "dm only participants (restrictive)" on public.messages;
create policy "dm only participants (restrictive)" on public.messages as restrictive for select to anon, authenticated
using (auth.uid()::text in (sender_id::text, receiver_id::text));
drop policy if exists "dm send as self (restrictive)" on public.messages;
create policy "dm send as self (restrictive)" on public.messages as restrictive for insert to anon, authenticated
with check (auth.uid()::text = sender_id::text);
revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;
revoke delete on public.messages from anon, authenticated; -- 지우기는 서버(/api/messages)가 보관 후 처리

------------------------------------------------------------
-- 3) 팔로우: 받은 사람이 남의 팔로우 기록을 고치지 못하게 (팔로우는 바로 되므로 수정이 필요 없음)
------------------------------------------------------------
drop policy if exists "follows accept" on public.follows;
revoke update on public.follows from anon, authenticated;

------------------------------------------------------------
-- 4) 프로필: 본인만 쓰기 (뱃지는 관리자, 기존 트리거가 지킴), 이메일 칸 바로잡기
------------------------------------------------------------
drop policy if exists "profiles own write (restrictive)" on public.profiles;
create policy "profiles own write (restrictive)" on public.profiles as restrictive for insert to anon, authenticated
with check (id = auth.uid());
drop policy if exists "profiles own update (restrictive)" on public.profiles;
create policy "profiles own update (restrictive)" on public.profiles as restrictive for update to anon, authenticated
using (id = auth.uid() or public.is_app_admin()) with check (id = auth.uid() or public.is_app_admin());
revoke delete on public.profiles from anon, authenticated;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') then
    update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;
  end if;
end $$;

------------------------------------------------------------
-- 5) 신고·사연·건의: 보낸 사람이 상태·답변·선물을 정하지 못하게, 한 시간에 보낼 수 있는 수 제한
------------------------------------------------------------
create or replace function public.reports_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new := jsonb_populate_record(new, jsonb_build_object('status', 'open', 'admin_reply', null, 'replied_at', null, 'created_at', now()));
  new.reporter_id := auth.uid();
  return new;
end $$;
drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert before insert on public.reports
for each row execute function public.reports_before_insert();

do $$
begin
  if to_regclass('public.letters') is not null then
    execute $f$
      create or replace function public.letters_before_insert()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        if auth.uid() is null then return new; end if;
        new := jsonb_populate_record(new, jsonb_build_object('status', 'new', 'gift', false, 'created_at', now()));
        new.user_id := auth.uid();
        new.author_name := coalesce((select baptismal_name from profiles where id = auth.uid()), new.author_name);
        return new;
      end $b$;
    $f$;
    execute 'drop trigger if exists letters_before_insert on public.letters';
    execute 'create trigger letters_before_insert before insert on public.letters for each row execute function public.letters_before_insert()';
  end if;
end $$;

-- 한 시간에 보낼 수 있는 수 (서버가 넣는 것은 제한 없음)
create or replace function public.limit_per_hour()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - interval ''1 hour''', tg_table_schema, tg_table_name, tg_argv[0])
    into n using auth.uid();
  if n >= tg_argv[1]::int then raise exception '잠시 후 다시 보내 주세요. (한 시간에 보낼 수 있는 수를 넘었어요)'; end if;
  return new;
end $$;
drop trigger if exists a_limit_per_hour on public.reports;
create trigger a_limit_per_hour before insert on public.reports for each row execute function public.limit_per_hour('reporter_id', '10');
do $$
begin
  if to_regclass('public.letters') is not null then
    execute 'drop trigger if exists a_limit_per_hour on public.letters';
    execute $t$create trigger a_limit_per_hour before insert on public.letters for each row execute function public.limit_per_hour('user_id', '5')$t$;
  end if;
  if to_regclass('public.feedback') is not null then
    execute 'drop trigger if exists a_limit_per_hour on public.feedback';
    execute $t$create trigger a_limit_per_hour before insert on public.feedback for each row execute function public.limit_per_hour('user_id', '5')$t$;
  end if;
end $$;

------------------------------------------------------------
-- 6) is_blocked: 나와 관련된 차단만 확인 (남들끼리의 차단 여부를 알아낼 수 없게)
------------------------------------------------------------
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where blocker_id = a and blocked_id = b)
     and (auth.uid() in (a, b) or auth.role() = 'service_role');
$$;
revoke execute on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid) to authenticated, service_role;

------------------------------------------------------------
-- 7) 기도지향 보기: 'blocked' 칸을 빼서 차단으로 올린 사람을 알아내지 못하게
------------------------------------------------------------
do $$
begin
  if to_regclass('public.prayer_intentions') is not null then
    execute 'drop view if exists public.prayer_intentions_feed';
    execute $v$
      create view public.prayer_intentions_feed as
      select i.id, i.title, i.content, i.prayer_date, i.created_at, coalesce(i.user_id = auth.uid(), false) as is_mine
      from public.prayer_intentions i
    $v$;
    execute 'revoke all on public.prayer_intentions_feed from public';
    execute 'grant select on public.prayer_intentions_feed to anon, authenticated';
  end if;
end $$;

------------------------------------------------------------
-- 8) 사랑방 지운 대화 보관함: 30일이 지나면 정리 (지울 때마다)
------------------------------------------------------------
do $$
begin
  if to_regclass('public.lounge_trash') is not null then
    execute $f$
      create or replace function public.lounge_before_delete()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        if old.created_at >= lounge_today_start() then
          insert into lounge_trash (id, user_id, content, created_at, deleted_by)
          values (old.id, old.user_id, old.content, old.created_at, auth.uid())
          on conflict (id) do nothing;
        end if;
        delete from lounge_trash where deleted_at < now() - interval '30 days';
        return old;
      end $b$;
    $f$;
  end if;
end $$;

------------------------------------------------------------
-- 확인: 아래 표에서 '앱이 글을 직접 고칠 수 있나'가 false 면 됨
------------------------------------------------------------
select
  has_table_privilege('authenticated', 'public.posts', 'update') as "앱이 글을 직접 고칠 수 있나",
  has_column_privilege('authenticated', 'public.messages', 'content', 'update') as "앱이 메시지 내용을 고칠 수 있나",
  has_column_privilege('authenticated', 'public.messages', 'read_at', 'update') as "읽음 표시는 되나(true 여야 함)";
