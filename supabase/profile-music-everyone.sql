-- 모든 교우가 내 공간 배경음악을 '가톨릭그램 음악'에서 고르게 (운영자 요청 2026-11-01)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전, supabase/profile-music.sql 다음)
-- 예전에는 교우는 관리자에게 선물받은 노래만 고를 수 있었음. 이 SQL 은 그 검사(protect_profile_music)만 바꿈
-- 공간 음악(배경음악)을 넣거나 바꾸는 것 (운영자 요청 2026-11-01: 모든 교우가 '가톨릭그램 음악'에서 고르게):
--  관리자는 아무 곡, 교우는 ① 앱에 들어 있는 곡(builtin-·cc-) ② 관리자가 공개로 올린 곡(목록에 보이는 곡)
--  ③ 선물받은 노래 — 보관 음악(비공개)은 선물받은 교우만. 끄기는 누구나. 대시보드에서 직접 고치는 것은 허용
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
    if not (
      new.profile_music ~ '^bgm:(builtin|cc)-[a-z0-9-]{1,70}$'
      or exists (
        select 1 from public.bgm_tracks t
        where new.profile_music = 'bgm:' || t.id::text and t.active and not t.private
      )
      or exists (
        select 1 from public.music_grants g
        where g.user_id = auth.uid() and new.profile_music = 'bgm:' || g.track_id::text
      )
    ) then
      raise exception '가톨릭그램 음악에서만 배경음악을 고를 수 있어요' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- 확인: '✅ 준비됨'이 나오면 정상
select case when pg_get_functiondef('public.protect_profile_music'::regproc) like '%builtin|cc%'
       then '✅ 준비됨' else '❌ 다시 실행해 주세요' end as "모든 교우 배경음악";
