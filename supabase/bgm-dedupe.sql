-- 음악 중복 막기·정리 (관리자 음악 올리기 components/BgmAdmin, lib/audio-dedupe.ts)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, supabase/music.sql 다음)
--  * content_hash: 소리 부분의 지문(같은 파일·꼬리표만 다른 파일), audio_print: 소리 크기 줄(다른 형식·음질의 같은 노래)
--    → 올릴 때 이미 있는 곡이면 '중복'이라고 알려 줌. 예전에 올린 곡은 관리자가 음악 관리 창을 열 때 채워짐
--  * merge_bgm_track(지울 곡, 남길 곡): 같은 노래가 둘 이상이면 하나만 남김 — 지울 곡을 쓰던 게시글 음악·내 공간 배경음악·
--    노래 선물을 남길 곡으로 옮긴 뒤 지움 (남길 곡은 다른 bgm_tracks 줄 또는 앱 기본 곡 'builtin-…'). 관리자만
alter table public.bgm_tracks add column if not exists content_hash text;
alter table public.bgm_tracks add column if not exists audio_print text;
create index if not exists bgm_tracks_content_hash_idx on public.bgm_tracks (content_hash);

create or replace function public.is_app_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr', false);
$$;

create or replace function public.merge_bgm_track(drop_id uuid, keep_ref text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_uuid uuid;
  keep_title text;
  drop_ref text := 'bgm:' || drop_id::text;
  n_posts int := 0;
  n_profiles int := 0;
  n_grants int := 0;
begin
  if not public.is_app_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
  if keep_ref is null or keep_ref !~ '^[A-Za-z0-9_-]{1,80}$' or keep_ref = drop_id::text then
    raise exception '남길 곡이 올바르지 않아요' using errcode = '22023';
  end if;
  if not exists (select 1 from public.bgm_tracks where id = drop_id) then
    return json_build_object('dropped', false);
  end if;

  begin
    keep_uuid := keep_ref::uuid;
  exception when invalid_text_representation then
    keep_uuid := null;
  end;
  if keep_uuid is not null then
    select title into keep_title from public.bgm_tracks where id = keep_uuid;
    if keep_title is null then
      raise exception '남길 곡이 없어요' using errcode = '22023';
    end if;
  elsif keep_ref !~ '^builtin-' then
    raise exception '남길 곡이 올바르지 않아요' using errcode = '22023';
  end if;

  -- 게시글 음악: 'bgm:<id>' 또는 'bgm:<id>@시작+구간'
  update public.posts
     set music = 'bgm:' || keep_ref || substr(music, length(drop_ref) + 1)
   where music = drop_ref or music like drop_ref || '@%';
  get diagnostics n_posts = row_count;

  -- 내 공간 배경음악 (supabase/profile-music.sql 전이면 칸이 없음)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'profile_music') then
    execute 'update public.profiles set profile_music = $1, profile_music_title = coalesce($2, profile_music_title) where profile_music = $3'
      using 'bgm:' || keep_ref, keep_title, drop_ref;
    get diagnostics n_profiles = row_count;
  end if;

  -- 노래 선물: 남길 곡으로 옮김 (앱 기본 곡에는 선물을 옮길 수 없어 그대로 둠)
  if to_regclass('public.music_grants') is not null then
    if keep_uuid is null then
      execute 'select count(*) from public.music_grants where track_id = $1' into n_grants using drop_id;
      if n_grants > 0 then
        raise exception '선물한 노래는 앱 기본 곡으로 합칠 수 없어요' using errcode = '22023';
      end if;
    else
      execute 'insert into public.music_grants (user_id, track_id, letter_id, note, granted_by, created_at)
               select user_id, $1, letter_id, note, granted_by, created_at from public.music_grants where track_id = $2
               on conflict (user_id, track_id) do nothing' using keep_uuid, drop_id;
      get diagnostics n_grants = row_count;
    end if;
  end if;

  delete from public.bgm_tracks where id = drop_id;
  return json_build_object('dropped', true, 'posts', n_posts, 'profiles', n_profiles, 'grants', n_grants);
end;
$$;
revoke all on function public.merge_bgm_track(uuid, text) from public;
grant execute on function public.merge_bgm_track(uuid, text) to authenticated;

-- 확인: '✅ 준비됨'이 나오면 정상
select case when exists (select 1 from information_schema.columns where table_name = 'bgm_tracks' and column_name = 'audio_print')
             and to_regprocedure('public.merge_bgm_track(uuid, text)') is not null
            then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "음악 중복 정리";
