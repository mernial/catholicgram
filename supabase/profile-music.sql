-- 공간 음악·음악 선물·보관 음악
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, supabase/music.sql 다음)
--  * 보관 음악: 관리자가 '🔒 보관 음악'에 올린 곡(bgm_tracks.private) — 교우들의 음악 목록에는 안 보이고, 선물하거나 공개하면 쓰임
--  * profile_music: 'bgm:<배경음악 id>' (게시글 음악과 같은 꼴), profile_music_title: 곡 제목
--  * 관리자는 '가톨릭그램 음악'의 아무 곡이나. 교우는 관리자에게 선물받은 노래(music_grants)만
--    (예: 보이는 라디오 사연에 뽑힌 교우에게 그 사연으로 만든 노래를 선물 → 그 교우가 내 공간 음악으로)
--  * 읽는 것은 누구나 (공간을 연 사람의 휴대폰이 그 곡을 틀어야 하므로)
alter table public.profiles add column if not exists profile_music text;
alter table public.profiles add column if not exists profile_music_title text;

-- 앱이 두 칸을 읽을 수 있게 (profiles-email-private.sql 로 앱은 허락된 칸만 읽음)
grant select (profile_music, profile_music_title) on public.profiles to anon, authenticated;

alter table public.profiles drop constraint if exists profiles_profile_music_format;
alter table public.profiles add constraint profiles_profile_music_format
  check (profile_music is null or (profile_music ~ '^bgm:[A-Za-z0-9_-]{1,80}$' and char_length(coalesce(profile_music_title, '')) <= 80));

-- 보관 음악(비공개): 늘 목록에서 숨김(active = false) → 관리자와 선물받은 교우(그 교우의 공간·글을 연 사람)만
alter table public.bgm_tracks add column if not exists private boolean not null default false;
create or replace function public.bgm_private_hidden()
returns trigger language plpgsql as $$
begin
  if new.private then new.active := false; end if;
  return new;
end;
$$;
drop trigger if exists bgm_private_hidden on public.bgm_tracks;
create trigger bgm_private_hidden
before insert or update on public.bgm_tracks
for each row execute function public.bgm_private_hidden();

create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

-- 음악 선물 (관리자 → 교우): 받은 교우는 그 노래를 내 공간 음악으로 고를 수 있다
--  * letter_id: 사연으로 만든 노래면 그 사연 (보이는 라디오), note: 선물하며 남기는 말
--  * 교우는 자기가 받은 것만 보고, 주고 거두기는 관리자만
create table if not exists public.music_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.bgm_tracks(id) on delete cascade,
  letter_id uuid,
  note text check (note is null or char_length(note) <= 300),
  granted_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, track_id)
);
create index if not exists music_grants_user_idx on public.music_grants (user_id);

alter table public.music_grants enable row level security;

drop policy if exists "music_grants_select" on public.music_grants;
create policy "music_grants_select" on public.music_grants
  for select using (auth.uid() = user_id or public.is_app_admin());

drop policy if exists "music_grants_insert" on public.music_grants;
create policy "music_grants_insert" on public.music_grants
  for insert with check (public.is_app_admin());

drop policy if exists "music_grants_delete" on public.music_grants;
create policy "music_grants_delete" on public.music_grants
  for delete using (public.is_app_admin());

-- 선물한 노래는 '가톨릭그램 음악' 목록에서 숨겨(숨기기) 두어도 누구나 그 곡을 틀 수 있게 (그 교우의 공간을 연 사람)
create or replace function public.is_gifted_track(track uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.music_grants g where g.track_id = track);
$$;
revoke all on function public.is_gifted_track(uuid) from public;
grant execute on function public.is_gifted_track(uuid) to anon, authenticated;

drop policy if exists "bgm read" on public.bgm_tracks;
create policy "bgm read" on public.bgm_tracks for select
using (active or public.is_app_admin() or public.is_gifted_track(id));

-- 공간 음악을 넣거나 바꾸는 것: 관리자는 아무 곡, 교우는 선물받은 노래만 (끄기는 누구나). 대시보드에서 직접 고치는 것은 허용
create or replace function public.protect_profile_music()
returns trigger
language plpgsql
as $$
begin
  if public.is_app_admin()
     or auth.role() = 'service_role'
     or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.profile_music := null;
    new.profile_music_title := null;
    return new;
  end if;
  if new.profile_music is null then
    new.profile_music_title := null;
    return new;
  end if;
  if new.profile_music is distinct from old.profile_music or new.profile_music_title is distinct from old.profile_music_title then
    if not exists (
      select 1 from public.music_grants g
      where g.user_id = auth.uid() and new.profile_music = 'bgm:' || g.track_id::text
    ) then
      raise exception '선물받은 노래만 공간 음악으로 고를 수 있어요' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_music on public.profiles;
create trigger protect_profile_music
before insert or update on public.profiles
for each row execute function public.protect_profile_music();

-- 확인: 둘 다 '준비됨'이 나오면 정상
select
  case when exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'profile_music')
            and has_column_privilege('authenticated', 'public.profiles', 'profile_music', 'select')
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "공간 음악",
  case when to_regclass('public.music_grants') is not null then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "음악 선물",
  case when exists (select 1 from information_schema.columns where table_name = 'bgm_tracks' and column_name = 'private')
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "보관 음악";
