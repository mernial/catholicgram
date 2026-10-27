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

## 최근 변경 (2026-10-26~27, 클라우드 세션 `claude/catholic-social-network-byyih8`)
- #196 고민상담 글쓰기: 칸 안에서 끌면 '당겨서 새로고침'이 가로채 글이 지워지던 문제 → 입력 중·입력칸·안쪽 스크롤에서는 새로고침 안 함(`app/page.tsx` pull-to-refresh `typing`), 글 칸이 글에 맞춰 늘어남, 쓰던 글 유지(`drafts`), `colorScheme: 'only light'`
- #197 글 고치기·건의하기·공지 쓰기: 키보드가 올라오면 글 칸이 한 줄로 눌리던 문제 → textarea `shrink-0`
- #198·#199 테스터 안내: 'App not available'일 때 할 일 안내, 관리자 화면에 '게시됨 확인' 단계와 '등록한 N명에게 설치 안내 다시 보내기'
- #200 아동 안전 표준 페이지 `/child-safety` (Play 제출 전 검사 '불완전한 아동 안전 표준 선언' 해결용, 이용약관에서 링크)
- 내 공간·교우 공간은 늘 맨 위에서 시작 (홈과 같은 스크롤 칸을 써서 홈에서 내려간 채로 열면 중간부터 보였음, `useLayoutEffect` [activeTab, viewingUserId]). 공간에서 당겨서 새로고침·아이콘 다시 누르기 때 그 사람 글(`fetchUserPosts`)과 태그된 글도 다시 불러옴
- 접속 통계 등 스크롤 창에서 테두리 상자가 2px로 눌려 잘리던 문제 → `globals.css`: `.overflow-y-auto.flex-col > :is(.overflow-hidden, .overflow-x-auto, textarea) { flex-shrink: 0 }` (스크롤 세로 칸 안의 이런 칸은 최소 높이가 0이라 눌림)
- 앱을 새로 켜면(휴대폰 재시작·앱 완전 종료 후) 홈에서 시작. 앱이 켜진 채 새로고침(새 버전 적용 등)일 때만 마지막 화면 복원 — `sessionStorage` `appOpened` (루비로사 건의)
- 새 채팅·단체 채팅방 (`supabase/group-chats.sql` 실행 필요): 메시지 화면 '새 채팅'에서 @아이디·이름으로 찾아 1:1 또는 여러 명과 단체방(`components/NewChat.tsx`, `components/GroupChat.tsx`). 방 만들기·초대·나가기·이름·읽음은 RPC로만, 서로 차단한 교우는 초대 불가, 나중에 들어온 교우는 들어온 뒤 대화만. 관리자는 메시지 화면 '🔒 모든 단체방'에서 모든 방을 읽기만(글쓰기·읽음·입장 표시 없음, DB에서도 막힘) — 개인정보처리방침·약관에 '운영자 열람 가능' 고지. 알림 `type=group_message`, 딥링크 `?group=`
- 알림: 눌러 확인해도 목록에 남김(흐리게, `readAlerts`/`notificationsRead:`), '확인한 알림 지우기'는 확인한 것만 지움, 3일 지나면 자동 삭제 (#202의 '확인하면 바로 지움'을 되돌림)
- 내 공간에 '🔄 다른 계정으로 로그인'·'로그아웃' (카카오 prompt=login, 구글 select_account, 네이버 auth_type=reauthenticate)
- 1:1 메시지 (`supabase/message-extras.sql` 실행 필요, message-hearts.sql 다음): 꾹 누르면 그 메시지 바로 위에 감정 줄(❤️👍😊😂😮😢🙏)·아래에 메뉴(답장·고치기·삭제, `messageAnchor`), 옆으로 60px 넘게 밀면 답장(`swipe`, 말풍선 `touch-action: pan-y`), 두 번 누르면 하트, 답장(`messages.reply_to`, 같은 대화만), 내 메시지 고치기 24시간 안(`edit_my_message`, 원래 내용은 관리자만 보는 `message_edits`)
- 같은 손동작을 단체 채팅방·게시글 댓글에도: 공통 부품 `lib/use-press-gestures.ts`(누르기·두 번·꾹·밀기, 꾹 누른 뒤 따라오는 누름 0.3초 버림)와 `components/MessageMenu.tsx`(그 자리 메뉴, `REACTION_EMOJIS`)
  - 단체방(`supabase/group-chats.sql` 새 부분, 2026-10-27 운영자 실행함): `reply_to`·`edited_at`, `group_chat_reactions`(한 사람 한 개, 5초마다 다시 읽음), `edit_group_message`(24시간, 원래 내용은 관리자만 보는 `group_message_edits`). 관리자 보기는 감정·답장·두 번 누르기 없이 메뉴에 '프로필 보기'만
  - 댓글(`supabase/comment-reactions.sql` 새 감정 종류, 2026-10-27 운영자 실행함): `reaction_type`에 thumbs·smile·laugh·wow·sad 추가(여러 개 고를 수 있음, ❤️=like 🙏=pray). 꾹 = 메뉴(답글·수정·삭제·신고), 두 번 = 공감, 밀기 = 답글. 원래 단추들은 그대로
- 알림창(휴대폰): 위쪽 손잡이·제목줄을 위로 끌면 창이 커지고 놓은 높이 그대로(최대 화면 92%, 알림이 적어도), 아래로 90px 넘게 끌면 닫힘, 손잡이를 누르면 크게↔원래대로 (`alertDrag`, 제목줄 단추 위에서 시작해도 끌림)
- 게시글 사진 10장까지(`MAX_PHOTOS`, 서버 `app/api/posts` 고치기도 10). 1:1 메시지: 사진·동영상을 여러 개 한꺼번에 골라 하나씩 차례로 보냄(개수 제한 없음, 글은 첫 번째와 함께, 휴대폰 알림은 한 번). 동영상은 `messages.image_url`에 영상 주소(`isVideoUrl`로 구분, 글 자리 `VIDEO_ONLY_TEXT`), 12MB 넘으면 720p로 줄이고 45MB 넘으면 못 보냄 — SQL 필요 없음
- 보고 있는 대화(1:1·단체)의 휴대폰 알림은 띄우지 않음: SW가 앱에 'viewing?' 물어봄(`askViewing`/`viewingRef`), 애플 기기는 알림을 꼭 띄워야 해서 소리 없이 띄우고 바로 닫음. 대화방 들어가면 2~3초 동안 맨 아래에 붙임
- 알림으로 연 화면에서 창을 닫거나 뒤로가기 하면 페이지가 새로 불려 홈으로 가던 문제: 시작할 때 주소를 지우는 `replaceState`가 Next.js 기록 표시(`__NA`)를 지웠음 → `window.history.state`를 남기고 주소만 바꿈
- 건의함 글이 사라진 이유: 탈퇴하면 `app/api/account/delete`가 그 교우의 건의·신고도 지움 (개인정보처리방침대로). 되살릴 수 없음

## Android 앱 (Google Play) 진행 상황
- 패키지 `com.catholicgram.android` (PWABuilder TWA). 예전 초안 앱 `com.catholicgram.app`은 쓰지 않음
- 2026-10-27: 비공개 테스트(Alpha) 1 (1.0.0.0) + 대한민국 + 테스터 이메일 목록 '테스터'(12명)로 **검토 제출함**. Play Console 아동 안전 표준 선언 URL은 `https://catholicgram-dey7.vercel.app/child-safety`
- 검토가 끝나면: 앱 관리자 → 테스터 신청에서 ① '등록한 N명에게 설치 안내 다시 보내기' 먼저 → ② 새 신청자는 복사·Play 목록에 붙여넣기 후 '등록함으로 표시' (순서를 지키면 알림이 두 번 가지 않음)
- 남은 일: Play Console 앱 무결성의 **앱 서명 키 SHA-256**을 받아 `app/.well-known/assetlinks.json/route.ts`(기본 패키지가 아직 `com.catholicgram.app`)를 `com.catholicgram.android` + 지문으로 고치기 → 앱 위 주소창이 사라짐. 비공개 테스트 12명 이상 14일 뒤 프로덕션 신청
