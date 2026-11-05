# 홍보 영상(유튜브 쇼츠 60초) 만드는 도구

운영자 요청(2026-11-05): 정식 출시 때 올릴 60초 홍보 영상 — 밝고 경쾌하게, 운영자 노래('새로운 시작'), 모션·효과음.
모든 교우·글은 지어낸 예시(클라라·안드레아 신부·모니카…), 사진은 직접 그린 그림(`photos.mjs`), 프로필 사진은 그 그림·앱 이모티콘(`avatars.mjs`).

작업 폴더는 `/tmp/cgpromo` (파일 안 경로가 이 폴더 기준):
```
mkdir -p /tmp/cgpromo/{img,av,shots} && cp scripts/promo/* /tmp/cgpromo/
node /tmp/cgpromo/photos.mjs && node /tmp/cgpromo/avatars.mjs
ffmpeg -loop 1 -i /tmp/cgpromo/img/stars.jpg -vf "scale=1080:1350,zoompan=z='1+0.0015*on':d=150:s=720x900:fps=30,format=yuv420p" -t 5 -c:v libvpx -b:v 1M /tmp/cgpromo/img/reel.webm
# 앱을 빌드해 3153 포트로 띄운 뒤 (CLAUDE.md 작업 흐름의 빌드 명령)
NOTE_IDS=$(grep -o "id: '20[0-9-]*'" lib/update-notes.ts | sed "s/id: //; s/'//g" | tr '\n' ',') node /tmp/cgpromo/capture.mjs   # 앱 화면 (가짜 수파베이스 mock.mjs + data.mjs)
python3 /tmp/cgpromo/sfx.py /tmp/cgpromo/mix.wav      # 효과음 합성 + 노래 섞기 (NARR=폴더 면 내레이션도)
node /tmp/cgpromo/render.mjs                          # stage.html 을 30fps 로 그려 video-noaudio.mp4 (약 5분)
ffmpeg -i /tmp/cgpromo/video-noaudio.mp4 -i /tmp/cgpromo/mix.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart promo.mp4
```
- `stage.html`: 장면표 `SC`(박자 100BPM, 첫 마디 0.3947초, 한 마디 2.4초), 장면마다 화면·확대·누르는 표시·이모지 터짐. `preview.mjs 12.5 30` 으로 특정 시각만 그려 보기.
- 내레이션 대본·시각: `narration.md`.

## 2차본 (자유 제작, 2026-11-05 운영자: '최대한의 효과·음악·기교로 설치하고 싶게, 자유에 맡길게')
- `stage2.html` + `sfx2.py` + `render2.mjs`(`OUT=…/video-v2.mp4`) · 미리 보기 `preview2.mjs 9.9 30`.
- 흐름: 1막 질문(밤 성당 배경 '주일 미사 끝나면 다들 어디 가세요?' → 성당 소식·기도 부탁·신앙 이야기 어디서? → '이제 한 곳에서 함께해요!' → 빛기둥·'가톨릭 신자들의 SNS', 드럼·스네어 롤·올라가는 소리) → 9.995초 드롭(번쩍·쾅·꽃가루, 앱 아이콘·이름·폰 셋 부채꼴) → 2막 기능 14마디(마디마다 폰이 옆에서 휙 + 제목 쾅, 정보 카드·댓글 말풍선·기도 비·🙏+1·축하 꽃가루·이모티콘 튀어나옴·교우 사진 빙글·두 대·종 흔들·화면 색) → 3막 화면 벽 '이 모든 게 한 앱에!' → 교우 사진 하트 '우리 본당 교우들과 함께해요' → '무료로 · 가톨릭 신자라면 누구나' → 끝 'Play 스토어에서 가톨릭그램' 단추·손가락·고리 + 마지막 '찬미예수님!'.
- 숫자로 사람 수를 내세우지 않음(지어낸 수치 없음). 끝 장면은 정식 출시 뒤에 맞음.
