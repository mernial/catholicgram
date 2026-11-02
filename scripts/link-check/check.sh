#!/usr/bin/env bash
# scripts/link-check/urls.txt 의 주소마다: 상태 코드·마지막 주소(넘겨 준 곳)·페이지 제목·눈에 띄는 링크(방송·성경·미사)
UA='Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
grep -v '^#' "$(dirname "$0")/urls.txt" | grep -v '^$' | while read -r url; do
  body=$(mktemp)
  meta=$(curl -sL -A "$UA" -m 25 -o "$body" -w '%{http_code} %{url_effective} %{content_type}' "$url" || echo "ERR")
  title=$(iconv -f euc-kr -t utf-8 "$body" 2>/dev/null | grep -io '<title>[^<]*' | head -1 || true)
  [ -z "$title" ] && title=$(grep -io '<title>[^<]*' "$body" | head -1)
  echo "=== $url"
  echo "    $meta"
  echo "    $title"
  grep -oiE 'href="[^"]*(onair|live|radio|missa|bible|knb)[^"]*"' "$body" | sort -u | head -12 | sed 's/^/      /'
  rm -f "$body"
done
