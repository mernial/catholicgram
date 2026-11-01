#!/usr/bin/env python3
"""discover.py 를 고치기 위해 곡 사이트 페이지 모양을 로그에 보여 줌 (GitHub Actions bgm-cc-discover 에서 한 번)"""
import re
import sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
from discover import fetch  # noqa: E402

URLS = [
    'https://freemusicarchive.org/music/holiznacc0/winter-lofi/',
    'https://freemusicarchive.org/music/pamela-yuen/',
    'https://freemusicarchive.org/music/pamela-yuen/kardia-vol-1/in-the-light-of-fall/',
    'https://opengameart.org/content/chill-beats-collection',
]
PATS = [r'data-track[^=]*=', r'fileUrl', r'files\.freemusicarchive\.org[^"\' ]{0,120}', r'\.mp3', r'creativecommons\.org/[^"\' ]+',
        r'href="[^"]*/music/[^"]+"', r'href="[^"]*/track/[^"]+"', r'href="[^"]*/content/[^"]+"', r'/sites/default/files/[^"]+',
        r'[Dd]uration', r'Date Released|Released|Date Added', r'/genre/[^"]+']
for u in URLS:
    p = fetch(u) or ''
    print(f'\n######## {u}  ({len(p)} chars)')
    for pat in PATS:
        ms = list(re.finditer(pat, p))
        print(f'-- {pat}: {len(ms)}')
        for m in ms[:4]:
            a, b = max(0, m.start() - 160), min(len(p), m.end() + 220)
            print('   …' + p[a:b].replace('\n', ' ')[:520] + '…')
