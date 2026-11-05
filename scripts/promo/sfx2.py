# 2차본(자유 제작) 소리: 운영자 곡 '새로운 시작' + 직접 합성한 쾅·휙·올라가는 소리·드럼 + 앱 알림 목소리
import numpy as np, subprocess, wave, sys, os
SR = 48000
DUR = 60.0
T0, BAR, BEAT = 0.3947, 2.4, 0.6
bar = lambda k: T0 + BAR * k
beat = lambda k: T0 + BEAT * k
rng = np.random.default_rng(11)

def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()
def env(n, a=0.002, d=0.08):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
    return y
def tap():
    n = int(0.09 * SR); t = np.arange(n) / SR
    return 0.6 * np.sin(2 * np.pi * 1650 * t) * env(n, .001, .018) + 0.35 * np.sin(2 * np.pi * 2900 * t) * env(n, .001, .01) + 0.25 * rng.standard_normal(n) * env(n, .0005, .004)
def pop(f0=520):
    n = int(0.16 * SR); t = np.arange(n) / SR
    f = f0 * (1.9 - 0.9 * np.minimum(1, t / 0.06)); ph = 2 * np.pi * np.cumsum(f) / SR
    return (0.8 * np.sin(ph) + 0.2 * np.sin(2 * ph)) * env(n, .002, .045)
def sparkle(k=6, base=2200, d=0.12):
    n = int(0.8 * SR); x = np.zeros(n)
    for i in range(k):
        st = int(i * 0.05 * SR); m = n - st; t = np.arange(m) / SR
        x[st:] += 0.33 * np.sin(2 * np.pi * base * (1.12 ** rng.integers(0, 12)) * t) * env(m, .001, d)
    return x
def whoosh(dur=0.4, up=True):
    n = int(dur * SR); t = np.arange(n) / SR; noise = rng.standard_normal(n)
    lo, hi = lowpass(noise, 600), lowpass(noise, 5000)
    w = t / dur if up else 1 - t / dur
    x = (1 - w) * lo * 2.2 + w * (hi - lowpass(hi, 900)) * 1.4
    return 0.55 * x * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
def boom():
    n = int(1.4 * SR); t = np.arange(n) / SR
    f = 30 + 45 * np.exp(-t / 0.12); ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * env(n, .002, .45)
    click = rng.standard_normal(n) * env(n, .0005, .012) * 0.6
    body = lowpass(rng.standard_normal(n), 900) * env(n, .002, .18) * 1.5
    return 0.55 * (0.9 * sub + click + body)
def crash(dur=2.2):
    n = int(dur * SR); noise = rng.standard_normal(n)
    hi = noise - lowpass(noise, 3500)
    return 0.45 * hi * env(n, .001, .7)
def riser(dur=2.4):
    n = int(dur * SR); t = np.arange(n) / SR; w = t / dur
    noise = rng.standard_normal(n)
    lo, hi = lowpass(noise, 800), noise - lowpass(noise, 1500)
    nz = (1 - w) * lo * 1.6 + w * hi * 0.9
    f = 180 + 1400 * w ** 2; ph = 2 * np.pi * np.cumsum(f) / SR
    tone = 0.25 * np.sin(ph) + 0.12 * np.sin(2 * ph)
    return (nz * 0.35 + tone) * (w ** 1.8)
def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.03); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, .001, .16) + 0.3 * rng.standard_normal(n) * env(n, .0005, .004)
def snare():
    n = int(0.25 * SR); t = np.arange(n) / SR
    nz = rng.standard_normal(n); nz = nz - lowpass(nz, 1200)
    return 0.6 * nz * env(n, .001, .07) + 0.4 * np.sin(2 * np.pi * 190 * t) * env(n, .001, .05)
def clap():
    n = int(0.3 * SR); x = np.zeros(n); nz = rng.standard_normal(n); nz = nz - lowpass(nz, 1000)
    for d in (0, .011, .023): i = int(d * SR); x[i:] += nz[: n - i] * env(n - i, .0005, .02 if d < .02 else .12)
    return 0.5 * x
def heart():
    n = int(0.6 * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for d, g in ((0, 1), (0.18, .7)):
        i = int(d * SR); m = n - i; tt = np.arange(m) / SR
        x[i:] += g * np.sin(2 * np.pi * (55 + 30 * np.exp(-tt / .03)) * tt) * env(m, .002, .09)
    return x
def tick():
    n = int(0.05 * SR); t = np.arange(n) / SR
    return 0.5 * np.sin(2 * np.pi * 3200 * t) * env(n, .0005, .008)

music = decode('/home/user/catholicgram/public/bgm/new-beginning.mp3')
N = int(DUR * SR)
mus = np.zeros((N, 2), np.float32); m = min(N, len(music)); mus[:m] = music[:m]
fx = np.zeros((N, 2), np.float32)
duck = np.ones(N, np.float32)
def add(t, x, g=0.5, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0: return
    x = x[: N - i] * g; l, r = np.sqrt(.5 * (1 - pan)), np.sqrt(.5 * (1 + pan))
    fx[i:i + len(x), 0] += x * l * 1.414; fx[i:i + len(x), 1] += x * r * 1.414
def add_file(t, path, g=1.0):
    y = decode(path) * g; i = int(t * SR); y = y[: N - i]; fx[i:i + len(y)] += y; return len(y) / SR
def duck_at(t, dur, depth=.4, r=.08):
    a, b, rr = int(t * SR), int((t + dur) * SR), int(r * SR)
    for k in range(max(0, a - rr), min(N, b + rr)):
        g = 1 - (1 - depth) * (k - (a - rr)) / rr if k < a else depth + (1 - depth) * (k - b) / rr if k > b else depth
        duck[k] = min(duck[k], g)
notify = '/home/user/catholicgram/public/sounds/notify/'

# ---- 1막: 질문 (0 ~ 9.995) ----
add(0.0, whoosh(0.45, True), 0.35)
add(beat(0), boom(), 0.55); add(beat(0), whoosh(0.3, False), 0.3)
add(beat(2), boom(), 0.45); add(beat(2) + 0.35, whoosh(0.9, True), 0.35, 0.5)          # 달려가는 사람
for k in range(3): add(bar(1) + k * BEAT, pop(520 + k * 90), 0.55, -0.3 + k * 0.3)       # 질문 셋
add(bar(1) + 3 * BEAT, whoosh(0.25, False), 0.25)
add(bar(2), whoosh(0.5, True), 0.4)                                                     # 질문이 날아감
add(bar(2) + BEAT, pop(600), 0.45); add(bar(2) + BEAT * 2.5, boom(), 0.4)
# 드럼: 2막 앞 두 마디에서 점점
for k in range(8): add(bar(2) + k * BEAT, kick(), 0.32 + 0.04 * k)
for k in (1, 3, 5, 7): add(bar(2) + k * BEAT, clap(), 0.25)
for k in range(8): add(bar(3) + 1.2 + k * 0.15, snare(), 0.18 + 0.03 * k)              # 스네어 롤
add(bar(3), riser(2.4), 0.55)
add(bar(3) + BEAT * 2, boom(), 0.35)                                                    # SNS 쾅
# ---- 드롭 (9.995) ----
add(bar(4) - 0.02, boom(), 0.8); add(bar(4), crash(), 0.55); add(bar(4) + 0.05, sparkle(9, 2000, .18), 0.3)
add(bar(4) + 0.4, whoosh(0.5, True), 0.3, -0.4); add(bar(4) + 0.55, whoosh(0.5, True), 0.3, 0.4)
add(bar(4) + 1.2, pop(560), 0.4, -0.6); add(bar(4) + 1.35, pop(640), 0.4, 0.6)
# ---- 2막: 기능 (마디마다 휙 + 제목 쾅) ----
for k in range(5, 19):
    if k != 5: add(bar(k) - 0.08, whoosh(0.4, k % 2 == 0), 0.38, 0.35 if k % 2 else -0.35)
    add(bar(k) + 0.08, pop(380), 0.28)
for i in range(4): add(bar(6) + 0.25 + i * 0.3, pop(520 + i * 70), 0.42, -0.5 if i % 2 == 0 else 0.5)   # 정보 카드
for i, d in enumerate((0.3, 0.9, 1.5)): add(bar(7) + d, pop(600 + i * 60), 0.42, -0.4 if i % 2 == 0 else 0.4)  # 말풍선
add(bar(8) + 0.5, sparkle(8, 1800, .2), 0.3)                                            # 기도 비
add(bar(9) + 0.55, tap(), 0.7); add(bar(9) + 0.58, pop(620), 0.45); add(bar(9) + 1.15, tap(), 0.7); add(bar(9) + 1.18, pop(720), 0.45)
add(bar(10) + 0.5, crash(1.0), 0.3); add(bar(10) + 0.5, sparkle(10, 2000, .15), 0.3); add(bar(10) + 0.55, pop(500), 0.45)
for i in range(4): add(bar(11) + 0.45 + i * 0.3, pop(560 + i * 60), 0.45, -0.5 if i % 2 == 0 else 0.5)  # 이모티콘이 튀어나옴
for i in range(8): add(bar(12) + 0.2 + i * 0.06, pop(700 + i * 30), 0.18, -0.6 + i * 0.17)            # 교우 사진
add(bar(13) + 0.3, heart(), 0.5); add(bar(13) + 0.9, heart(), 0.45)
add(bar(14) + 0.45, sparkle(8, 2400, .14), 0.3); add(bar(14) + 1.2, whoosh(0.3, True), 0.35)
add(bar(15) + 0.3, sparkle(6, 1600, .25), 0.22)
d = add_file(bar(16) + 0.1, notify + 'catholicgram-praise.mp3', 1.15); duck_at(bar(16) + 0.1, d, 0.35)
add(bar(16) + 0.1, sparkle(5, 2600, .2), 0.2)
add(bar(17) + 1.5, tap(), 0.7); add(bar(17) + 1.55, pop(640), 0.4)
for k in range(1, 5): add(bar(18) + k * 0.48, tick(), 0.5); add(bar(18) + k * 0.48, whoosh(0.18, True), 0.2)
# ---- 3막 ----
add(bar(19), boom(), 0.55); add(bar(19), whoosh(0.8, False), 0.4)                      # 화면 벽
add(bar(19) + 0.6, boom(), 0.35)
for i in range(16): add(bar(20) + i * 0.045, pop(500 + i * 25), 0.12, -0.7 + i * 0.09)  # 교우 사진 모임
add(bar(20) + 1.0, heart(), 0.55); add(bar(20) + 1.6, heart(), 0.45)
add(bar(21) + 0.05, boom(), 0.45)
for i in range(4): add(bar(21) + 0.3 + i * 0.15, pop(600 + i * 50), 0.4, -0.5 + i * 0.33)
add(bar(22), boom(), 0.7); add(bar(22), crash(), 0.45); add(bar(22) + 0.1, sparkle(10, 2000, .2), 0.3)
add(bar(22) + 0.9, pop(480), 0.5)
for k in range(1, 6): add(bar(22) + 1.2 * k, tap(), 0.45)                               # 손가락 톡톡
for i in range(4): add(bar(22) + 1.6 + i * 0.2, pop(560 + i * 60), 0.42, -0.6 + i * 0.4)
d = add_file(bar(22) + 5.6, notify + 'catholicgram-praise.mp3', 1.2); duck_at(bar(22) + 5.6, d, 0.3)

fadeo = np.ones(N, np.float32); fl = int(0.35 * SR); fadeo[-fl:] = np.linspace(1, 0, fl)
mix = (mus * duck[:, None] * 0.9 + fx * 0.85) * fadeo[:, None]
peak = float(np.abs(mix).max()); print('peak', round(peak, 3))
mix = np.tanh(mix * 1.15) / np.tanh(1.15) * 0.97
# 쇼츠 기준(약 -14 LUFS)보다 조금 낮게, 실제 최고점 -1.8dB 안쪽으로 (-2.6dB)
mix *= 10 ** (-2.6 / 20)
out = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/cgpromo/mix2.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok')
