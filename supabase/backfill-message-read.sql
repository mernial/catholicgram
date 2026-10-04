-- 읽음 표시 기능을 추가하기 전에 주고받은 메시지를 모두 '읽음'으로 처리 (한 번만 실행)
update public.messages
set read_at = created_at
where read_at is null
  and created_at < '2026-10-04 19:00:00+00';
