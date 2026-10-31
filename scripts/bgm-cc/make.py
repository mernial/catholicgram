#!/usr/bin/env python3
"""가톨릭그램 게시글 배경음악(CC0·CC BY 4.0) 30초 곡 만들기 (운영자 요청 2026-11-01, 곡 목록은 인스타 자동 업로더 세션이 고름).

GitHub Actions(.github/workflows/bgm-cc.yml)에서 돈다 — 클라우드 작업 세션은 곡 사이트(freemusicarchive.org·incompetech.com)가 막혀 있어서.
곡마다:
  1) 받기 전에 곡 페이지(CC BY 는 작곡가 라이선스 안내 페이지)에서 라이선스를 다시 확인. 페이지가 다른 라이선스만 보이면 뺌.
     페이지를 못 읽으면 곡 파일 안의 라이선스 표시(ID3)로 확인, 그것도 없으면 뺌
  2) 원본 mp3 받기 (저장소에는 올리지 않고 임시 폴더에만)
  3) 30초 고르기: 조용한 시작(인트로)을 건너뛰고 소리가 곡의 보통 크기에 이른 곳부터, 그 근처의 가장 조용한 틈(마디 경계)에 맞춤
  4) 소리 크기 -16 LUFS(두 번 재어 일정하게), 앞 1초 커지고 뒤 2초 작아지게, AAC 128kbps m4a → public/bgm/cc/<id>.m4a
  5) docs/music-licenses.md(곡마다 원본 주소·라이선스·확인한 날짜·확인 방법·고른 구간)·scripts/bgm-cc/result.json
표준 라이브러리 + ffmpeg 만 씀.
"""
import array
import datetime
import json
import os
import re
import statistics
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public', 'bgm', 'cc')
TMP = os.path.join(os.environ.get('RUNNER_TEMP', '/tmp'), 'bgm-cc')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
CLIP = 30.0
FADE_IN, FADE_OUT = 1.0, 2.0
RATE = 8000          # 구간 고르기용으로만 낮게 풀어 봄
WIN = 0.5            # 0.5초마다 소리 크기
KST = datetime.timezone(datetime.timedelta(hours=9))


def fetch(url, binary=False, referer=None):
    headers = {'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9'}
    if referer:
        headers['Referer'] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    return data if binary else data.decode('utf-8', 'replace')


def page_license(html, want):
    """곡 페이지 글에서 라이선스 찾기 → 'ok' | 'other' | 'unknown'"""
    h = html.lower()
    if want == 'CC0':
        if 'publicdomain/zero' in h or re.search(r'\bcc0\b', h):
            return 'ok'
    else:  # CC BY 4.0
        if ('creativecommons.org/licenses/by/4.0' in h) or re.search(r'attribution\s*4\.0', h) or re.search(r'\bcc\s*by\s*4\.0\b', h):
            return 'ok'
    if re.search(r'creativecommons\.org/licenses/by-(nc|nd|sa)', h) or 'all rights reserved' in h:
        return 'other'
    return 'unknown'


def file_tags(path):
    """곡 파일 안의 꼬리표(ID3) — 저작권·설명 글"""
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', path],
                             capture_output=True, text=True, timeout=60).stdout
        tags = json.loads(out or '{}').get('format', {}).get('tags', {})
        return ' '.join(str(v) for v in tags.values())
    except Exception:  # noqa: BLE001
        return ''


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, timeout=60).stdout.strip()
    return float(out)


def loudness_windows(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(RATE), '-f', 's16le', '-'],
                         capture_output=True, timeout=300).stdout
    pcm = array.array('h')
    pcm.frombytes(raw[: len(raw) // 2 * 2])
    n = int(RATE * WIN)
    out = []
    for i in range(0, len(pcm) - n + 1, n):
        s = 0
        for v in pcm[i:i + n]:
            s += v * v
        out.append((s / n) ** 0.5)
    return out


def pick_start(rms, dur):
    """조용한 시작을 건너뛰고 소리가 곡의 보통 크기에 이른 곳 → 근처의 가장 조용한 틈(0.5초 앞~1초 뒤)에서 시작"""
    voiced = [r for r in rms if r > 30]
    if not voiced:
        return 0.0
    med = statistics.median(voiced)
    onset = 0
    for i in range(len(rms)):
        seg = rms[i:i + 4]
        if seg and sum(seg) / len(seg) >= 0.75 * med:
            onset = i
            break
    lo, hi = max(0, onset - 1), min(len(rms) - 1, onset + 2)
    best = min(range(lo, hi + 1), key=lambda j: rms[j]) if hi >= lo else onset
    start = best * WIN
    latest = max(0.0, dur - CLIP - 0.5)
    return round(min(start, latest), 2)


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        raise RuntimeError(p.stderr[-800:])
    return p


def make_clip(src, dst, start, meta):
    # -vn: mp3 안의 앨범 그림(표지)은 빼고 소리만 (넣으면 m4a 에 그림을 넣으려다 실패했음)
    base = ['ffmpeg', '-v', 'info', '-y', '-ss', f'{start:.2f}', '-t', f'{CLIP:.2f}', '-i', src, '-vn', '-map', '0:a:0']
    # 1) 소리 크기 재기
    p = run(base + ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    m = re.search(r'\{\s*"input_i"[^}]*\}', p.stderr)
    stats = json.loads(m.group(0)) if m else None
    if stats:
        ln = ('loudnorm=I=-16:TP=-1.5:LRA=11:linear=true'
              f":measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}"
              f":measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}")
    else:
        ln = 'loudnorm=I=-16:TP=-1.5:LRA=11'
    # 소리 크기를 맞춘 뒤 튀는 소리가 0dB 를 넘지 않게 -1dB 에서 눌러 줌 (lofi 곡의 잡음 한두 개가 넘었음)
    af = f'{ln},alimiter=limit=0.891:attack=5:release=50:level=false,afade=t=in:st=0:d={FADE_IN},afade=t=out:st={CLIP - FADE_OUT}:d={FADE_OUT}'
    # 2) 30초 m4a (꼬리표는 곡 이름·만든 사람·출처 표시만)
    run(base + ['-af', af, '-ar', '44100', '-ac', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
                '-map_metadata', '-1', '-metadata', f"title={meta['title']}", '-metadata', f"artist={meta['artist']}",
                '-metadata', f"comment={meta['credit']}", dst])
    return stats


def credit(t):
    if t['license'] == 'CC0':
        return f"음악: {t['artist']} (Free Music Archive, CC0)"
    return f"\"{t['title']}\" — Kevin MacLeod (incompetech.com) · CC BY 4.0 · 30초로 편집"


def mmss(s):
    return f'{int(s // 60)}:{int(s % 60):02d}'


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    tracks = json.load(open(os.path.join(HERE, 'tracks.json'), encoding='utf-8'))
    today = datetime.datetime.now(KST).strftime('%Y-%m-%d')
    pages = {}
    results, dropped = [], []
    for t in tracks:
        tid = t['id']
        print(f'\n== {tid}', flush=True)
        # 1) 라이선스 다시 확인
        verdict, how = 'unknown', ''
        try:
            if t['page'] not in pages:
                pages[t['page']] = fetch(t['page'])
            verdict = page_license(pages[t['page']], t['license'])
            how = '곡 페이지' if t['license'] == 'CC0' else '작곡가 라이선스 안내 페이지'
        except Exception as e:  # noqa: BLE001
            print('  page fetch failed:', e)
        if verdict == 'other':
            dropped.append({**t, 'reason': '곡 페이지의 라이선스가 CC0/CC BY 4.0 이 아님'})
            print('  -> 뺌 (다른 라이선스)')
            continue
        # 2) 받기
        src = os.path.join(TMP, tid + '.mp3')
        try:
            data = fetch(t['file'], binary=True, referer=t['page'])
            is_mp3 = data[:3] == b'ID3' or (len(data) > 1 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)
            if len(data) < 50_000 or not is_mp3:
                raise RuntimeError(f'mp3 가 아님 ({len(data)} bytes, {data[:4]!r})')
            open(src, 'wb').write(data)
        except Exception as e:  # noqa: BLE001
            dropped.append({**t, 'reason': f'파일을 받지 못함: {e}'})
            print('  -> 뺌 (받기 실패)', e)
            continue
        if verdict != 'ok':
            tags = file_tags(src).lower()
            want = 'publicdomain/zero' if t['license'] == 'CC0' else 'creativecommons'
            if want in tags or (t['license'] == 'CC0' and 'cc0' in tags):
                verdict, how = 'ok', '곡 파일 안의 라이선스 표시(ID3)'
            else:
                dropped.append({**t, 'reason': '라이선스를 확인하지 못함(곡 페이지를 읽지 못하고 파일에도 표시 없음)'})
                print('  -> 뺌 (라이선스 확인 못 함)')
                continue
        # 3) 30초 고르기
        dur = duration(src)
        start = pick_start(loudness_windows(src), dur)
        meta = {'title': t['title'], 'artist': t['artist'], 'credit': credit(t)}
        dst = os.path.join(OUT, tid + '.m4a')
        try:
            stats = make_clip(src, dst, start, meta)
        except Exception as e:  # noqa: BLE001
            dropped.append({**t, 'reason': f'자르기 실패: {e}'})
            print('  -> 뺌 (자르기 실패)', e)
            continue
        size = os.path.getsize(dst)
        print(f'  ok  원곡 {mmss(dur)} · {mmss(start)}부터 30초 · {size // 1024}KB · {how}')
        results.append({**t, 'url': f'/bgm/cc/{tid}.m4a', 'credit': credit(t), 'source_duration': round(dur, 1),
                        'start': start, 'bytes': size, 'checked': today, 'checked_by': how,
                        'measured_lufs': stats and stats.get('input_i')})
    json.dump({'made': today, 'tracks': results, 'dropped': dropped}, open(os.path.join(HERE, 'result.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    write_doc(results, dropped, today)
    print(f'\n만든 곡 {len(results)} · 뺀 곡 {len(dropped)}')
    if not results:
        sys.exit(1)


def write_doc(results, dropped, today):
    lines = [
        '# 가톨릭그램 게시글 배경음악 라이선스',
        '',
        f'만든 날: {today} (GitHub Actions `bgm-cc` 가 `scripts/bgm-cc/make.py` 로 만듦) · 곡 목록: 인스타 자동 업로더 세션이 고름(2026-11-01)',
        '',
        '- 모든 곡은 원곡에서 **30초를 잘라** 앞 1초 커지고 뒤 2초 작아지게, 소리 크기 -16 LUFS, AAC 128kbps 로 바꿨습니다(편집함).',
        '- **CC0** (Free Music Archive): 조건 없이 사용 가능. 앱에는 `음악: 만든 사람 (Free Music Archive, CC0)` 표시',
        '- **CC BY 4.0** (Kevin MacLeod, incompetech.com): 곡 이름·작곡가·라이선스 표시 필수 → 앱 음악 고르기·게시글 음악 줄에 '
        '`"곡 이름" — Kevin MacLeod (incompetech.com) · CC BY 4.0 · 30초로 편집` 표시. 라이선스 원문 https://creativecommons.org/licenses/by/4.0/ · '
        '작곡가 안내 https://incompetech.com/music/royalty-free/licenses/',
        '- 받기 전에 곡 페이지(CC BY 는 작곡가 라이선스 안내 페이지)에서 라이선스를 다시 확인했고, 페이지를 읽지 못하면 곡 파일 안의 라이선스 표시로 확인했습니다. '
        '원본 파일은 저장소에 올리지 않았습니다.',
        '',
        '| 곡 | 만든 사람 | 라이선스 | 분위기 | 원본(곡 페이지 · 파일) | 확인한 날짜 · 방법 | 고른 구간 | 앱 파일 |',
        '|---|---|---|---|---|---|---|---|',
    ]
    for r in results:
        lines.append(f"| {r['title']} | {r['artist']} | {r['license']} | {r['feel']} | [곡 페이지]({r['page']}) · [파일]({r['file']}) | "
                     f"{r['checked']} · {r['checked_by']} | {mmss(r['start'])}부터 30초 (원곡 {mmss(r['source_duration'])}) | `public{r['url']}` |")
    if dropped:
        lines += ['', '## 뺀 곡', '', '| 곡 | 만든 사람 | 이유 |', '|---|---|---|']
        for d in dropped:
            lines.append(f"| {d['title']} | {d['artist']} | {d['reason']} |")
    lines += ['', '## 넣지 않은 곳과 이유 (곡 고른 세션의 메모)', '',
              '- Pixabay·유튜브 오디오 보관함: 앱 안 음악 목록으로 다시 나눠 주는 것을 금지',
              '- Scott Buckley (CC BY): 앱(소프트웨어) 사용은 따로 유료 라이선스',
              '- 앞으로 곡을 더할 때도 이 표에 원본 주소·라이선스·확인한 날짜를 남깁니다', '']
    os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
    open(os.path.join(ROOT, 'docs', 'music-licenses.md'), 'w', encoding='utf-8').write('\n'.join(lines))


if __name__ == '__main__':
    main()
