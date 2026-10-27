@AGENTS.md

# 가톨릭그램 운영 메모 (세션 간 인계용)

이 저장소는 Claude Code 클라우드 세션과 운영자 Mac(~/catholicgram) 두 곳에서 작업한다. 어느 쪽에서 시작하든 이 메모를 먼저 읽고, 큰 변경 뒤에는 아래 "최근 변경"에 한 줄씩 더한다.

## 작업 흐름
- `claude/*` 브랜치에서 작업 → PR → 운영자가 합치라고 하면 main에 합침 → main이 Vercel(catholicgram-dey7)에 자동 배포
- PR 브랜치는 Vercel 미리보기 빌드를 건너뛴다(Ignored Build Step). 합치기 전에 로컬 `npm run build`로 확인하고, 합친 뒤 main 커밋의 Vercel 상태가 success인지 본다
- 로컬 빌드에는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 필요하다(없으면 정적 페이지 생성에서 실패). 실제 값은 Vercel에만 있다
- 관리자 계정: `lib/admin.ts`의 `ADMIN_EMAILS`. 관리자 전용 화면·API는 화면(`isAdmin`)과 서버(`/api/push/notify` 등) 양쪽에서 막는다

## 운영 자료 (저장소 밖)
- 앱 서명 키스토어(`signing.keystore`), Google Play 패키지, 스토어 이미지, 각종 복구 코드는 운영자 iCloud Drive `가톨릭그램 관리자` 폴더에 있다. 키스토어를 잃으면 Play 앱을 업데이트할 수 없다. 저장소에 올리지 않는다

## 최근 변경 (2026-10-27, 운영자 Mac 세션)
- #201 알림창 아래 '알림 이동 기록 보기'·'테스트 알림 보내기'를 관리자 전용으로(서버 type=test도 관리자만). 앱이 예전 알림 주소로 다시 열리면 그 주소는 무시하고 방금 누른 알림의 목적지(`__pending`)로 이동
- #202 알림 3일 보관(`ALERT_KEEP_MS`, 안 읽은 메시지는 제외) · 익명 고민글 답글 알림을 알림창에 표시(id `a:답글id`) · 알림을 눌러 확인하면 그 글의 알림을 바로 지움 · 익명 답글을 펼치면 답글 위치로 스크롤
  - 건의함: 루비로사(@rubyrosa) 건의 2건(익명 답글 스크롤, 알림 기록/자동 삭제)을 반영. 건의함 답변은 아직 안 보냄
- #203 하단 메시지·내 공간 아이콘을 그 화면에서 다시 누르면 맨 위로 올라가며 새로고침(홈과 같은 동작)
