-- 팔로우 요청/수락 + 메시지 읽음 표시
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.

------------------------------------------------------------
-- 1) 팔로우: 요청(pending) → 수락(accepted)
------------------------------------------------------------
alter table public.follows add column if not exists status text not null default 'accepted';  -- 기존 팔로우는 수락된 것으로 유지
alter table public.follows add column if not exists created_at timestamptz not null default now();

-- 같은 사람을 여러 번 팔로우한 중복 기록 정리 (숫자가 틀어지던 원인) 후 중복 방지
delete from public.follows a using public.follows b
where a.ctid < b.ctid and a.follower_id = b.follower_id and a.following_id = b.following_id;
create unique index if not exists follows_follower_following_key on public.follows (follower_id, following_id);

-- 기존 정책을 모두 지우고 새로 설정
alter table public.follows enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'follows' loop
    execute format('drop policy %I on public.follows', p.policyname);
  end loop;
end $$;

-- 수락된 팔로우는 누구나 볼 수 있음(팔로워/팔로잉 숫자), 요청 중인 것은 당사자만
create policy "follows read" on public.follows for select
using (status = 'accepted' or auth.uid()::text in (follower_id::text, following_id::text));
-- 본인 이름으로 '요청'만 보낼 수 있음
create policy "follows request" on public.follows for insert
with check (auth.uid()::text = follower_id::text and status = 'pending');
-- 요청받은 사람만 수락할 수 있음
create policy "follows accept" on public.follows for update
using (auth.uid()::text = following_id::text)
with check (auth.uid()::text = following_id::text and status = 'accepted');
-- 언팔로우/요청 취소(보낸 사람), 거절/팔로워 삭제(받은 사람)
create policy "follows remove" on public.follows for delete
using (auth.uid()::text in (follower_id::text, following_id::text));

------------------------------------------------------------
-- 2) 메시지 읽음 표시
------------------------------------------------------------
alter table public.messages add column if not exists read_at timestamptz;

-- 받은 사람은 읽음 표시만 할 수 있음
drop policy if exists "dm mark read" on public.messages;
create policy "dm mark read" on public.messages for update
using (auth.uid()::text = receiver_id::text)
with check (auth.uid()::text = receiver_id::text);

create or replace function public.messages_only_read_at()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if new.content is distinct from old.content
     or new.sender_id is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id
     or new.created_at is distinct from old.created_at then
    raise exception '메시지 내용은 수정할 수 없습니다';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_only_read_at on public.messages;
create trigger messages_only_read_at before update on public.messages
for each row execute function public.messages_only_read_at();
