@AGENTS.md

# 가톨릭그램 운영 메모 (세션 간 인계용)

이 저장소는 Claude Code 클라우드 세션과 운영자 Mac(~/catholicgram) 두 곳에서 작업한다. 어느 쪽에서 시작하든 이 메모를 먼저 읽고, 큰 변경 뒤에는 아래 "최근 변경"에 한 줄씩 더한다.

## 작업 흐름
- `claude/*` 브랜치에서 작업 → PR → 운영자가 합치라고 하면 main에 합침 → main이 Vercel(catholicgram-dey7)에 자동 배포
- PR 브랜치는 Vercel 미리보기 빌드를 건너뛴다(Ignored Build Step). 합치기 전에 로컬 `npm run build`로 확인하고, 합친 뒤 main 커밋의 Vercel 상태가 success인지 본다
- 로컬 빌드에는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 필요하다(없으면 정적 페이지 생성에서 실패). 실제 값은 Vercel에만 있다
- 관리자 계정: `lib/admin.ts`의 `ADMIN_EMAILS`. 관리자 전용 화면·API는 화면(`isAdmin`)과 서버(`/api/push/notify` 등) 양쪽에서 막는다
- **업데이트 소식 (운영자 요청 2026-11-02 바꿈, 늘 지킬 것)**: **운영자가 '공지하라'고 한 변경만** `lib/update-notes.ts`의 `UPDATE_NOTES` 맨 위에 새 덩이를 더한다. 그 밖의 변경은 교우가 느끼는 것이라도 저절로 넣지 않는다(운영자: '모든 업데이트를 공지하지 마, 내가 공지하라는 것만 해' — 예전 2026-10-31 '합칠 때마다 더하기'는 없앰). 넣을 때는 id 는 겹치지 않게(같은 날 두 번째면 `2026-11-01-2`), date 는 한국 날짜, 고친 오류(`fixed`)·새로 생긴 기능(`added`)·바뀐 점(`changed`)을 교우가 읽는 쉬운 말로, 관리자만 쓰는 것은 `adminOnly`. 스크립트·스토어 자료·운영 메모처럼 교우가 못 느끼는 변경은 넣지 않는다. 이미 나간 덩이에는 줄을 더하지 않는다('다시 보지 않기'한 교우가 못 봄). 앱을 열면 홈에서 창으로 뜨고('닫기'는 이번에만·'다시 보지 않기'는 그 소식 끝), 14일 지나면 저절로 안 뜸, 지난 소식은 설정 → 버전 정보
- SQL 실행이 필요한 변경을 보고할 때는 '꼭 해 주실 일'에 SQL 전문을 복사용 코드 블록으로 붙이고, Supabase SQL 편집기 링크 https://supabase.com/dashboard/project/_/sql/new 를 함께 띄운다 (운영자 요청 2026-10-29: 파일 이름만 알려 주면 휴대폰에서 찾아 실행하기 어려움)

## 운영 자료 (저장소 밖)
- 앱 서명 키스토어(`signing.keystore`), Google Play 패키지, 스토어 이미지, 각종 복구 코드는 운영자 iCloud Drive `가톨릭그램 관리자` 폴더에 있다. 키스토어를 잃으면 Play 앱을 업데이트할 수 없다. 저장소에 올리지 않는다


## 이 메모를 쓰는 법 (2026-11-14 정리)
- 이 파일은 세션마다 통째로 읽히므로 **짧게 유지**한다. 예전엔 변경 기록이 모두 여기 있어 27만 자(세션마다 큰 토큰)였음
- 지난 변경의 자세한 내용(왜·어떻게·어느 함수)은 `docs/history/2026-10.md`·`2026-11.md` 에 그대로 있음 → **통째로 읽지 말고** `grep -n '낱말' docs/history/*.md` 로 그 줄만 본다 (예: `grep -n 'onePerDevice' docs/history/*.md`)
- **큰 변경 뒤에는 `docs/history/2026-11.md`(달이 바뀌면 새 달 파일) 맨 아래에 한 줄**을 더한다. 여기(CLAUDE.md)에는 늘 지킬 규칙·지도가 바뀔 때만 고친다
- Android(Play) 진행 상황·다음 빌드 할 일: `docs/android-status.md`
- 기능을 찾을 때는 아래 '코드 지도' → 해당 파일을 `grep -n` 으로. `app/page.tsx`(약 8천 줄)는 통째로 읽지 말고 이름으로 찾아 그 근처만

## 운영자와 일하는 법 (늘 지킬 것)
- 답은 쉬운 한국어로, 끝에 https://catholicgram-dey7.vercel.app 를 붙인다. 운영자 Claude 문서·말투는 '교우' 기준의 쉬운 말
- 순서: 고치기 → `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npx next build` → 커밋·푸시(`claude/catholic-social-network-byyih8`) → PR 만들기 → 합치기 → `git fetch -q origin main && git merge -q --ff-only origin/main && git push -q` → 7분 뒤 `send_later` 로 배포 확인(`gh api repos/mernial/catholicgram/commits/<sha>/status --jq .state` + `curl -s https://catholicgram-dey7.vercel.app/api/version`) 후 한 줄 보고
- 확인은 Playwright + 가짜 수파베이스(작업 폴더 `/tmp/cgexp`: `cap.mjs` + `STEPS=./steps-x.mjs`, 서버 `npx next start -p 3153`, 끝나면 `pkill -f "next start"; pkill -f next-server`) — 세션이 새로 뜨면 이 폴더는 없을 수 있음
- 운영자 메시지 중 건의·오류 신고는 대개 테스터(루비로사 @rubyrosa 등)가 보낸 것. 특정 교우에게만 알릴 것은 `lib/personal-notices.ts`(개인 안내, `handles` 또는 `names`)
- **popstate 처리 안에서 pushState 하지 말 것**(안드로이드 크롬이 기록 칸을 건너뛰어 뒤로가기로 앱이 꺼짐 — 기록은 누른 순간에, `pushSafe()`·`useBackLayer`)
- 비밀값(서비스 키·API 키·키스토어·비밀번호·자동 게시 비밀값·녹음실 열쇠 `scratchpad/studio.key`)은 커밋·출력 금지. 다른 사람 이메일을 저장소에 적지 않음. Suno 곡은 ID3 꼬리표를 지우고 올림
- 다른 저장소(`mernial/malro-dapjang` 말로 답장 등)는 이 세션 일이 아님 — 운영자가 시킬 때만
- 이모티콘 판 자르기: 판 가장자리와 이어진 바탕만 지우기 + 칸 사이 굽은 길 + 흰 테두리 4px + 256px webp (최근 예: scratchpad `cut16/c.py`, 기록은 `grep -n '판 자르기' docs/history/*.md`). 새 팩은 `lib/stickers.ts` `PACK_DEFS` 한 줄 + 새 말은 `KEYWORDS`, 공용은 access 없음·관리자 전용 `access:'admin'`·선물 `access:'gift'`

## 코드 지도 (어디를 보면 되나)
- 화면 대부분: `app/page.tsx` (홈·영상·메시지·탐색·내 공간 탭, 알림창, 글쓰기·글 고치기, 크게 보기, 뒤로가기 기록, 앱으로 돌아올 때) / 시작 스크립트·전역 창: `app/layout.tsx`
- 글·사진: `PostPhotos` `PhotoEditor`(효과: 자르기 `FreeCrop`·이모티콘·모자이크 `lib/smart-mask`) `Collage` `PhotoZoom` `PostList` `ClampText` `HashtagText` `lib/select-scope` `lib/post-text-card` / 영상 `ReelVideo` `PostVideo` `VideoOverlays` `VideoTrimmer` `lib/video`
- 스토리: `Stories` `StoryCreate`
- 1:1 메시지: page.tsx(`chatPartnerIdRef`·`insertDm`) / 단체방 `GroupChat` `NewChat` / 사랑방 `Lounge` / 공통 `ChatMedia` `ChatSearch` `ChatGallery` `ChatCapture` `ChatSheets` `ChatDayDivider` `MessageMenu` `QuietSend` `SwipeRow` `lib/chat-actions` `lib/chat-mutes` `lib/chat-presence` `lib/typing` `lib/use-enter-send` `lib/use-press-gestures`
- 이모티콘: `lib/stickers.ts`(팩·말·추천 `KEYWORDS`·`MOOD_GROUPS`) `StickerPanel` `PostStickerSheet` `StickerGift` / 그림 `public/stickers/<팩>/NN.webp`
- 알림: 보내기 `app/api/push/notify` `lib/push-send` `lib/push-devices`(`onePerDevice`·일시 끄기 `paused_until`) / 서비스 워커 `public/sw.js` / 앱 쪽 page.tsx + `PushPauseSheet` `lib/push-log` `lib/alert-sound` `lib/alert-sync`
- 뱃지: `lib/badges.ts` `BadgeIcon` `MemberBadges` `RoleBadge` `lib/badge-map` `lib/auto-badges` / SQL `supabase/member-badges.sql`
- 테스터: `AdminTesters` `TesterSignup` `TesterAttendance` `TesterRestartNotice` `AppKindNotice` `lib/tester-attendance` `lib/app-kind` / API `app/api/tester` `app/api/admin/tester-activity`
- 음악: `lib/music.ts` `lib/music-cc.ts` `MusicPicker` `MusicLibrary` `BgmAdmin` `ProfileMusicPicker` `MusicGift` `MemberMusicGift` / 파일 `public/bgm`
- 선물·공지 창: `GiftBox` `LetterReplyPopup` `PersonalNotice` `UpdateNotes`(`lib/update-notes`) `SamsungGuide` `NoticeBoard` / 사연함 `LettersModal` / 건의함 `FeedbackModal`
- 설정·관리자: `SettingsModal` `AdminMembers` `AdminStats` `AdminUsage` `DeletedMessages` `MediaStorage` `SponsorAdmin` / 관리자 이메일 `lib/admin.ts`
- 화면 색 `lib/theme.ts` + `scripts/theme-css.py` / 기기 `lib/device.ts` `lib/visual-viewport.ts` / 공통 창 `BottomSheet` `ConfirmDialog`(`askConfirm`·`showAlert`) `lib/back-layers`
- 서버 API: `app/api/*` (posts·comments·messages·push·cron(아침 8시 축일·생일·뱃지)·autopost·studio·version·visit·account)
- 안드로이드: TWA 빌드 `scripts/android-build.sh`·`android/` / 하이브리드(보류) `android-app/` — 자세히 `docs/android-status.md`
- GitHub Actions(클라우드에서 막힌 사이트 대신): `bgm-cc*.yml`(무료 음악) `link-check.yml` `app-check.yml` `android-app.yml`

## SQL (Supabase)
- 파일은 `supabase/*.sql` (71개). 운영자가 실행했다고 확인된 것: chat-media-menu·comment-reactions·group-chats(10-27 부분)·chat-presence·autopost
- 아래는 '실행 필요'로 안내만 했고 실행 여부를 확인 못 한 것 — 관련 기능이 안 되면 먼저 의심: push-pause(11-14) · app-sessions-kind(11-14) · terms-consent · member-badges(여러 번 다시) · alert-sync(다시) · chat-settings · group-cleanup(다시) · quiet-send · feedback-photos · bgm-dedupe · profile-music(-everyone) · sticker-gifts · letters-reply · letters-gift · tester-installs · birthday · push-devices · dm-requests · message-extras
- 앱 코드는 대개 SQL 전에도 돌아가게(칸이 없으면 빼고 다시) 짠다. SQL 을 안내할 때는 위 '작업 흐름'의 규칙대로 전문 + 편집기 링크
