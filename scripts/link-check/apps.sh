#!/usr/bin/env bash
# scripts/link-check/apps.txt 의 앱마다: Play 제목·개발자·아이콘(public/apps/<이름>.png 192px) + APK 의 BROWSABLE 주소
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
grep -v '^#' scripts/link-check/apps.txt | grep -v '^$' | while read -r key pkg; do
  echo "=== $key  $pkg"
  page=$(mktemp)
  curl -sL -A "$UA" -H 'Accept-Language: ko-KR' -m 30 "https://play.google.com/store/apps/details?id=$pkg&hl=ko" -o "$page"
  echo "    제목: $(grep -oE '<meta property="og:title" content="[^"]*"' "$page" | head -1)"
  echo "    개발자: $(grep -oE 'store/apps/dev(eloper)?\?id=[^"&]+' "$page" | head -1)"
  icon=$(grep -oE '<meta property="og:image" content="[^"]*"' "$page" | head -1 | sed 's/.*content="//; s/"$//')
  echo "    아이콘: $icon"
  if [ -n "$icon" ]; then
    base="${icon%%=*}"
    curl -sL -m 30 "${base}=s256" -o "/tmp/$key-icon" && convert "/tmp/$key-icon" -resize 192x192 "public/apps/$key.png" && echo "    → public/apps/$key.png $(identify -format '%wx%h' "public/apps/$key.png")"
  fi
  rm -f "$page"
  # APK 받아 BROWSABLE intent-filter (브라우저에서 앱을 여는 주소)
  dir=$(mktemp -d)
  ./apkeep -a "$pkg" "$dir" >/dev/null 2>&1 || ./apkeep -a "$pkg" -d apk-pure "$dir" >/dev/null 2>&1 || true
  f=$(ls "$dir" 2>/dev/null | head -1)
  echo "    받은 파일: ${f:-없음}"
  apk=""
  if [ -n "$f" ]; then
    case "$f" in
      *.xapk|*.apks|*.zip) mkdir -p "$dir/x" && unzip -q -o "$dir/$f" -d "$dir/x" && apk=$(ls "$dir/x"/*.apk | grep -E "/($pkg|base)\.apk$" | head -1); [ -z "$apk" ] && apk=$(ls -S "$dir/x"/*.apk | head -1) ;;
      *) apk="$dir/$f" ;;
    esac
  fi
  if [ -n "$apk" ] && [ -n "$AAPT2" ]; then
    "$AAPT2" dump xmltree --file AndroidManifest.xml "$apk" > "$dir/m.txt" 2>/dev/null
    python3 - "$dir/m.txt" <<'PY'
import re, sys
lines = open(sys.argv[1], encoding='utf-8', errors='replace').read().split('\n')
# activity → intent-filter 묶음에서 BROWSABLE 이 있는 것의 scheme/host/path 와 LAUNCHER 를 뽑음
act = None; filt = None; out = []
def flush():
    global filt
    if filt and 'android.intent.category.BROWSABLE' in filt['cats']:
        out.append(f"      BROWSABLE {act}: schemes={sorted(set(filt['schemes']))} hosts={sorted(set(filt['hosts']))} paths={sorted(set(filt['paths']))[:6]}")
    if filt and 'android.intent.category.LAUNCHER' in filt['cats']:
        out.append(f"      LAUNCHER {act}")
    filt = None
for l in lines:
    s = l.strip()
    if s.startswith('E: activity') or s.startswith('E: activity-alias'):
        flush(); act = '?'
    elif s.startswith('E: intent-filter'):
        flush(); filt = {'cats': [], 'schemes': [], 'hosts': [], 'paths': []}
    m = re.search(r'A: http://schemas.android.com/apk/res/android:name\(0x01010003\)="([^"]+)"', s)
    if m and act == '?' : act = m.group(1)
    if filt is not None:
        m = re.search(r':name\(0x01010003\)="([^"]+)"', s)
        if m and 'category' in s.lower(): pass
        for key, rx in (('cats', r'android:name\(0x01010003\)="(android\.intent\.category\.[A-Z_]+)"'), ('schemes', r':scheme\(0x[0-9a-f]+\)="([^"]+)"'), ('hosts', r':host\(0x[0-9a-f]+\)="([^"]+)"'), ('paths', r':path(?:Prefix|Pattern)?\(0x[0-9a-f]+\)="([^"]+)"')):
            mm = re.search(rx, s)
            if mm: filt[key].append(mm.group(1))
flush()
print('\n'.join(out) if out else '      (BROWSABLE 없음)')
PY
  else
    echo "    (APK 를 못 받았거나 aapt2 없음)"
  fi
  rm -rf "$dir"
done
