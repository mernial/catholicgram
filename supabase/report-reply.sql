-- 신고 처리 답변: 관리자가 신고한 사람에게 어떻게 처리했는지 알려준다
alter table public.reports add column if not exists admin_reply text;
alter table public.reports add column if not exists replied_at timestamptz;

-- 신고한 사람은 자기 신고(처리 상태·답변)를 볼 수 있다
drop policy if exists "reports read own" on public.reports;
create policy "reports read own" on public.reports for select to authenticated
using (reporter_id = auth.uid());
