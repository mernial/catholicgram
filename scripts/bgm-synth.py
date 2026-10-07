# 앱 기본 배경음악(public/bgm/*.mp3)을 만드는 스크립트.
# 공유 저작물(저작권이 끝난 곡: 그루버 '고요한 밤', 바흐 전주곡 C장조, 파헬벨 캐논, 제네바 시편가 100편 곡조)과
# 직접 지은 곡을 이 스크립트가 새로 연주·녹음하므로 녹음 저작권도 없음.
# 사용: pip install numpy && python3 scripts/bgm-synth.py <폴더>
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
        self.buf[i:j] += sig[:j-i]
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

for fn in (silent_night, canon, bach, hymn, ambient):
    fn(); print('done', fn.__name__, flush=True)
