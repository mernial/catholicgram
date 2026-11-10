# 8분 설명 영상 만들기 (가로 16:9, 2026-11-10)

운영자 결정: 배경음악 '잔잔한 피아노', 가로 16:9, 아이폰 안내 문장 넣음, 실제 촬영 장면 없음.
내레이션은 `../narration.md` '쓸 녹음'(0장 새 녹음 + 1~11장 게인 올린 녹음, 이어 붙여 가볍게 다듬은 `narr.mp3`).

작업 폴더 `/tmp/cgexp` 기준 (파일 안 경로가 그 폴더):
1. `narr.wav`(내레이션 48kHz 모노) → `python3 align.py` : 문단 시작·끝을 쉼(0.4초↑)과 글자 수·장 넘긴 때로 맞춤(동적 계획법) → `timing.json`. 몇 곳은 손으로 고쳤음(문단마다 '10자당 초'가 1.7~2.3 안이 되게). 이어서 문장(자막) 시각도 쉼에 맞춰 `subs` 로 넣고 `timing.js`(window.TM).
2. 앱 화면: 예시 자료로 빌드(`NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co`)해 3153 포트, `STEPS=./steps.mjs node cap.mjs [이름…]` → `shots/*.png`(390×844 @3x). 가짜 수파베이스·예시 교우는 `scripts/promo/mock.mjs`·`data.mjs`(+ cap.mjs 가 뱃지·도장 줄을 더함), 사진 그림은 `/tmp/cgpromo/img`.
3. `stage.html`: 1920×1080. 왼쪽 = 장 표시·제목·핵심 낱말(문장 시작에 맞춰), 왼쪽 아래 = 자막, 오른쪽 = 휴대폰 화면(`SCR` 화면 차례·`TAP` 누르는 곳·`FX` 효과: intro·chaos·candle·dioceses·store·safari·wall·end 등), 위 = 12장 진행 막대. `node preview.mjs 3.5 92 …` 로 그 시각만 그려 `pv/`, `python3 sheet.py` 로 한 장에.
4. `node render.mjs <첫 장면> <끝 장면> segN.mp4` 4갈래로(30fps, 모두 13,813장면, 4갈래 약 13분) → concat.
5. `node sfxlist.mjs` → `sfx.json`, `python3 mix.py` → `mix.wav`(내레이션 + 피아노 되풀이(3초 겹침), 말할 때 0.10·쉴 때 0.30, 누름 '톡'·화면 넘김 '휙'·처음 종소리·9장 끝 '찬미예수님' 알림 소리·끝 차임) → `volume=-4.2dB,alimiter` 로 -16 LUFS.

유튜브 설명란 장 시간표: 0:00 여는 인사 · 0:12 이 앱을 만든 이유 · 1:21 시작하기 · 1:59 홈, 글과 기도 · 2:58 사진, 음악, 영상 · 3:34 함께 기도하기 · 4:22 메시지와 사랑방 · 5:19 고민상담과 사연 · 5:49 내 공간 · 6:23 알림과 설정 · 6:49 안심하고 쓰도록 · 7:12 맺음 인사
