-- 후원 배너
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요.
-- 관리자 이메일을 바꾸려면 'yunho-jo@casuwon.or.kr' 와 lib/admin.ts 를 함께 바꾸세요.

create table if not exists public.sponsor_banners (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,                 -- 후원 업체 이름
  title text not null,                        -- 배너 문구
  description text,                           -- 보조 문구
  image_url text,                             -- 배너 이미지 (없으면 글자 배너)
  link_url text,                              -- 눌렀을 때 이동할 주소
  placement text not null default 'both' check (placement in ('top', 'feed', 'both')),
  starts_at timestamptz,                      -- 비우면 바로 시작
  ends_at timestamptz,                        -- 비우면 계속
  active boolean not null default true,
  priority int not null default 0,            -- 높을수록 먼저
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.sponsor_banners enable row level security;

-- 누구나 '지금 진행 중인' 배너를 볼 수 있음, 관리자는 전체
drop policy if exists "banners read" on public.sponsor_banners;
create policy "banners read" on public.sponsor_banners for select
using (
  (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
  or (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr'
);

drop policy if exists "banners admin write" on public.sponsor_banners;
create policy "banners admin write" on public.sponsor_banners for all to authenticated
using ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr')
with check ((auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

-- 노출/클릭 수 기록 (누구나 호출 가능, 진행 중인 배너만 증가)
create or replace function public.record_banner_event(p_id uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  update sponsor_banners
  set impressions = impressions + case when p_kind = 'view' then 1 else 0 end,
      clicks = clicks + case when p_kind = 'click' then 1 else 0 end
  where id = p_id and active
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
$$;
grant execute on function public.record_banner_event(uuid, text) to anon, authenticated;

-- 배너 이미지 저장소 (공개 읽기, 관리자만 업로드/삭제)
insert into storage.buckets (id, name, public)
values ('sponsor-banners', 'sponsor-banners', true)
on conflict (id) do update set public = true;

drop policy if exists "sponsor banner images admin insert" on storage.objects;
create policy "sponsor banner images admin insert" on storage.objects for insert to authenticated
with check (bucket_id = 'sponsor-banners' and (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "sponsor banner images admin update" on storage.objects;
create policy "sponsor banner images admin update" on storage.objects for update to authenticated
using (bucket_id = 'sponsor-banners' and (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');

drop policy if exists "sponsor banner images admin delete" on storage.objects;
create policy "sponsor banner images admin delete" on storage.objects for delete to authenticated
using (bucket_id = 'sponsor-banners' and (auth.jwt() ->> 'email') = 'yunho-jo@casuwon.or.kr');
