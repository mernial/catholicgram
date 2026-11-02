#!/usr/bin/env bash
# scripts/link-check/urls.txt 의 주소마다: 상태 코드·마지막 주소(넘겨 준 곳)·페이지 제목·눈에 띄는 링크(미사·성경·방송·휴대폰·앱)
UA='Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
grep -v '^#' "$(dirname "$0")/urls.txt" | grep -v '^$' | while read -r url; do
  body=$(mktemp)
  meta=$(curl -sL -A "$UA" -H 'Accept-Language: ko-KR,ko;q=0.9' -m 25 -o "$body" -w '%{http_code} %{url_effective} %{content_type} %{size_download}' "$url" || echo "ERR")
  title=$(grep -io '<title>[^<]*' "$body" | head -1)
  echo "=== $url"
  echo "    $meta"
  echo "    $title"
  grep -oiE "(href|src|content)=[\"'][^\"']*(onair|live|missa|mass|mobile|/m/|m\.catholic|details\?id=|itunes|apps\.apple|intent:|goodnews)[^\"']*[\"']" "$body" | sort -u 2>/dev/null | head -30 | sed 's/^/      /'
  grep -oE 'details\?id=[A-Za-z0-9_.]+' "$body" | sort -u 2>/dev/null | head -20 | sed 's/^/      app: /'
  grep -oE '"name":"[^"]{1,60}"|aria-label="[^"]{1,80}"' "$body" | head -15 | sed 's/^/      name: /'
  rm -f "$body"
done
