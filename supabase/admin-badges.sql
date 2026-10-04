-- 인증 뱃지(badge_type)는 관리자만 지정/변경할 수 있도록 하는 설정
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
-- 관리자 이메일을 바꾸려면 아래 두 곳의 이메일과 app/page.tsx 의 ADMIN_EMAILS 를 함께 바꿔야 합니다.

-- 1) 관리자는 다른 사람의 프로필(뱃지)을 수정할 수 있다
drop policy if exists "admins can update profiles" on public.profiles;
create policy "admins can update profiles"
on public.profiles for update
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 2) 관리자가 아닌 사람은 badge_type 을 바꿀 수 없다 (자기 프로필이라도)
--    Supabase 대시보드(Table Editor, SQL Editor)에서 직접 바꾸는 것은 허용
create or replace function public.protect_badge_type()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') = 'yunho-jo@casuwon.or.kr'
     or auth.role() = 'service_role'
     or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.badge_type := null;
  elsif new.badge_type is distinct from old.badge_type then
    raise exception '인증 뱃지는 관리자만 변경할 수 있습니다';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_badge_type on public.profiles;
create trigger protect_badge_type
before insert or update on public.profiles
for each row execute function public.protect_badge_type();
