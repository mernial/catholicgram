#!/bin/sh
# Vercel 이 빌드할지 정하는 규칙 (vercel.json 의 ignoreCommand) — exit 0 이면 빌드 건너뜀, exit 1 이면 빌드
# 빌드 비용을 아끼려고:
#  - 본 앱(main)이 아닌 브랜치는 빌드하지 않는다 (미리보기 빌드)
#  - main 이라도 SQL(supabase/)·사진 저장소 워커(cloudflare/)·문서(.md)만 바뀌었으면 빌드하지 않는다
# 무언가 확인할 수 없으면(예: 이전 커밋을 못 찾음) 안전하게 빌드한다.
if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
  echo "main 이 아닌 브랜치($VERCEL_GIT_COMMIT_REF) — 빌드하지 않음"
  exit 0
fi
if git diff --quiet HEAD^ HEAD -- . ':(exclude)supabase' ':(exclude)cloudflare' ':(exclude)*.md' 2>/dev/null; then
  echo "앱 코드 변경 없음 — 빌드하지 않음"
  exit 0
fi
echo "앱 코드가 바뀜 — 빌드함"
exit 1
