#!/usr/bin/env python3
"""scripts/bgm-cc/result.json(GitHub Actions bgm-cc 가 만든 곡 목록) → lib/music-cc.ts (앱의 '가톨릭그램 음악' 목록에 들어갈 곡들)"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
res = json.load(open(os.path.join(HERE, 'result.json'), encoding='utf-8'))
q = lambda s: json.dumps(s, ensure_ascii=False)
lines = [
    "// 자동으로 만든 파일 — scripts/bgm-cc/to-ts.py (손으로 고치지 말고 scripts/bgm-cc/tracks.json 을 고쳐 다시 만들기)",
    "// 게시글 배경음악: CC0(Free Music Archive·OpenGameArt)·CC BY 4.0(Kevin MacLeod, Free Music Archive) 곡을 30초로 자른 것 (public/bgm/cc, docs/music-licenses.md)",
    "// credit = 앱에 꼭 보여야 하는 출처 표시 (CC BY 는 곡 이름·작곡가·라이선스·편집함 필수)",
    "import type { BgmTrack } from '@/lib/music';",
    "",
    "export const CC_BGM: BgmTrack[] = [",
]
for t in res['tracks']:
    extra = f", season: {q(t['season'])}" if t.get('season') else ''
    lines.append(f"  {{ id: {q(t['id'])}, title: {q(t['title'])}, artist: {q(t['artist'])}, url: {q(t['url'])}, mood: {q(t['mood'])}, feel: {q(t['feel'])}, credit: {q(t['credit'])}{extra} }},")
lines += ["];", ""]
open(os.path.join(ROOT, 'lib', 'music-cc.ts'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(res['tracks']), 'tracks →', 'lib/music-cc.ts', '· dropped', len(res['dropped']))
