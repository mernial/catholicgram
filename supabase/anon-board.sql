-- 익명 고민상담 게시판
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
--
-- 익명성 원칙
--  * 누가 썼는지(user_id)는 테이블에만 저장하고, 앱에서는 테이블을 직접 읽을 수 없다.
--  * 앱은 user_id 가 빠진 보기(view)로만 글을 읽는다. 대신 "내 글인지(is_mine)"만 알려준다.
--  * 익명 코드는 서버(트리거)가 정하므로 다른 사람의 코드를 흉내 낼 수 없다.
--  * 같은 고민글 안에서는 같은 사람이 같은 코드를 쓰고, 글쓴이의 답글에는 (작성자) 표시.

------------------------------------------------------------
-- 테이블
------------------------------------------------------------
create table if not exists public.anon_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anon_code text not null default '',
  content text not null check (char_length(content) between 1 and 2000),
  expires_at timestamptz,               -- null 이면 자동 삭제 안 함
  created_at timestamptz not null default now()
);

create table if not exists public.anon_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.anon_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anon_code text not null default '',
  is_post_author boolean not null default false,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists anon_replies_post_idx on public.anon_replies (post_id, created_at);

create table if not exists public.anon_reactions (
  post_id uuid not null references public.anon_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('pray', 'like', 'cheer')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

------------------------------------------------------------
-- 익명 코드 (헷갈리는 0/O, 1/I 제외한 4자리)
------------------------------------------------------------
create or replace function public.anon_random_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
  from generate_series(1, 4);
$$;

-- 새 고민글: 작성자/코드/시간은 서버가 정하고, 지난 글은 이때 함께 정리
create or replace function public.anon_posts_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  new.user_id := auth.uid();
  new.anon_code := anon_random_code();
  new.created_at := now();
  if new.expires_at is not null then
    new.expires_at := least(greatest(new.expires_at, now() + interval '10 minutes'), now() + interval '30 days');
  end if;
  delete from anon_posts where expires_at is not null and expires_at < now();
  return new;
end;
$$;
drop trigger if exists anon_posts_before_insert on public.anon_posts;
create trigger anon_posts_before_insert before insert on public.anon_posts
for each row execute function public.anon_posts_before_insert();

-- 새 답글: 글쓴이면 (작성자) + 글 코드, 이미 답글 단 사람이면 같은 코드, 아니면 새 코드
create or replace function public.anon_replies_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  post_row anon_posts%rowtype;
  existing_code text;
  candidate text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select * into post_row from anon_posts where id = new.post_id;
  if not found or (post_row.expires_at is not null and post_row.expires_at < now()) then
    raise exception '삭제되었거나 기간이 지난 글입니다';
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  if post_row.user_id = new.user_id then
    new.is_post_author := true;
    new.anon_code := post_row.anon_code;
    return new;
  end if;
  new.is_post_author := false;
  select anon_code into existing_code from anon_replies
  where post_id = new.post_id and user_id = new.user_id limit 1;
  if existing_code is not null then
    new.anon_code := existing_code;
    return new;
  end if;
  loop
    candidate := anon_random_code();
    exit when candidate <> post_row.anon_code
      and not exists (select 1 from anon_replies where post_id = new.post_id and anon_code = candidate);
  end loop;
  new.anon_code := candidate;
  return new;
end;
$$;
drop trigger if exists anon_replies_before_insert on public.anon_replies;
create trigger anon_replies_before_insert before insert on public.anon_replies
for each row execute function public.anon_replies_before_insert();

------------------------------------------------------------
-- 권한: 테이블은 쓰기(본인 이름으로)만 가능, 직접 읽기 불가
------------------------------------------------------------
alter table public.anon_posts enable row level security;
alter table public.anon_replies enable row level security;
alter table public.anon_reactions enable row level security;

drop policy if exists "anon posts insert" on public.anon_posts;
create policy "anon posts insert" on public.anon_posts for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "anon replies insert" on public.anon_replies;
create policy "anon replies insert" on public.anon_replies for insert to authenticated
with check (user_id = auth.uid());
-- (읽기/수정/삭제 정책이 없으므로 앱에서 테이블을 직접 읽거나 지울 수 없음)

------------------------------------------------------------
-- 앱이 읽는 보기 (user_id 없음, 기간 지난 글 제외)
------------------------------------------------------------
create or replace view public.anon_posts_feed as
select
  p.id,
  p.anon_code,
  p.content,
  p.expires_at,
  p.created_at,
  (p.user_id = auth.uid()) as is_mine,
  (select count(*) from public.anon_replies r where r.post_id = p.id)::int as reply_count,
  (select count(*) from public.anon_reactions x where x.post_id = p.id and x.reaction = 'pray')::int as pray_count,
  (select count(*) from public.anon_reactions x where x.post_id = p.id and x.reaction = 'like')::int as like_count,
  (select count(*) from public.anon_reactions x where x.post_id = p.id and x.reaction = 'cheer')::int as cheer_count,
  coalesce((select array_agg(x.reaction) from public.anon_reactions x
            where x.post_id = p.id and x.user_id = auth.uid()), '{}') as my_reactions
from public.anon_posts p
where p.expires_at is null or p.expires_at > now();

create or replace view public.anon_replies_feed as
select r.id, r.post_id, r.anon_code, r.is_post_author, r.content, r.created_at,
       (r.user_id = auth.uid()) as is_mine
from public.anon_replies r
join public.anon_posts p on p.id = r.post_id
where p.expires_at is null or p.expires_at > now();

revoke all on public.anon_posts_feed, public.anon_replies_feed from anon, public;
grant select on public.anon_posts_feed, public.anon_replies_feed to authenticated;

------------------------------------------------------------
-- 삭제 / 감정 표현 (본인 또는 관리자만)
------------------------------------------------------------
create or replace function public.delete_anon_post(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from anon_posts
  where id = p_id and (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
$$;

create or replace function public.delete_anon_reply(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from anon_replies
  where id = p_id and (user_id = auth.uid() or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
$$;

create or replace function public.toggle_anon_reaction(p_post uuid, p_reaction text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_reaction not in ('pray', 'like', 'cheer') then raise exception '잘못된 반응입니다'; end if;
  if exists (select 1 from anon_reactions where post_id = p_post and user_id = auth.uid() and reaction = p_reaction) then
    delete from anon_reactions where post_id = p_post and user_id = auth.uid() and reaction = p_reaction;
  elsif exists (select 1 from anon_posts where id = p_post and (expires_at is null or expires_at > now())) then
    insert into anon_reactions (post_id, user_id, reaction) values (p_post, auth.uid(), p_reaction);
  end if;
end;
$$;

revoke execute on function public.delete_anon_post(uuid), public.delete_anon_reply(uuid),
  public.toggle_anon_reaction(uuid, text) from anon, public;
grant execute on function public.delete_anon_post(uuid), public.delete_anon_reply(uuid),
  public.toggle_anon_reaction(uuid, text) to authenticated;

------------------------------------------------------------
-- 기간 지난 글 자동 삭제 (10분마다). pg_cron 을 쓸 수 없어도
-- 기간 지난 글은 화면에 보이지 않고, 새 글을 쓸 때 함께 정리된다.
------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('anon-board-cleanup', '*/10 * * * *',
    $job$delete from public.anon_posts where expires_at is not null and expires_at < now()$job$);
exception when others then
  raise notice 'pg_cron 을 사용할 수 없어 예약 삭제는 건너뜁니다: %', sqlerrm;
end $$;
