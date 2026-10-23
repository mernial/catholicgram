-- 회원 이메일 감추기 (보안, 꼭 실행)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- profiles 표는 피드에 이름·사진을 보여 주려고 누구나(로그인 안 한 사람 포함) 읽을 수 있는데,
-- 이메일 칸까지 함께 열려 있어 공개 키만으로 회원 이메일 목록을 받아 갈 수 있었다.
-- 이제 앱은 아래에 적은 칸만 읽을 수 있고, 이메일·가입일 등 나머지 칸은 서버(관리자 화면·알림, service_role)만 읽는다.
-- ※ 나중에 profiles 에 앱이 읽어야 하는 칸을 새로 만들면 그 칸도 grant select (칸) ... to anon, authenticated 해야 한다.

------------------------------------------------------------
-- 1) 앱이 읽는 칸만 허용 (나머지 칸은 읽기 금지)
------------------------------------------------------------
revoke select on table public.profiles from anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name in ('id', 'baptismal_name', 'avatar_url', 'handle', 'badge_type', 'feast_day', 'nickname_set', 'bio');
  execute format('grant select (%s) on public.profiles to anon, authenticated', cols);
  raise notice '앱이 읽을 수 있는 칸: %', cols;
end $$;

------------------------------------------------------------
-- 2) 이메일은 앱이 보내지 않고, 서버가 로그인 정보(auth.users)에서 채운다 (관리자 찾기 등 서버에서만 씀)
------------------------------------------------------------
create or replace function public.profiles_fill_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := (select u.email from auth.users u where u.id = new.id);
  return new;
end $$;

drop trigger if exists profiles_fill_email on public.profiles;
create trigger profiles_fill_email before insert or update on public.profiles
for each row execute function public.profiles_fill_email();

------------------------------------------------------------
-- 3) 확인: 둘 다 false 가 나오면 이메일이 감춰진 것
------------------------------------------------------------
select
  has_column_privilege('anon', 'public.profiles', 'email', 'select') as "로그인 안 한 사람이 이메일을 읽을 수 있나",
  has_column_privilege('authenticated', 'public.profiles', 'email', 'select') as "교우가 이메일을 읽을 수 있나";
