#!/usr/bin/env bash
# 가톨릭그램 Play 앱(com.catholicgram.android) 업데이트를 운영자 Mac 에서 만든다 (Bubblewrap).
# 들어가는 것: 크롬으로 열기(삼성 인터넷이 기본이어도 — 알림이 저절로 꺼지던 문제), 처음 열 때 알림 허용 묻기(알림 위임),
#              폴드를 펴면 전체 화면(orientation any), 휴대폰 위쪽 줄 알림 그림(monochrome), 버전 올리기.
# 쓰는 법 (터미널):  cd ~/catholicgram && git pull && bash scripts/android-build.sh
#   버전을 바꾸려면:  VERSION_CODE=3 VERSION_NAME=1.0.2 bash scripts/android-build.sh
# 서명 키(signing.keystore)·비밀번호는 iCloud '가톨릭그램 관리자' 폴더에서 읽기만 하고, 화면에 보이거나 저장소에 들어가지 않는다.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$HOME/catholicgram-android}"   # 만든 Android 프로젝트·결과물 (저장소 밖)
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/가톨릭그램 관리자"
VERSION_CODE="${VERSION_CODE:-2}"
VERSION_NAME="${VERSION_NAME:-1.0.1}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "① 준비물 확인"
command -v node >/dev/null || { echo "Node.js 가 필요해요 → https://nodejs.org 에서 설치한 뒤 다시 실행해 주세요"; exit 1; }
# Bubblewrap(앱 만드는 도구): 깔려 있으면 그것, 없으면 npx 로 (관리자 권한 없이)
bw() { if command -v bubblewrap >/dev/null; then bubblewrap "$@"; else npx --yes @bubblewrap/cli "$@"; fi; }

say "② 서명 키 찾기 (iCloud '가톨릭그램 관리자' 폴더 → 바탕화면 → 다운로드)"
KEYSTORE="${KEYSTORE:-}"
if [ -z "$KEYSTORE" ]; then
  # 바탕화면에 복사해 둔 것도 찾음 (iCloud 파일이 아직 내려받아지지 않았을 때 등). 이름이 'signing.keystore' 인 파일
  for where in "$ICLOUD" "$HOME/Desktop" "$HOME/Downloads"; do
    KEYSTORE="$(find "$where" -maxdepth 4 -name 'signing.keystore' -size +0 -print 2>/dev/null | head -1 || true)"
    [ -n "$KEYSTORE" ] && break
  done
fi
if [ -z "$KEYSTORE" ] || [ ! -f "$KEYSTORE" ]; then
  echo "signing.keystore 를 찾지 못했어요."
  echo "iCloud Drive 의 '가톨릭그램 관리자' 폴더나 바탕화면에 signing.keystore 가 있는지 확인하고,"
  echo "다른 곳에 있으면:  KEYSTORE=\"키 파일 경로\" bash scripts/android-build.sh"
  echo "(Finder 에서 파일을 터미널 창으로 끌어다 놓으면 경로가 들어가요)"
  exit 1
fi
echo "서명 키: $KEYSTORE"
INFO="$(dirname "$KEYSTORE")/signing-key-info.txt"
field() { grep -i "^$1:" "$INFO" 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r' || true; }
ALIAS="${KEY_ALIAS:-}"
[ -z "$ALIAS" ] && [ -f "$INFO" ] && ALIAS="$(field 'Key alias')"
ALIAS="${ALIAS:-my-key-alias}"
echo "키 별칭: $ALIAS"
# 비밀번호: signing-key-info.txt 에 있으면 화면에 내지 않고 넘김, 없으면 Bubblewrap 이 물어봄(입력해도 화면에 안 보임)
if [ -z "${BUBBLEWRAP_KEYSTORE_PASSWORD:-}" ] && [ -f "$INFO" ]; then
  KSP="$(field 'Key store password')"; KP="$(field 'Key password')"
  if [ -n "$KSP" ] && [ -n "$KP" ]; then
    export BUBBLEWRAP_KEYSTORE_PASSWORD="$KSP" BUBBLEWRAP_KEY_PASSWORD="$KP"
    echo "비밀번호: signing-key-info.txt 에서 읽음 (화면에는 안 보여요)"
  fi
  unset KSP KP
fi

say "③ Android 프로젝트 만들기 → $OUT"
mkdir -p "$OUT"
node -e '
const fs = require("fs");
const [src, dst, keystore, alias, code, name] = process.argv.slice(1);
const m = JSON.parse(fs.readFileSync(src, "utf8"));
m.signingKey = { path: keystore, alias };
m.appVersionCode = Number(code);
m.appVersion = name;
fs.writeFileSync(dst, JSON.stringify(m, null, 2));
' "$REPO/android/twa-manifest.json" "$OUT/twa-manifest.json" "$KEYSTORE" "$ALIAS" "$VERSION_CODE" "$VERSION_NAME"
cd "$OUT"
echo "처음 한 번은 Bubblewrap 이 Java(JDK)·Android SDK 를 설치할지 물어요 → 엔터(Yes), 약관은 y 를 눌러 주세요."
bw update --skipVersionUpgrade

say "④ 크롬으로 열기 넣기"
node "$REPO/scripts/android-pin-chrome.mjs" "$OUT"

# Android SDK 약관 동의 (빌드 중에 필요한 부품을 내려받을 수 있게) — 실패해도 계속
SDK="$(node -e 'try{console.log(require(require("os").homedir()+"/.bubblewrap/config.json").androidSdkPath||"")}catch{console.log("")}')"
for m in "$SDK/cmdline-tools/latest/bin/sdkmanager" "$SDK/cmdline-tools/bin/sdkmanager" "$SDK/tools/bin/sdkmanager" "$SDK/bin/sdkmanager"; do
  if [ -x "$m" ]; then yes | "$m" --licenses >/dev/null 2>&1 || true; break; fi
done

say "⑤ 앱 만들기 (몇 분 걸려요)"
if ! bw build --skipPwaValidation; then
  echo
  echo "앱 만들기에 실패했어요. 위의 빨간 글(오류)을 그대로 복사해 Claude 에게 보내 주세요."
  echo "'createTwaLauncher' 가 들어간 오류면 크롬으로 열기 방법을 바꿔야 해요."
  exit 1
fi

# 결과물: iCloud '가톨릭그램 관리자/Play 업데이트' (그 폴더가 없으면 바탕화면 '가톨릭그램 Play 업데이트')
if [ -d "$ICLOUD" ]; then DEST="$ICLOUD/Play 업데이트"; else DEST="$HOME/Desktop/가톨릭그램 Play 업데이트"; fi
mkdir -p "$DEST"
cp app-release-bundle.aab "$DEST/catholicgram-$VERSION_NAME-($VERSION_CODE).aab"
[ -f app-release-signed.apk ] && cp app-release-signed.apk "$DEST/catholicgram-$VERSION_NAME-($VERSION_CODE).apk"

say "✅ 다 됐어요"
echo "Play Console 에 올릴 파일: $DEST/catholicgram-$VERSION_NAME-($VERSION_CODE).aab"
echo "다음: Play Console → 가톨릭그램 → 테스트 → 비공개 테스트 → 새 버전 만들기 → 위 .aab 올리기 → 검토 보내기"
