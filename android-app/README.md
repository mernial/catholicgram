# 가톨릭그램 안드로이드 앱 (하이브리드)

크롬·삼성 인터넷을 거치지 않고 **앱 안의 웹뷰**로 https://catholicgram-dey7.vercel.app 를 띄우는 앱.
지금 Play 스토어의 앱(`android/` — 크롬으로 여는 TWA)을 바꿀 새 판이다. 같은 패키지 `com.catholicgram.android` ·
같은 서명 키라서 Play 에는 **지금 앱의 업데이트(1.1.0, 버전 코드 4)** 로 올라간다.

## 무엇이 좋아지나
- 크롬 '검색결과를 보려면 탭하세요' 띠, 삼성 인터넷의 알림 꺼짐·억지 어두운 화면이 없어진다
- 알림 소리(찬미예수님)·알림 모양·묶기를 앱이 정한다 (Firebase 알림, 3단계)
- 화면 고친 것은 지금처럼 앱 업데이트 없이 바로 반영 (앱은 사이트를 띄울 뿐)

## 앱이 직접 하는 일 (app/src/main/java/com/catholicgram/android)
| 파일 | 하는 일 |
|---|---|
| `MainActivity.kt` | 웹뷰, 뒤로가기, 시계 줄·아래 막대·자판 여백, 사진 고르기·찍기, 동영상 전체 화면, 바깥 링크(카카오톡·Play·다른 사이트), 소리 파일 내려받기, 알림·공유 링크로 열기, 휴대폰은 세로 고정 |
| `AppBridge.kt` | 웹 ↔ 앱 통로 `window.CatholicgramApp` (가톨릭그램 주소에서만): 공유하기·사진첩 저장·로그인·막대 색·알림 |
| `Notifications.kt` | 알림 채널(1.0.2 와 같은 `catholicgram_praise_v1`, 찬미예수님), 같은 tag 합치기 |
| `PushService.kt` | Firebase 알림 받기 (앱이 떠 있으면 웹 화면 배너로) |

웹 쪽: `lib/native-app.ts`(통로), `lib/app-login.ts` + `app/auth/app-login`(로그인), `app/auth/signin-complete`(앱으로 넘기기).

## 로그인 (구글은 앱 안 웹뷰 로그인을 막음)
앱이 크롬 창으로 `/auth/app-login?provider=…&pkg=…&state=…` → 카카오·구글·네이버 로그인 → `/auth/signin-complete` 가
`intent://auth#Intent;scheme=catholicgram;package=<그 앱>;S.cg_state=…;S.cg_hash=…;end` 로 그 앱에만 넘김 →
앱이 state 를 확인하고 웹뷰에서 `/auth/signin-complete#access_token=…` 를 열어 로그인. 크롬의 원래 로그인은 되돌려 둔다.

## 시험판 받기 (GitHub 이 저절로 만듦)
`claude/**` 가지에 `android-app/` 을 고쳐 올리면 GitHub Actions(`.github/workflows/android-app.yml`)가
'가톨릭그램 시험'(`com.catholicgram.android.dev`) APK 를 만든다 — Play 앱과 **나란히** 설치된다.
1. 휴대폰에서 https://github.com/mernial/catholicgram/actions/workflows/android-app.yml → 맨 위(초록 ✓) 줄 → 아래 Artifacts 의 `catholicgram-dev-apk`
2. 받은 zip 을 '내 파일'에서 열어 `app-debug.apk` 설치 ('출처를 알 수 없는 앱' 허용 묻기 → 허용)
3. 알림(Firebase)은 아직 꺼져 있음 — `app/google-services.json` 이 생기면 켜짐

## 정식 .aab (운영자 Mac, Firebase 준비 뒤)
`app/google-services.json`(Firebase 에서 받음) 을 두고, 서명은 `signing.properties`(저장소 밖) 또는 환경 변수
`CG_KEYSTORE`·`CG_KEYSTORE_PASSWORD`·`CG_KEY_ALIAS`·`CG_KEY_PASSWORD` 로 →
`./gradlew bundleRelease -PversionCode=4 -PversionName=1.1.0` (빌드 스크립트는 3단계에서 만든다)

## 그림
`python3 android-app/scripts/make-icons.py` (저장소 맨 위에서) — 웹의 `public/icon-v2-512.png`·`icon-monochrome-512.png` 로 앱 아이콘·알림 그림을 다시 만든다.
