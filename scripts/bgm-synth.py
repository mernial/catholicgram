# 앱 기본 배경음악(public/bgm/*.mp3)을 만드는 스크립트.
# 공유 저작물(저작권이 끝난 곡: 그루버 '고요한 밤', 바흐 전주곡 C장조, 파헬벨 캐논, 제네바 시편가 100편 곡조,
# 뉴브리튼 곡조 'Amazing Grace', 베토벤 '환희의 송가'·'엘리제를 위하여', 사티 '짐노페디 1번',
# 영국 민요 '그린슬리브스', 드보르자크 '신세계' 2악장 주제)과
# 직접 지은 곡을 이 스크립트가 새로 연주·녹음하므로 녹음 저작권도 없음.
# 사용: pip install numpy && python3 scripts/bgm-synth.py <폴더> [곡 함수 이름 ...]
#       → <폴더>/*.wav 를 ffmpeg 로 mp3 변환:
#       ffmpeg -i x.wav -af loudnorm=I=-18:TP=-1.5:LRA=11 -c:a libmp3lame -b:a 112k public/bgm/x.mp3
import numpy as np, wave, sys, os
SR = 44100
rng = np.random.default_rng(7)
OUT = sys.argv[1]

NOTE = {'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11}
def hz(n):  # 'C4', 'F#3', 'Bb2'
    name, octv = (n[:-1], int(n[-1]))
    midi = 12 * (octv + 1) + NOTE[name]
    return 440.0 * 2 ** ((midi - 69) / 12)

def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a*sr), int(d*sr), int(r*sr)
    e = np.ones(n) * s
    if a: e[:a] = np.linspace(0, 1, a)
    if d: e[a:a+d] = np.linspace(1, s, min(d, max(0, n-a)))[:len(e[a:a+d])]
    if r and n > r: e[-r:] *= np.linspace(1, 0, r)
    return e

def piano(f, dur, vel=0.5):
    n = int((dur + 1.8) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for k, amp in [(1, 1.0), (2, 0.45), (3, 0.22), (4, 0.12), (5, 0.06), (6, 0.03)]:
        fk = f * k * (1 + 0.0004 * k * k)
        decay = 1.6 / (1 + 0.35 * k) * (220 / max(f, 110)) ** 0.35
        out += amp * np.sin(2 * np.pi * fk * t) * np.exp(-t / decay)
    att = np.minimum(1, t / 0.004)
    rel = np.where(t > dur, np.exp(-(t - dur) / 0.25), 1)
    return vel * out * att * rel * 0.3

def musicbox(f, dur, vel=0.5):
    n = int((dur + 2.5) * SR); t = np.arange(n) / SR
    out = np.sin(2*np.pi*f*t) * np.exp(-t/1.4) + 0.35*np.sin(2*np.pi*f*2.0*t)*np.exp(-t/0.6) + 0.12*np.sin(2*np.pi*f*5.4*t)*np.exp(-t/0.15)
    return vel * out * np.minimum(1, t/0.002) * 0.3

def pad(f, dur, vel=0.4, a=1.5, r=2.0):
    n = int((dur + r) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.12, 0, 0.12):
        ff = f * 2 ** (det / 12)
        vib = 1 + 0.002 * np.sin(2*np.pi*4.8*t + rng.random()*6)
        ph = 2*np.pi*np.cumsum(ff*vib)/SR
        out += np.sin(ph) + 0.3*np.sin(2*ph) + 0.12*np.sin(3*ph)
    e = env_adsr(n, a, 0.5, 0.85, r)
    return vel * out / 3 * e * 0.22

def organ(f, dur, vel=0.4):
    n = int((dur + 0.6) * SR); t = np.arange(n) / SR
    out = sum(a*np.sin(2*np.pi*f*k*t) for k, a in [(0.5,0.5),(1,1),(2,0.6),(3,0.25),(4,0.25),(8,0.08)])
    trem = 1 + 0.03*np.sin(2*np.pi*5.5*t)
    e = env_adsr(n, 0.06, 0.1, 0.9, 0.5)
    return vel * out * trem * e * 0.12

def reverb(x, secs=2.6, mix=0.32, seed=1):
    r = np.random.default_rng(seed)
    n = int(secs*SR); t = np.arange(n)/SR
    ir = r.standard_normal(n) * np.exp(-t/ (secs/5.5))
    ir[:int(0.02*SR)] = 0
    ir /= np.sqrt(np.sum(ir**2))
    L = len(x) + n
    N = 1 << (L-1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:len(x)]
    return (1-mix)*x + mix*wet*1.4

class Track:
    def __init__(self, secs): self.buf = np.zeros(int((secs+4)*SR))
    def add(self, sig, at):
        i = int(at*SR); j = min(len(self.buf), i+len(sig))
        if j > i: self.buf[i:j] += sig[:j-i]
    def render(self, path, fade_in=1.0, fade_out=3.0, length=None):
        x = self.buf if length is None else self.buf[:int(length*SR)]
        x = reverb(x)
        fi, fo = int(fade_in*SR), int(fade_out*SR)
        x[:fi] *= np.linspace(0,1,fi); x[-fo:] *= np.linspace(1,0,fo)
        x = x / (np.max(np.abs(x)) + 1e-9) * 0.85
        d = int(0.011*SR)  # 살짝 넓은 스테레오
        L = x; R = np.concatenate([np.zeros(d), x[:-d]]) * 0.96 + x * 0.04
        st = np.stack([L, R], 1)
        pcm = (st * 32767).astype('<i2')
        w = wave.open(path, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()

def chord(names, o=3): return [hz(n) for n in names]

# 1) 고요한 밤 — 오르골 + 잔잔한 패드 (그루버 1818, 공유 저작물)
def silent_night():
    e = 0.42  # 8분음표 길이(초) → 6/8 느린 템포
    mel = [('G4',3),('A4',1),('G4',2),('E4',6), ('G4',3),('A4',1),('G4',2),('E4',6),
           ('D5',4),('D5',2),('B4',6), ('C5',4),('C5',2),('G4',6),
           ('A4',4),('A4',2),('C5',3),('B4',1),('A4',2), ('G4',3),('A4',1),('G4',2),('E4',6),
           ('A4',4),('A4',2),('C5',3),('B4',1),('A4',2), ('G4',3),('A4',1),('G4',2),('E4',6),
           ('D5',4),('D5',2),('F5',3),('D5',1),('B4',2), ('C5',6),('E5',6),
           ('C5',3),('G4',1),('E4',2),('G4',3),('F4',1),('D4',2), ('C4',12)]
    bars = ['C','C','C','C','G7','G7','C','C','F','C','C','C','F','C','C','C','G7','G7','C','C','C','G7','C','C']
    CH = {'C':['C3','G3','E4'], 'G7':['G2','F3','B3'], 'F':['F2','C3','A3']}
    total = sum(d for _, d in mel) * e
    tr = Track(total * 2 + 2)
    for rep in range(2):
        off = rep * total + 0.5
        t = off
        for n, d in mel:
            tr.add(musicbox(hz(n) * (2 if rep == 1 else 1) if False else hz(n)*2, d*e, 0.55), t)  # 한 옥타브 위 오르골
            t += d*e
        for i, c in enumerate(bars):
            for f in chord(CH[c]):
                tr.add(pad(f, 6*e, 0.35, a=0.8, r=1.5), off + i*6*e)
            tr.add(piano(hz(CH[c][0]) , 3*e, 0.35), off + i*6*e)
    tr.render(OUT + '/silent-night.wav', length=total*2 + 3)

# 2) 캐논 진행 — 잔잔한 피아노 (파헬벨, 공유 저작물)
def canon():
    beat = 0.95
    prog = [['D3','A3','D4','F#4'],['A2','A3','C#4','E4'],['B2','B3','D4','F#4'],['F#2','F#3','A3','C#4'],
            ['G2','G3','B3','D4'],['D3','A3','D4','F#4'],['G2','G3','B3','D4'],['A2','A3','C#4','E4']]
    top = ['F#5','E5','D5','C#5','B4','A4','B4','C#5']
    cyc = len(prog) * 2 * beat
    tr = Track(cyc * 4 + 2)
    for c in range(4):
        for i, ch in enumerate(prog):
            t0 = 0.4 + c*cyc + i*2*beat
            tr.add(piano(hz(ch[0]), 2*beat, 0.5), t0)
            arp = ch[1:] + [ch[2]]
            for k in range(8):  # 8분음표 분산화음
                tr.add(piano(hz(arp[k % 4]) * (2 if k >= 4 else 1), 0.5*beat, 0.28), t0 + k*0.25*beat*1.0)
            if c >= 1:
                tr.add(piano(hz(top[i]), 2*beat, 0.42 if c >= 2 else 0.3), t0)
            tr.add(pad(hz(ch[1]), 2*beat, 0.18, a=1.0, r=1.0), t0)
    tr.render(OUT + '/canon.wav', length=cyc*4 + 2.5)

# 3) 바흐 전주곡 C장조 (구노 '아베 마리아' 반주, 공유 저작물)
def bach():
    s = 0.2  # 16분음표
    bars = [['C4','E4','G4','C5','E5'],['C4','D4','A4','D5','F5'],['B3','D4','G4','D5','F5'],['C4','E4','G4','C5','E5'],
            ['C4','E4','A4','E5','A5'],['C4','D4','F#4','A4','D5'],['B3','D4','G4','D5','G5'],['B3','C4','E4','G4','C5'],
            ['A3','C4','E4','G4','C5'],['D3','A3','D4','F#4','C5'],['G3','B3','D4','G4','B4'],['G3','Bb3','E4','G4','C#5'],
            ['F3','A3','D4','A4','D5'],['F3','Ab3','D4','F4','B4'],['E3','G3','C4','G4','C5'],['E3','F3','A3','C4','F4'],
            ['D3','F3','A3','C4','F4'],['G2','D3','G3','B3','F4'],['C3','E3','G3','C4','E4'],['C3','G3','Bb3','C4','E4'],
            ['F2','F3','A3','C4','E4'],['G2','D3','G3','B3','F4']]
    tr = Track(len(bars)*16*s + 8)
    t = 0.4
    for b in bars:
        for half in range(2):
            pat = [b[0], b[1], b[2], b[3], b[4], b[2], b[3], b[4]]
            for k, n in enumerate(pat):
                hold = 8*s if k == 0 else (7*s if k == 1 else 1.2*s)
                tr.add(piano(hz(n), hold, 0.42 if k > 1 else 0.36), t + k*s)
            t += 8*s
    for n in ['C2','C3','G3','C4','E4','G4','C5']:
        tr.add(piano(hz(n), 4.0, 0.4), t)
        tr.add(pad(hz(n), 4.0, 0.12), t)
    tr.render(OUT + '/bach-prelude.wav', length=t + 6)

# 4) 성가 오르간 — 시편 100편 곡조(제네바 시편가 1551, 공유 저작물)
def hymn():
    q = 0.9
    mel = [('G4',1),('G4',1),('F#4',1),('E4',1),('D4',2),('G4',1),('A4',1),('B4',2),
           ('B4',1),('B4',1),('B4',1),('A4',1),('G4',2),('C5',1),('B4',1),('A4',2),
           ('G4',1),('A4',1),('B4',1),('A4',1),('G4',2),('E4',1),('F#4',1),('G4',2),
           ('D5',1),('B4',1),('G4',1),('A4',1),('C5',2),('B4',1),('A4',1),('G4',2)]
    harm = {'G4':['G2','D3','B3'],'F#4':['D3','A3','D4'],'E4':['C3','G3','C4'],'D4':['G2','B2','G3'],'A4':['D3','F#3','D4'],
            'B4':['G2','D3','G3'],'C5':['C3','E3','G3'],'D5':['G2','B2','G3']}
    tr = Track(sum(d for _, d in mel)*q*2 + 6)
    t = 0.4
    for rep in range(2):
        for n, d in mel:
            tr.add(organ(hz(n), d*q*0.96, 0.55), t)
            for h in harm[n]:
                tr.add(organ(hz(h), d*q*0.96, 0.32), t)
            t += d*q
        t += q
    tr.render(OUT + '/hymn-organ.wav', length=t + 3)

# 5) 고요한 기도 — 은은한 화음 + 맑은 종소리 (직접 작곡)
def ambient():
    seg = 8.0
    prog = [['C3','G3','E4','B4'],['A2','E3','C4','G4'],['F2','C3','A3','E4'],['G2','D3','B3','D4'],
            ['C3','G3','E4','B4'],['A2','E3','C4','G4'],['F2','C3','A3','E4'],['G2','D3','G3','C4']]
    penta = ['C5','D5','E5','G5','A5','C6']
    tr = Track(len(prog)*seg + 6)
    for i, ch in enumerate(prog):
        t0 = 0.3 + i*seg
        for n in ch:
            tr.add(pad(hz(n), seg, 0.42, a=2.5, r=3.0), t0)
        for k in range(4):
            if rng.random() < 0.8:
                tr.add(musicbox(hz(penta[rng.integers(len(penta))]), 1.5, 0.22), t0 + 0.6 + k*2 + rng.random()*0.5)
    tr.render(OUT + '/quiet-prayer.wav', length=len(prog)*seg + 4)

def harp(f, dur, vel=0.5):
    n = int((dur + 2.5) * SR); t = np.arange(n) / SR
    out = sum(a*np.sin(2*np.pi*f*k*t)*np.exp(-t/(1.3/k**0.6)) for k, a in [(1,1),(2,0.5),(3,0.25),(4,0.1)])
    return vel * out * np.minimum(1, t/0.003) * 0.28

def strings(f, dur, vel=0.4, a=0.6, r=1.2):
    n = int((dur + r) * SR); t = np.arange(n) / SR
    vib = 1 + 0.003*np.sin(2*np.pi*5.2*t) * np.minimum(1, t/0.8)
    ph = 2*np.pi*np.cumsum(f*vib)/SR
    out = sum(np.sin(k*ph)/k**1.1 for k in range(1, 9))
    return vel * out * env_adsr(n, a, 0.3, 0.9, r) * 0.12

# 6) 놀라운 은총 (Amazing Grace, 뉴브리튼 곡조 1829, 공유 저작물) — 피아노 + 현악
def amazing_grace():
    b = 0.8
    mel = [('D4',1),('G4',2),('B4',.5),('G4',.5),('B4',2),('A4',1),('G4',2),('E4',1),('D4',2),('D4',1),
           ('G4',2),('B4',.5),('G4',.5),('B4',2),('A4',1),('D5',3),('D5',2),('B4',1),
           ('D5',2),('B4',.5),('G4',.5),('B4',2),('A4',1),('G4',2),('E4',1),('D4',2),('D4',1),
           ('G4',2),('B4',.5),('G4',.5),('B4',2),('A4',1),('G4',3)]
    bars = ['G','G','C','G','G','G','D','D','G','G','C','G','G','D','G']
    CH = {'G':['G2','D3','B3'],'C':['C3','G3','E4'],'D':['D3','A3','F#4']}
    tr = Track(80)
    for rep in range(2):
        off = 0.6 + rep * 37 * b
        t = off
        for n, d in mel:
            tr.add(piano(hz(n), d*b, 0.55), t); t += d*b
        for i, c in enumerate(bars):
            t0 = off + b + i*3*b
            for f in chord(CH[c]):
                tr.add(strings(f, 3*b, 0.3 if rep else 0.22), t0)
            tr.add(piano(hz(CH[c][0]), 3*b, 0.32), t0)
    tr.render(OUT + '/amazing-grace.wav', length=0.6 + 2*37*b + 3)

# 7) 환희의 송가 (베토벤 교향곡 9번, 공유 저작물) — 오르간
def ode_to_joy():
    q = 0.62
    l1 = [('E4',1),('E4',1),('F4',1),('G4',1),('G4',1),('F4',1),('E4',1),('D4',1),('C4',1),('C4',1),('D4',1),('E4',1)]
    a1 = l1 + [('E4',1.5),('D4',.5),('D4',2)]
    a2 = l1 + [('D4',1.5),('C4',.5),('C4',2)]
    bb = [('D4',1),('D4',1),('E4',1),('C4',1),('D4',1),('E4',.5),('F4',.5),('E4',1),('C4',1),
          ('D4',1),('E4',.5),('F4',.5),('E4',1),('D4',1),('C4',1),('D4',1),('G3',2)]
    mel = (a1 + a2 + bb + a2) * 2   # 두 번
    harm = {'C':['C3','G3','E4'],'G':['G2','D3','B3'],'F':['F2','C3','A3']}
    prog = ['C','G','C','G','C','G','C','C', 'G','C','G','C','G','C','G','G', 'C','G','C','G','C','G','C','C']
    prog = ['C','G','C','G','C','G','C','C','G','C','G','C','G','C','G','C','C','G','C','G','C','G','C','C'][:16] + ['C','G','C','C']
    tr = Track(100)
    t = 0.5
    for n, d in mel:
        tr.add(organ(hz(n)*2, d*q*0.95, 0.5), t); t += d*q
    total_beats = sum(d for _, d in mel)
    bars = int(total_beats // 4)
    seq = (['C','G','C','G','C','G','C','C'] + ['G','C','G','C'] + ['C','G','C','C'])
    for i in range(bars):
        c = seq[i % len(seq)]
        for f in chord(harm[c]):
            tr.add(organ(f, 4*q*0.97, 0.3), 0.5 + i*4*q)
    tr.render(OUT + '/ode-to-joy.wav', length=t + 3)

# 8) 새벽 묵상 (하프, 직접 작곡)
def dawn_harp():
    beat = 0.5
    prog = [['A2','E3','A3','C4','E4'],['F2','C3','F3','A3','C4'],['C3','G3','C4','E4','G4'],['G2','D3','G3','B3','D4'],
            ['D3','A3','D4','F4','A4'],['G2','D3','G3','B3','D4'],['C3','G3','C4','E4','G4'],['E2','B2','E3','G#3','B3']]
    mel = ['E5','C5','G5','D5','F5','D5','E5','B4']
    tr = Track(80)
    for cyc in range(2):
        for i, ch in enumerate(prog):
            t0 = 0.4 + (cyc*8 + i) * 8*beat
            order = [0,1,2,3,4,3,2,1]
            for k in range(8):
                tr.add(harp(hz(ch[order[k]]), beat*2, 0.45), t0 + k*beat)
            if cyc == 1:
                tr.add(harp(hz(mel[i]), 4*beat, 0.4), t0)
                tr.add(harp(hz(mel[(i + 3) % 8]), 3*beat, 0.3), t0 + 4*beat)
            tr.add(pad(hz(ch[1]), 8*beat, 0.15, a=1.2, r=1.5), t0)
    tr.render(OUT + '/dawn-harp.wav', length=0.4 + 16*8*beat + 3)

# 9) 성당의 아침 (피아노, 직접 작곡)
def morning_piano():
    beat = 0.66
    prog = [['F2','C3','A3'],['C3','G3','E4'],['D3','A3','F4'],['Bb2','F3','D4']]
    phrases = [['A4','C5','F5','E5'],['G5','E5','C5','D5'],['F5','A5','G5','F5'],['D5','C5','A4','C5'],
               ['A4','C5','D5','C5'],['E5','G5','E5','C5'],['D5','F5','A5','G5'],['F5','E5','D5','F5']]
    tr = Track(80)
    i = 0
    for cyc in range(6):
        for j, ch in enumerate(prog):
            t0 = 0.4 + i*4*beat
            tr.add(piano(hz(ch[0]), 4*beat, 0.4), t0)
            tr.add(piano(hz(ch[1]), 3*beat, 0.3), t0 + beat)
            tr.add(piano(hz(ch[2]), 2*beat, 0.3), t0 + 2*beat)
            if cyc >= 1:
                ph = phrases[(i) % len(phrases)]
                for k, n in enumerate(ph):
                    tr.add(piano(hz(n), beat*1.2, 0.42 if cyc < 5 else 0.3), t0 + k*beat)
            i += 1
    for n in ['F2','C3','F3','A3','C4','F4']:
        tr.add(piano(hz(n), 4.0, 0.35), 0.4 + i*4*beat)
    tr.render(OUT + '/morning-piano.wav', length=0.4 + i*4*beat + 5)

# 10) 촛불 (현악, 직접 작곡)
def candle_strings():
    seg = 4.0
    prog = [['D3','A3','F4'],['Bb2','F3','D4'],['F2','C4','A4'],['C3','G3','E4'],['G2','D3','Bb3'],['D3','A3','F4'],['A2','E3','C#4'],['D3','A3','D4']]
    mel = [('A4',2),('F4',2),('D5',3),('C5',1),('A4',4),('G4',2),('Bb4',2),('A4',4),('F4',2),('E4',2),('D4',4)]
    tr = Track(80)
    for rep in range(2):
        off = 0.4 + rep*len(prog)*seg
        for i, ch in enumerate(prog):
            for n in ch:
                tr.add(strings(hz(n), seg, 0.35, a=1.2, r=1.8), off + i*seg)
        if rep == 1 or True:
            t = off + seg * 0.5
            for n, d in mel:
                tr.add(strings(hz(n), d*0.95, 0.42 if rep else 0.3, a=0.35, r=0.8), t); t += d
    tr.render(OUT + '/candle-strings.wav', length=0.4 + 2*len(prog)*seg + 4)

def guitar(f, dur, vel=0.5):
    n = int((dur + 1.5) * SR); t = np.arange(n) / SR
    out = sum(a*np.sin(2*np.pi*f*k*t)*np.exp(-t/(0.9/k**0.8)) for k, a in [(1,1),(2,0.7),(3,0.45),(4,0.3),(5,0.18),(6,0.1)])
    return vel * out * np.minimum(1, t/0.002) * 0.2

def bell(f, dur, vel=0.5):
    n = int((dur + 4) * SR); t = np.arange(n) / SR
    parts = [(0.56,0.6,2.5),(0.92,0.4,1.8),(1.0,1.0,3.0),(1.19,0.3,1.2),(1.71,0.25,0.9),(2.0,0.35,1.4),(2.74,0.2,0.6),(3.0,0.15,0.5),(4.07,0.1,0.3)]
    out = sum(a*np.sin(2*np.pi*f*r*t)*np.exp(-t/d) for r, a, d in parts)
    return vel * out * np.minimum(1, t/0.002) * 0.18

# 11) 짐노페디 1번 (사티 1888, 공유 저작물) — 피아노
def gymnopedie():
    b = 0.78
    A = [('G2', ['B3','D4','F#4']), ('D2', ['A3','C#4','F#4'])]
    mel = [None, None, None, None,
           [None,'F#5','A5'], ['G5','F#5','C#5'], ['B4','C#5','D5'], ['A4',None,None],
           ['F#4',None,None], [None,None,None], [None,None,None], [None,None,None],
           [None,'F#5','A5'], ['G5','F#5','C#5'], ['B4','C#5','D5'], ['A4',None,None],
           ['C#5',None,None], ['D5',None,None], ['E5',None,None], ['F#5',None,None]]
    tr = Track(80)
    for rep in range(2):
        for i, m in enumerate(mel):
            bar = rep*len(mel) + i
            t0 = 0.4 + bar*3*b
            bass, ch = A[bar % 2]
            tr.add(piano(hz(bass), 3*b, 0.4), t0)
            for n in ch: tr.add(piano(hz(n), 2*b, 0.22), t0 + b)
            if m:
                for k, n in enumerate(m):
                    if n: tr.add(piano(hz(n), 2.5*b, 0.45), t0 + k*b)
    end = 0.4 + 2*len(mel)*3*b
    for n in ['D2','A3','D4','F#4']: tr.add(piano(hz(n), 4, 0.3), end)
    tr.render(OUT + '/gymnopedie.wav', length=end + 5)

# 12) 엘리제를 위하여 (베토벤, 공유 저작물) — 피아노
def fur_elise():
    s = 0.19  # 16분음표
    RH = [('E5',1),('D#5',1),
          ('E5',1),('D#5',1),('E5',1),('B4',1),('D5',1),('C5',1),
          ('A4',2),(None,1),('C4',1),('E4',1),('A4',1),
          ('B4',2),(None,1),('E4',1),('G#4',1),('B4',1),
          ('C5',2),(None,1),('E4',1),('E5',1),('D#5',1),
          ('E5',1),('D#5',1),('E5',1),('B4',1),('D5',1),('C5',1),
          ('A4',2),(None,1),('C4',1),('E4',1),('A4',1),
          ('B4',2),(None,1),('E4',1),('C5',1),('B4',1),
          ('A4',6)]
    LH = {8: ['A2','E3','A3'], 14: ['E2','E3','G#3'], 20: ['A2','E3','A3'], 32: ['A2','E3','A3'], 38: ['E2','E3','G#3'], 44: ['A2','E3','A3']}
    total = sum(d for _, d in RH)
    tr = Track(80)
    for rep in range(6):
        off = 0.4 + rep*(total + 2)*s
        t = off; pos = 0
        for n, d in RH:
            if n: tr.add(piano(hz(n), d*s*1.4, 0.45), t)
            if pos in LH:
                for k, ln in enumerate(LH[pos]): tr.add(piano(hz(ln), 3*s, 0.32), off + (pos + k)*s)
            t += d*s; pos += d
    tr.render(OUT + '/fur-elise.wav', length=0.4 + 6*(total + 2)*s + 4)

# 13) 평화의 강 (기타, 직접 작곡)
def peace_guitar():
    b = 0.42
    prog = [['C3','G3','C4','E4'],['G2','D3','G3','B3'],['A2','E3','A3','C4'],['F2','C3','F3','A3']]
    mel = ['E5','D5','C5','D5','E5','G5','E5','D5','C5','A4','C5','D5','C5','B4','A4','G4']
    tr = Track(80)
    bar = 0
    for cyc in range(9):
        for i, ch in enumerate(prog):
            t0 = 0.4 + bar*8*b
            order = [0,2,1,3,2,3,1,2]
            for k in range(8): tr.add(guitar(hz(ch[order[k]]), 2*b, 0.45 if k == 0 else 0.32), t0 + k*b)
            if 2 <= cyc <= 7:
                tr.add(guitar(hz(mel[(bar*2) % 16]), 3*b, 0.42), t0)
                tr.add(guitar(hz(mel[(bar*2 + 1) % 16]), 3*b, 0.36), t0 + 4*b)
            bar += 1
    tr.render(OUT + '/peace-guitar.wav', length=0.4 + bar*8*b + 3)

# 14) 성탄 종소리 (직접 작곡)
def christmas_bells():
    b = 0.55
    mel = ['G4','E4','C5','G4','A4','G4','E4','D4','C4','E4','G4','C5','A4','G4','E4','G4',
           'C5','D5','E5','D5','C5','A4','G4','E4','F4','A4','G4','E4','D4','E4','C4','C4']
    chords = [['C3','E3','G3'],['A2','C3','E3'],['F2','A2','C3'],['G2','B2','D3']]
    tr = Track(80)
    for rep in range(2):
        off = 0.4 + rep*len(mel)*2*b
        for i, n in enumerate(mel):
            tr.add(bell(hz(n), 2*b, 0.5), off + i*2*b)
        for j in range(len(mel)//4):
            for n in chords[j % 4]:
                tr.add(pad(hz(n), 8*b, 0.3, a=0.8, r=1.5), off + j*8*b)
    tr.render(OUT + '/christmas-bells.wav', length=0.4 + 2*len(mel)*2*b + 5)

# 15) 묵주 기도 (오르골, 직접 작곡)
def rosary_musicbox():
    b = 0.5
    mel = ['A4','C5','F5','E5','D5','C5','A4','C5','Bb4','D5','G5','F5','E5','C5','G4','C5',
           'A4','C5','F5','A5','G5','F5','E5','D5','C5','Bb4','A4','G4','F4','A4','C5','F5']
    chords = [['F2','C3','A3'],['Bb2','F3','D4'],['C3','G3','E4'],['F2','C3','A3']]
    tr = Track(80)
    for rep in range(2):
        off = 0.4 + rep*len(mel)*2*b
        for i, n in enumerate(mel):
            tr.add(musicbox(hz(n)*2, 2*b, 0.5), off + i*2*b)
            if i % 2 == 1: tr.add(musicbox(hz(n), 1*b, 0.25), off + i*2*b + b)
        for j in range(len(mel)//4):
            for n in chords[j % 4]:
                tr.add(pad(hz(n), 8*b, 0.25, a=1.0, r=1.5), off + j*8*b)
    tr.render(OUT + '/rosary-musicbox.wav', length=0.4 + 2*len(mel)*2*b + 4)

def marimba(f, dur, vel=0.5):
    n = int((dur + 1.2) * SR); t = np.arange(n) / SR
    out = np.sin(2*np.pi*f*t)*np.exp(-t/0.55) + 0.25*np.sin(2*np.pi*f*3.93*t)*np.exp(-t/0.12) + 0.08*np.sin(2*np.pi*f*9.2*t)*np.exp(-t/0.04)
    return vel * out * np.minimum(1, t/0.002) * 0.3

def cello(f, dur, vel=0.4):
    return strings(f, dur, vel, a=0.25, r=0.7)

# 16) 그린슬리브스 (영국 민요, 공유 저작물) — 기타 + 현악
def greensleeves():
    e = 0.36  # 8분음표 (6/8)
    mel = [('A4',1),
           ('C5',2),('D5',1),('E5',1.5),('F5',.5),('E5',1), ('D5',2),('B4',1),('G4',1.5),('A4',.5),('B4',1),
           ('C5',2),('A4',1),('A4',1.5),('G#4',.5),('A4',1), ('B4',2),('G#4',1),('E4',2),('A4',1),
           ('C5',2),('D5',1),('E5',1.5),('F5',.5),('E5',1), ('D5',2),('B4',1),('G4',1.5),('A4',.5),('B4',1),
           ('C5',1.5),('B4',.5),('A4',1),('G#4',1.5),('F#4',.5),('G#4',1), ('A4',3),('A4',2),
           ('G5',3),('G5',1.5),('F#5',.5),('E5',1), ('D5',2),('B4',1),('G4',1.5),('A4',.5),('B4',1),
           ('C5',2),('A4',1),('A4',1.5),('G#4',.5),('A4',1), ('B4',2),('G#4',1),('E4',3),
           ('G5',3),('G5',1.5),('F#5',.5),('E5',1), ('D5',2),('B4',1),('G4',1.5),('A4',.5),('B4',1),
           ('C5',1.5),('B4',.5),('A4',1),('G#4',1.5),('F#4',.5),('G#4',1), ('A4',6)]
    bars = ['Am','G','Am','E','Am','G','Am','E','Am','Am','C','G','Am','E','C','G','Am','E','Am','Am']
    CH = {'Am':['A2','E3','A3','C4'],'G':['G2','D3','G3','B3'],'E':['E2','B2','E3','G#3'],'C':['C3','G3','C4','E4']}
    tr = Track(100)
    length = sum(d for _, d in mel) * e
    for rep in range(2):  # 두 번 (두 번째는 현악이 조금 더)
        off = 0.4 + rep * (length + e)
        t = off + e
        for n, d in mel:
            tr.add(guitar(hz(n), d*e*1.3, 0.5), t); t += d*e
        for i, c in enumerate(bars):
            t0 = off + e + i*6*e
            ch = CH[c]
            for k, idx in enumerate([0, 2, 3, 1, 2, 3]):
                tr.add(guitar(hz(ch[idx]), 2*e, 0.3), t0 + k*e)
            tr.add(strings(hz(ch[1]), 6*e, 0.18 if rep == 0 else 0.28), t0)
    tr.render(OUT + '/greensleeves.wav', length=t + 3)

# 17) 꿈속의 고향 (드보르자크 '신세계' 2악장 주제, 공유 저작물) — 현악 + 피아노
def going_home():
    q = 0.8
    mel = [('E4',1),('G4',1),('G4',2), ('E4',1),('D4',1),('C4',2), ('D4',1),('E4',1),('G4',1),('E4',1), ('D4',4),
           ('E4',1),('G4',1),('G4',2), ('E4',1),('D4',1),('C4',2), ('D4',1),('E4',1),('D4',1),('C4',1), ('C4',4)]
    CH = [['C3','G3','E4'],['F2','C3','A3'],['C3','G3','E4'],['G2','D3','B3'],['C3','G3','E4'],['F2','C3','A3'],['G2','D3','B3'],['C3','G3','C4']]
    tr = Track(90)
    for rep in range(2):
        off = 0.4 + rep*32*q
        t = off
        for n, d in mel:
            tr.add(strings(hz(n)*2, d*q*0.97, 0.45 if rep else 0.38, a=0.3, r=0.9), t); t += d*q
        for i, ch in enumerate(CH):
            for n in ch: tr.add(strings(hz(n), 4*q, 0.22, a=0.8, r=1.2), off + i*4*q)
            tr.add(piano(hz(ch[0]), 4*q, 0.3), off + i*4*q)
    tr.render(OUT + '/going-home.wav', length=0.4 + 64*q + 4)

# 18) 봄날의 산책 (마림바, 직접 작곡)
def spring_marimba():
    s8 = 0.3
    prog = [['C3','G3','C4','E4'],['A2','E3','A3','C4'],['F2','C3','F3','A3'],['G2','D3','G3','B3']]
    mel = ['E5','G5','A5','G5','E5','D5','C5','D5', 'E5','D5','C5','A4','G4','A4','C5','D5',
           'C5','A4','F4','A4','C5','D5','E5','F5', 'D5','B4','G4','B4','D5','E5','D5','B4']
    tr = Track(90)
    bar = 0
    for cyc in range(7):
        for i, ch in enumerate(prog):
            t0 = 0.4 + bar*8*s8
            for k in range(8):
                tr.add(marimba(hz(ch[[0,2,1,3,2,3,1,2][k]]), s8*1.5, 0.35), t0 + k*s8)
            if 1 <= cyc <= 5:
                for k in range(8):
                    if k % 2 == 0 or cyc >= 3:
                        tr.add(marimba(hz(mel[(i*8 + k) % 32]), s8*1.5, 0.42), t0 + k*s8)
            bar += 1
    tr.render(OUT + '/spring-marimba.wav', length=0.4 + bar*8*s8 + 3)

# 19) 성모의 노래 (첼로, 직접 작곡)
def mary_cello():
    q = 0.9
    prog = [['G2','D3','B3'],['E2','B2','G3'],['C3','G3','E4'],['D3','A3','F#4'],['G2','D3','B3'],['C3','G3','E4'],['A2','E3','C4'],['D3','A3','F#4']]
    mel = [('B3',2),('D4',1),('G4',1),('E4',3),('D4',1),('C4',2),('E4',2),('A3',4),
           ('B3',2),('D4',2),('G4',2),('F#4',1),('E4',1),('D4',3),('C4',1),('B3',4)]
    tr = Track(90)
    for rep in range(2):
        off = 0.4 + rep*32*q
        t = off
        for n, d in mel:
            tr.add(cello(hz(n), d*q*0.97, 0.5), t); t += d*q
        for i, ch in enumerate(prog):
            for n in ch: tr.add(pad(hz(n), 4*q, 0.25, a=1.0, r=1.5), off + i*4*q)
            tr.add(harp(hz(ch[2])*2, 2*q, 0.25), off + i*4*q + 2*q)
    tr.render(OUT + '/mary-cello.wav', length=0.4 + 64*q + 4)

# 20) 저녁 기도 (피아노 + 화음, 직접 작곡)
def evening_prayer():
    q = 0.75
    prog = [['D3','A3','F#4'],['B2','F#3','D4'],['G2','D3','B3'],['A2','E3','C#4']]
    mel = ['F#5','E5','D5','E5','D5','B4','A4','B4','G4','A4','B4','D5','C#5','E5','D5','C#5']
    tr = Track(90)
    i = 0
    for cyc in range(6):
        for j, ch in enumerate(prog):
            t0 = 0.4 + i*4*q
            for n in ch: tr.add(pad(hz(n), 4*q, 0.25, a=1.0, r=1.4), t0)
            tr.add(piano(hz(ch[0]), 4*q, 0.35), t0)
            tr.add(piano(hz(ch[2]), 2*q, 0.25), t0 + 2*q)
            if cyc >= 1:
                for k in range(4):
                    if cyc < 5 or k % 2 == 0:
                        tr.add(piano(hz(mel[(j*4 + k) % 16]), q*1.4, 0.4), t0 + k*q)
            i += 1
    for n in ['D2','A2','D3','F#3','A3','D4']:
        tr.add(piano(hz(n), 4, 0.33), 0.4 + i*4*q)
    tr.render(OUT + '/evening-prayer.wav', length=0.4 + i*4*q + 5)

ALL = {f.__name__: f for f in (silent_night, canon, bach, hymn, ambient, amazing_grace, ode_to_joy, dawn_harp, morning_piano, candle_strings,
                               gymnopedie, fur_elise, peace_guitar, christmas_bells, rosary_musicbox,
                               greensleeves, going_home, spring_marimba, mary_cello, evening_prayer)}
for name in (sys.argv[2:] or ALL):
    ALL[name](); print('done', name, flush=True)
