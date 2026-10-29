-- 공간 음악: 교우의 공간(또는 프로필 카드)을 누르면 흐르는 음악 — 지금은 관리자만 고를 수 있음 (관리자 '내 공간 → 🎵 공간 음악')
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--  * profile_music: 'bgm:<배경음악 id>' (게시글 음악과 같은 꼴, '가톨릭그램 음악' 목록의 곡), profile_music_title: 곡 제목
--  * 고치는 것은 관리자만 (아래 트리거). 읽는 것은 누구나 (공간을 연 사람의 휴대폰이 그 곡을 틀어야 하므로)
alter table public.profiles add column if not exists profile_music text;
alter table public.profiles add column if not exists profile_music_title text;

-- 앱이 두 칸을 읽을 수 있게 (profiles-email-private.sql 로 앱은 허락된 칸만 읽음)
grant select (profile_music, profile_music_title) on public.profiles to anon, authenticated;

alter table public.profiles drop constraint if exists profiles_profile_music_format;
alter table public.profiles add constraint profiles_profile_music_format
  check (profile_music is null or (profile_music ~ '^bgm:[A-Za-z0-9_-]{1,80}$' and char_length(coalesce(profile_music_title, '')) <= 80));

-- 관리자가 아니면 공간 음악을 넣거나 바꿀 수 없다 (자기 프로필이라도). 대시보드에서 직접 고치는 것은 허용
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
  elsif new.profile_music is distinct from old.profile_music or new.profile_music_title is distinct from old.profile_music_title then
    raise exception '공간 음악은 관리자만 정할 수 있어요' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_music on public.profiles;
create trigger protect_profile_music
before insert or update on public.profiles
for each row execute function public.protect_profile_music();

-- 확인: '준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'profile_music')
             and has_column_privilege('authenticated', 'public.profiles', 'profile_music', 'select')
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "공간 음악";
