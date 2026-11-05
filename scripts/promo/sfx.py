# 효과음을 직접 만들어 노래와 섞는다 (저작권 걱정 없는 합성음 + 앱의 알림 소리)
import numpy as np, subprocess, wave, sys, os
SR = 48000
DUR = 60.0
T0, BAR, BEAT = 0.3947, 2.4, 0.6
bar = lambda k: T0 + BAR * k
rng = np.random.default_rng(7)

def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()

def env(n, a=0.002, d=0.08):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def tap():
    n = int(0.09 * SR); t = np.arange(n) / SR
    x = 0.6 * np.sin(2 * np.pi * 1650 * t) * env(n, 0.001, 0.018) + 0.35 * np.sin(2 * np.pi * 2900 * t) * env(n, 0.001, 0.01)
    x += 0.25 * rng.standard_normal(n) * env(n, 0.0005, 0.004)
    return x

def pop(f0=520):
    n = int(0.16 * SR); t = np.arange(n) / SR
    f = f0 * (1.9 - 0.9 * np.minimum(1, t / 0.06))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (0.8 * np.sin(ph) + 0.2 * np.sin(2 * ph)) * env(n, 0.002, 0.045)

def sparkle(n_notes=6, base=2200):
    n = int(0.7 * SR); x = np.zeros(n)
    for k in range(n_notes):
        st = int(k * 0.055 * SR); m = n - st; t = np.arange(m) / SR
        f = base * (1.12 ** rng.integers(0, 12))
        x[st:] += 0.35 * np.sin(2 * np.pi * f * t) * env(m, 0.001, 0.12)
    return x

def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
    return y

def whoosh(dur=0.42, up=True):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # 두 가지 저역 통과를 섞어 소리가 위로(아래로) 쓸려 가는 느낌
    lo, hi = lowpass(noise, 600), lowpass(noise, 4500)
    w = t / dur if up else 1 - t / dur
    x = (1 - w) * lo * 2.2 + w * (hi - lowpass(hi, 900)) * 1.4
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return 0.55 * x * e

def party():
    n = int(0.25 * SR)
    burst = rng.standard_normal(n) * env(n, 0.001, 0.05) * 0.5
    return np.concatenate([burst, np.zeros(int(0.5 * SR))]) + np.pad(sparkle(8, 1800), (0, int(0.75 * SR) - int(0.7 * SR)))[: int(0.75 * SR)]

def tick():
    n = int(0.05 * SR); t = np.arange(n) / SR
    return 0.5 * np.sin(2 * np.pi * 3200 * t) * env(n, 0.0005, 0.008)

music = decode('/home/user/catholicgram/public/bgm/new-beginning.mp3')
N = int(DUR * SR)
mus = np.zeros((N, 2), np.float32); m = min(N, len(music)); mus[:m] = music[:m]
fxbus = np.zeros((N, 2), np.float32)
duck = np.ones(N, np.float32)

def add(t, x, gain=0.5, pan=0.0):
    i = int(t * SR)
    if i >= N: return
    x = x[: N - i] * gain
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    fxbus[i:i + len(x), 0] += x * l * 1.414
    fxbus[i:i + len(x), 1] += x * r * 1.414

def add_file(t, path, gain=1.0):
    y = decode(path) * gain; i = int(t * SR); y = y[: N - i]
    fxbus[i:i + len(y)] += y
    return len(y) / SR

def duck_at(t, dur, depth=0.45):
    a, b = int(t * SR), int((t + dur) * SR); r = int(0.08 * SR)
    for k in range(a - r, b + r):
        if 0 <= k < N:
            if k < a: g = 1 - (1 - depth) * (k - (a - r)) / r
            elif k > b: g = depth + (1 - depth) * (k - b) / r
            else: g = depth
            duck[k] = min(duck[k], g)

notify = '/home/user/catholicgram/public/sounds/notify/'
# ---- 장면별 소리 (stage.html 과 같은 시각) ----
add(0.15, pop(440), 0.55); add(0.2, sparkle(7, 2000), 0.25)                     # 앱 아이콘 통!
add(0.9, whoosh(0.35, True), 0.35)                                              # 이름
for k, (dt, f, pan) in enumerate([(0, 520, -0.5), (0.3, 600, 0.5), (0.6, 680, -0.5), (0.9, 760, 0.5)]):
    add(bar(1) + dt, pop(f), 0.5, pan)                                          # 캐릭터 넷
add(4.2, whoosh(0.6, True), 0.55)                                               # 폰이 올라옴
for k in range(2, 23):                                                          # 장면이 바뀔 때 휙
    if k in (2, 3): continue
    add(bar(k) - 0.06, whoosh(0.36, k % 2 == 0), 0.32, 0.25 if k % 2 else -0.25)
add(bar(4) + 0.6, tap(), 0.7); add(bar(4) + 0.65, pop(600), 0.5); add(bar(4) + 0.66, sparkle(5, 2400), 0.2)
add(bar(4) + 1.2, tap(), 0.7); add(bar(4) + 1.25, pop(700), 0.5)
add(bar(5) + 0.9, pop(560), 0.45); add(bar(5) + 1.5, pop(680), 0.45)
add(bar(6) + 0.35, party(), 0.45); add(bar(6) + 1.6, tap(), 0.7); add(bar(6) + 1.65, party(), 0.4)
add(bar(7) + 0.55, tap(), 0.7); add(bar(7) + 2.0, tap(), 0.7); add(bar(7) + 2.45, sparkle(8, 2600), 0.3); add(bar(7) + 2.45, pop(640), 0.4)
add(bar(10) + 1.3, tap(), 0.7)
add(bar(11) + 1.0, tap(), 0.6); add(bar(11) + 1.18, tap(), 0.6); add(bar(11) + 1.22, pop(720), 0.45)
add(bar(12) + 1.6, pop(660), 0.45); add(bar(12) + 1.62, sparkle(4, 2400), 0.15)
add(bar(14) + 0.8, pop(560), 0.4, -0.5); add(bar(14) + 1.4, pop(640), 0.4, 0.5); add(bar(14) + 2.7, pop(700), 0.4)
add(bar(16) + 1.0, tap(), 0.7); add(bar(16) + 1.05, pop(600), 0.4)
add(bar(17) + 1.0, tap(), 0.7); add(bar(17) + 1.05, pop(640), 0.4)
add(bar(18) + 1.25, tap(), 0.7); add(bar(18) + 3.3, tap(), 0.7)
# 알림: 휴대폰 위쪽 알림 + "찬미예수님!"
d = add_file(bar(20) + 0.15, notify + 'catholicgram-praise.mp3', 1.15); duck_at(bar(20) + 0.15, d, 0.35)
add(bar(20) + 0.25, sparkle(5, 2200), 0.15)
for k in range(1, 5): add(bar(21) + k * 0.48, tick(), 0.5); add(bar(21) + k * 0.48, whoosh(0.2, True), 0.18)
for k in range(8): add(bar(22) + 0.15 + k * 0.27, pop(480 + k * 45), 0.42, (-0.4 if k % 2 == 0 else 0.4))
add(bar(23), pop(420), 0.6); add(bar(23) + 0.2, party(), 0.5); add(bar(23) + 0.25, sparkle(8, 2000), 0.25)
for k in range(4): add(bar(23) + 1.6 + k * 0.3, pop(560 + k * 60), 0.45, -0.6 + k * 0.4)

# 내레이션 자리 (나중에 녹음 파일이 오면 narration/*.wav 를 여기서 넣는다)
NARR = os.environ.get('NARR')
narr = np.zeros((N, 2), np.float32)
if NARR and os.path.isdir(NARR):
    import json
    for item in json.load(open(os.path.join(NARR, 'cues.json'))):
        y = decode(os.path.join(NARR, item['file'])) * item.get('gain', 1.0)
        i = int(item['t'] * SR); y = y[: N - i]; narr[i:i + len(y)] += y
        duck_at(item['t'], len(y) / SR, 0.32)

# 끝: 노래가 59.18초에 끝나므로 그대로, 마지막 0.3초만 살짝 줄임
fade = np.ones(N, np.float32); fl = int(0.3 * SR); fade[-fl:] = np.linspace(1, 0, fl)
mix = mus * duck[:, None] * 0.92 + fxbus * 0.9 + narr
mix *= fade[:, None]
peak = np.abs(mix).max(); print('peak', round(float(peak), 3))
mix = np.tanh(mix * 1.05) / np.tanh(1.05) * 0.97 if peak > 0.97 else mix
out = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/cgpromo/mix.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok')
