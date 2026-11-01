#!/usr/bin/env python3
"""가톨릭그램 게시글 배경음악 후보 찾기 (운영자 요청 2026-11-01: '최근에 유행하는 스타일로, 같은 조건(CC0·CC BY 4.0)으로 더 선별').

클라우드 작업 세션은 곡 사이트(freemusicarchive.org·opengameart.org)가 막혀 있어서 GitHub Actions(.github/workflows/bgm-cc-discover.yml)에서 돈다.
scripts/bgm-cc/sources.json 의 곳(작곡가·앨범·곡 페이지·모음)을 돌며 곡마다
  제목·만든 사람·곡 페이지·파일 주소·페이지에 보이는 라이선스 주소(creativecommons.org/…)·장르/태그·날짜·파일 크기
를 모아 scripts/bgm-cc/candidates.json 에 적는다. 곡을 고르는 것은 사람(작업 세션)이 이 목록을 보고 tracks.json 에 넣어서.
표준 라이브러리만 씀.
"""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
FMA = 'https://freemusicarchive.org'
OGA = 'https://opengameart.org'
AUDIO_EXT = ('.mp3', '.ogg', '.wav', '.flac', '.m4a')
MAX_ALBUMS = 8
MAX_TRACKS_PER_ARTIST = 40
MAX_OGA_ITEMS = 40

_cache = {}


def fetch(url):
    if url in _cache:
        return _cache[url]
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        text = None
        print(f'  {e.code} {url}')
    except Exception as e:  # noqa: BLE001
        text = None
        print(f'  fail {url}: {e}')
    _cache[url] = text
    time.sleep(0.4)
    return text


def head(url):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {'bytes': int(r.headers.get('Content-Length') or 0), 'type': r.headers.get('Content-Type', '')}
    except Exception as e:  # noqa: BLE001
        return {'error': str(e)[:120]}


def cc_links(text):
    """페이지에 보이는 creativecommons 라이선스 주소들 (by/4.0, by-nc/4.0, publicdomain/zero/1.0 …)"""
    found = re.findall(r'creativecommons\.org/(licenses/[a-z-]+/[0-9.]+|publicdomain/(?:zero|mark)/[0-9.]+)', text, re.I)
    out = []
    for f in found:
        f = f.lower()
        if f not in out:
            out.append(f)
    return out


def first(pattern, text, flags=re.I | re.S):
    m = re.search(pattern, text, flags)
    return html.unescape(re.sub(r'<[^>]+>', ' ', m.group(1))).strip() if m else ''


# ── Free Music Archive ──
def fma_track_infos(page):
    """FMA 페이지의 곡 줄마다 붙은 data-track-info (제목·곡 페이지·파일 주소)"""
    out = []
    for raw in re.findall(r'data-track-info="([^"]+)"', page):
        try:
            info = json.loads(html.unescape(raw))
        except Exception:  # noqa: BLE001
            continue
        out.append(info)
    return out


def fma_track_detail(url):
    page = fetch(url)
    if not page:
        return {}
    genres = []
    for g in re.findall(r'href="(?:https://freemusicarchive\.org)?/genre/([^/"]+)/?"', page):
        g = urllib.parse.unquote(g)
        if g not in genres:
            genres.append(g)
    # 곡 페이지 본문 쪽 라이선스만 (머리·발 쪽 링크가 섞이지 않게 'License' 글자 둘레를 먼저 봄)
    lic_area = ''
    m = re.search(r'(?:License|licen[cs]e)[^<]{0,40}</[^>]+>(.{0,1500})', page, re.I | re.S)
    if m:
        lic_area = m.group(1)
    tags = []
    for t in re.findall(r'href="(?:https://freemusicarchive\.org)?/search/?\?[^"]*?(?:adv=1&amp;)?(?:music-filter-tags|tag)[^"]*?=([^"&]+)"', page):
        t = urllib.parse.unquote_plus(html.unescape(t))
        if t not in tags:
            tags.append(t)
    return {
        'licenses_page': cc_links(page),
        'licenses_near_label': cc_links(lic_area),
        'genres': genres[:12],
        'tags': tags[:20],
        'released': first(r'Date Released:?\s*</[^>]+>\s*<[^>]+>([^<]+)<', page) or first(r'(?:Released|Date Added)[^A-Za-z0-9]{0,40}([A-Z][a-z]{2,8} \d{1,2},? \d{4})', page),
        'duration': first(r'class="[^"]*\bduration\b[^"]*"[^>]*>\s*([0-9:]+)\s*<', page),
        'description': first(r'<meta name="description" content="([^"]{0,400})"', page),
    }


def fma_artist(src):
    handle = src['handle']
    base = f'{FMA}/music/{handle}/'
    page = fetch(base)
    if page is None and '_' in handle:
        handle = handle.lower().replace('_', '-')
        base = f'{FMA}/music/{handle}/'
        page = fetch(base)
    if page is None:
        return []
    album_urls = []
    if src.get('albums'):
        album_urls = [f'{FMA}/music/{handle}/{a}/' for a in src['albums']]
    else:
        for a in re.findall(r'href="(?:https://freemusicarchive\.org)?/music/' + re.escape(handle) + r'/([^/"#?]+)/?"', page, re.I):
            u = f'{FMA}/music/{handle}/{a}/'
            if u not in album_urls:
                album_urls.append(u)
        album_urls = album_urls[:MAX_ALBUMS]
    infos = [] if src.get('albums') else fma_track_infos(page)
    for au in album_urls:
        ap = fetch(au)
        if ap:
            infos += fma_track_infos(ap)
    seen, out = set(), []
    for i in infos:
        url = (i.get('url') or '').replace('\\/', '/')
        if not url or url in seen:
            continue
        seen.add(url)
        if len(out) >= MAX_TRACKS_PER_ARTIST:
            break
        d = fma_track_detail(url)
        file_url = (i.get('fileUrl') or i.get('playbackUrl') or '').replace('\\/', '/')
        out.append({
            'source': 'fma', 'artist': i.get('artistName') or handle, 'title': i.get('title') or '', 'album': i.get('albumTitle') or '',
            'page': url, 'file': file_url, 'file_head': head(file_url) if file_url else {}, **d,
        })
        print(f"  · {out[-1]['artist']} — {out[-1]['title']} {d.get('licenses_near_label') or d.get('licenses_page')} {d.get('genres')}")
    return out


# ── OpenGameArt ──
def oga_item(url):
    page = fetch(url)
    if not page:
        return None
    m = re.search(r'field-name-field-art-licenses(.{0,2500})', page, re.S)
    lic_area = m.group(1) if m else ''
    files = []
    for f in re.findall(r'href="((?:https://opengameart\.org)?/sites/default/files/[^"]+)"', page):
        f = urllib.parse.urljoin(OGA, html.unescape(f))
        if f.lower().endswith(AUDIO_EXT) and f not in files:
            files.append(f)
    tags = []
    for t in re.findall(r'field_art_tags_tid=[^"]*"[^>]*>([^<]+)<', page):
        t = html.unescape(t).strip()
        if t and t not in tags:
            tags.append(t)
    title = first(r'<title>([^<|]+)', page)
    return {
        'source': 'oga', 'artist': first(r'Submitted by\s*<a[^>]*>([^<]+)</a>', page) or first(r'field-name-author-submitter.{0,400}?<a[^>]*>([^<]+)</a>', page),
        'title': title, 'page': url, 'files': files, 'file': files[0] if files else '',
        'file_head': head(files[0]) if files else {},
        'licenses_page': cc_links(page), 'licenses_near_label': cc_links(lic_area or ''),
        'license_text': first(r'field-name-field-art-licenses.{0,600}?<div class="license-name">([^<]+)<', page) or first(r'License\(s\):.{0,300}?>([^<]{2,40})<', page),
        'tags': tags[:20], 'released': first(r'Submitted by\s*<a[^>]*>[^<]+</a>\s*on\s*([^<]+?)\s*<', page),
        'attribution': first(r'field-name-field-art-attribution.{0,200}?<div class="field-item[^"]*">(.{0,400}?)</div>', page),
        'description': first(r'field-name-body.{0,100}?<div class="field-item[^"]*">(.{0,600}?)</div>', page),
    }


def oga_collection(url):
    page = fetch(url)
    if not page:
        return []
    links = []
    for l in re.findall(r'href="((?:https://opengameart\.org)?/content/[^"#?]+)"', page):
        u = urllib.parse.urljoin(OGA, html.unescape(l))
        if u.rstrip('/') != url.rstrip('/') and u not in links:
            links.append(u)
    out = []
    for u in links[:MAX_OGA_ITEMS]:
        it = oga_item(u)
        if it and it['files']:
            out.append(it)
            print(f"  · {it['artist']} — {it['title']} {it['licenses_near_label'] or it['license_text']}")
    return out


def main():
    sources = json.load(open(os.path.join(HERE, 'sources.json'), encoding='utf-8'))
    found = []
    for s in sources:
        print(f"\n== {s['kind']} {s.get('handle') or s.get('url')}", flush=True)
        try:
            if s['kind'] == 'fma-artist':
                found += fma_artist(s)
            elif s['kind'] == 'oga-item':
                it = oga_item(s['url'])
                if it:
                    found.append(it)
                    print(f"  · {it['artist']} — {it['title']} {it['licenses_near_label'] or it['license_text']} files={len(it['files'])}")
            elif s['kind'] == 'oga-collection':
                found += oga_collection(s['url'])
        except Exception as e:  # noqa: BLE001
            print('  error', e)
    json.dump({'made': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()), 'count': len(found), 'tracks': found},
              open(os.path.join(HERE, 'candidates.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n후보 {len(found)}곡')
    if not found:
        sys.exit(1)


if __name__ == '__main__':
    main()
