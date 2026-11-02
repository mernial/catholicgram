# 가톨릭그램 Play 앱 (Android) 업데이트 만들기

Play 앱(`com.catholicgram.android`)은 웹사이트를 여는 껍데기(TWA)라서, 앱 내용은 웹사이트가 바뀌면 저절로 바뀐다.
이 폴더는 **껍데기 자체를 바꿀 때**(크롬으로 열기·알림 허용 묻기·화면 방향·알림 그림·버전) 쓴다.

## 이번 업데이트(1.0.2, 버전 코드 3)에 새로 들어가는 것
- **휴대폰 알림 기본 소리 '찬미예수님'** (운영자 2026-11-02: '따로 설정하지 않아도'): 앱 안 알림 소리와 같은 파일(`public/sounds/notify/catholicgram-praise.mp3`)을 `res/raw/catholicgram_praise.mp3`로 넣고, `DelegationService`가 크롬이 넘겨주는 알림을 모두 '가톨릭그램 알림' 종류(채널 `catholicgram_praise_v1`, 소리 = 찬미예수님)로 보냄 — `scripts/android-pin-chrome.mjs` 3)·4)
  - 안드로이드는 알림 종류를 처음 만들 때만 소리를 정할 수 있어서 새 종류로 만들고, 1.0.1 때 크롬 이름으로 만든 종류는 지움. 그 종류에서 교우가 직접 바꿔 둔 소리·소리 없음·끔은 새 종류로 옮겨 줌(손대지 않은 분만 찬미예수님)
  - 교우가 바꾸고 싶으면 휴대폰 설정 → 애플리케이션 → 가톨릭그램 → 알림 → '가톨릭그램 알림' → 소리
  - 클라우드에서 가짜 안드로이드 부품으로 컴파일·동작(새로 설치·업데이트·직접 바꾼 소리·소리 없음·끔·앱 알림 꺼짐)을 확인함. 실제 Gradle 빌드·기기 소리는 Mac 빌드 뒤 확인

## 1.0.1(버전 코드 2)에 들어간 것
- **크롬으로 열기**: 기본 브라우저가 삼성 인터넷이어도 크롬이 있으면 크롬으로 연다. 삼성 인터넷은 알림 위임이 없어 웹 알림 허용이 저절로 풀렸음(루비로사). 크롬이 없거나 꺼져 있으면 예전처럼 기본 브라우저로 — `scripts/android-pin-chrome.mjs`
- **처음 알림을 켤 때 안드로이드 알림 허용 창**(알림 위임, `POST_NOTIFICATIONS`) — 율리T 처럼 앱 자체 알림 허용이 빠져 꺼지던 문제
- **폴드를 펴면 전체 화면**(`orientation: any`), **휴대폰 위쪽 줄 알림 그림**(`icon-monochrome-512.png`)

## 만드는 법 (운영자 Mac)
1. Node.js 가 없으면 https://nodejs.org 에서 설치 (macOS Installer .pkg)
2. `signing.keystore`·`signing-key-info.txt` 가 iCloud Drive 의 `가톨릭그램 관리자` 폴더나 바탕화면·다운로드 폴더(복사본)에 있는지 확인
3. 터미널에서:
   ```
   cd ~/catholicgram && git checkout main && git pull && bash scripts/android-build.sh
   ```
   - 처음 한 번은 Java(JDK 17)·Android 도구를 저절로 받음 (`~/.bubblewrap`, 10분쯤). Bubblewrap 의 설치 기능은 쓰지 않음 — Node 26 에서 Java 압축을 풀다 아무 말 없이 꺼졌음
   - 비밀번호는 `signing-key-info.txt` 에서 화면에 보이지 않게 읽음 (없으면 물어봄, 쳐도 안 보임)
4. 끝나면 `가톨릭그램 관리자/Play 업데이트/catholicgram-1.0.2-(3).aab` 가 생김 (그 폴더가 없으면 바탕화면 `가톨릭그램 Play 업데이트`)
5. Play Console → 가톨릭그램 → 테스트 → 비공개 테스트 → **새 버전 만들기** → 그 `.aab` 올리기 → 검토 보내기

그다음 업데이트는 `VERSION_CODE=4 VERSION_NAME=1.0.3 bash scripts/android-build.sh` (버전 코드는 늘 이전보다 커야 함).

## 주의
- 서명 키·비밀번호는 저장소에 넣지 않는다. 같은 키로 서명해야 Play 가 업데이트로 받아 준다
- 만든 Android 프로젝트는 `~/catholicgram-android` (저장소 밖)
- 크롬으로 열리게 되면, 그동안 삼성 인터넷으로 열리던 분은 Play 앱에서 **처음 한 번 다시 로그인**해야 할 수 있음 (로그인·화면 색 같은 설정은 브라우저마다 따로 저장됨)
