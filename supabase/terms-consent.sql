-- 이용약관·커뮤니티 규칙 동의한 때 (구글 플레이 UGC 정책: 글·사진·댓글을 올리기 전에 약관에 동의해야 하고 건너뛸 수 없어야 함)
--  * 가입(프로필 설정) 때 필수 체크, 이미 가입한 교우는 처음 글·댓글·메시지를 쓰려 할 때 동의 창 (components/TermsConsent)
--  * 본인 줄만 고칠 수 있는 것은 profiles 의 기존 정책 그대로. 앱이 읽을 수 있게 grant 가 필요하다(profiles-email-private.sql 로 앱은 허락된 칸만 읽음)
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
grant select (terms_accepted_at) on public.profiles to anon, authenticated;

-- 확인: 1 이 나오면 됨
select count(*) from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'terms_accepted_at';
