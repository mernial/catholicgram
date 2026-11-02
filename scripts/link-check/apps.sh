#!/usr/bin/env bash
# scripts/link-check/apps.txt 의 앱마다: Play 제목·개발자·아이콘(public/apps/<이름>.png 192px) + 웹 주소로 앱이 열리는지(assetlinks·AASA)
set -u
cd "$(dirname "$0")/../.."
UA='Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
mkdir -p public/apps
AAPT2=$(ls -d "${ANDROID_HOME:-/usr/local/lib/android/sdk}"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)
echo "aapt2: $AAPT2"
for q in 'cpbc' '가톨릭 성경' '굿뉴스'; do
  echo "=== Play 검색: $q"
  curl -sL -A "$UA" "https://play.google.com/store/search?q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$q")&c=apps&hl=ko" \
    | grep -oE 'details\?id=[A-Za-z0-9_.]+' | sort -u | head -12 | sed 's/^/    /'
done
# 웹 주소로 앱이 열리는지 (안드로이드 App Links assetlinks.json · 아이폰 universal links apple-app-site-association)
for d in maria.catholic.or.kr m.catholic.or.kr www.catholic.or.kr bible.cbck.or.kr www.cpbc.co.kr cpbc.co.kr; do
  for w in .well-known/assetlinks.json .well-known/apple-app-site-association apple-app-site-association; do
    code=$(curl -s -m 15 -o /tmp/wk -w '%{http_code} %{content_type}' "https://$d/$w" </dev/null)
    echo "=== https://$d/$w  $code"
    case "$code" in 200*) head -c 600 /tmp/wk | tr '\n' ' ' | sed 's/^/    /'; echo ;; esac
  done
done
grep -v '^#' scripts/link-check/apps.txt | grep -v '^$' > /tmp/apps-list.txt
while read -r key pkg <&3; do
  echo "=== $key  $pkg"
  page=$(mktemp)
  curl -sL -A "$UA" -H 'Accept-Language: ko-KR' -m 30 "https://play.google.com/store/apps/details?id=$pkg&hl=ko" -o "$page" </dev/null
  echo "    제목: $(grep -oE '<meta property="og:title" content="[^"]*"' "$page" | head -1)"
  echo "    개발자: $(grep -oE 'store/apps/dev(eloper)?\?id=[^"&]+' "$page" | head -1)"
  icon=$(grep -oE '<meta property="og:image" content="[^"]*"' "$page" | head -1 | sed 's/.*content="//; s/"$//')
  echo "    아이콘: $icon"
  if [ -n "$icon" ] && [ ! -f "public/apps/$key.png" ]; then  # 이미 있으면 그대로 (손으로 PNG 로 바꾼 것을 덮어쓰지 않게)
    base="${icon%%=*}"
    curl -sL -m 30 "${base}=s192" -o "public/apps/$key.png" </dev/null && echo "    → public/apps/$key.png $(file -b "public/apps/$key.png" | cut -c1-60)"
  fi
  rm -f "$page"
done 3< /tmp/apps-list.txt
