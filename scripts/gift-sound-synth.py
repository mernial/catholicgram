# 선물 상자 축하 소리 (public/sounds/gift-celebrate.mp3, components/GiftBox): 반짝이는 팡파르(도-미-솔-도 + 화음) + 박수 소리, 약 2.4초
# 만들기: python3 scripts/gift-sound-synth.py → celebrate.wav → ffmpeg -i celebrate.wav -codec:a libmp3lame -b:a 96k public/sounds/gift-celebrate.mp3
import numpy as np, wave
SR = 44100
D = 2.4
n = int(SR * D)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(7)

def bell(f, dur, amp):
    t = np.arange(int(SR * dur)) / SR
    env = np.exp(-t * 3.2) * np.minimum(1, t / 0.004)
    tone = (np.sin(2*np.pi*f*t) + 0.45*np.sin(2*np.pi*2*f*t)*np.exp(-t*6) + 0.22*np.sin(2*np.pi*3.01*f*t)*np.exp(-t*9)
            + 0.12*np.sin(2*np.pi*4.2*f*t)*np.exp(-t*14))
    return amp * env * tone

def add(buf, sig, at, pan=0.0):
    i = int(at * SR); j = min(n, i + len(sig))
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:j] += sig[:j - i] * l * 1.4; R[i:j] += sig[:j - i] * r * 1.4

C5, E5, G5, C6, E6, G6 = 523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0
# 빠른 오름 아르페지오
for k, f in enumerate([C5, E5, G5, C6, E6]):
    add(None, bell(f, 0.45, 0.20), 0.02 + k * 0.075, pan=-0.4 + k * 0.2)
# 화음 (팡!)
for f, p in [(C5, -0.3), (E5, 0.3), (G5, -0.1), (C6, 0.1), (G6, 0.0)]:
    add(None, bell(f, 1.6, 0.16), 0.42, pan=p)
# 반짝이 (높은 방울 몇 개)
for k in range(7):
    f = rng.choice([C6 * 2, E6 * 2, G6 * 2, C6 * 3])
    add(None, bell(f, 0.3, 0.05), 0.5 + k * 0.11 + rng.uniform(0, 0.04), pan=rng.uniform(-0.8, 0.8))

# 박수: 짧은 잡음 터짐을 여러 사람이 치듯 촘촘히
def biquad_bp(x, fc, q):
    w0 = 2*np.pi*fc/SR; al = np.sin(w0)/(2*q)
    b0, b1, b2 = al, 0, -al
    a0, a1, a2 = 1+al, -2*np.cos(w0), 1-al
    y = np.zeros_like(x); x1=x2=y1=y2=0.0
    for i, v in enumerate(x):
        o = (b0*v + b1*x1 + b2*x2 - a1*y1 - a2*y2)/a0
        x2, x1, y2, y1 = x1, v, y1, o
        y[i] = o
    return y
def clap():
    m = int(SR * 0.05)
    t = np.arange(m) / SR
    noise = rng.standard_normal(m)
    # 손뼉 한 번 = 아주 짧은 두세 번의 터짐 + 짧은 울림, 1~2.5kHz 대역
    env = np.zeros(m)
    for off in (0, rng.uniform(0.002, 0.005), rng.uniform(0.006, 0.010)):
        tt = t - off
        env += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / rng.uniform(0.003, 0.006)), 0) * rng.uniform(0.5, 1)
    env += np.exp(-t / 0.018) * 0.15
    y = biquad_bp(noise * env, rng.uniform(1000, 2200), rng.uniform(0.9, 1.6))
    return y
start, end = 0.36, D - 0.1
t = start
while t < end:
    x = (t - start) / (end - start)
    density = 40 * np.minimum(1, x / 0.1) * (1 - 0.6 * x) + 5
    amp = 1.7 * np.minimum(1, x / 0.12) * (1 - x) ** 0.6
    add(None, clap() * amp * rng.uniform(0.4, 1.0), t, pan=rng.uniform(-0.9, 0.9))
    t += rng.exponential(1 / density)

# 마무리: 부드럽게 줄이고 맞추기
fade = np.ones(n); fl = int(SR * 0.45); fade[-fl:] = np.linspace(1, 0, fl)
L *= fade; R *= fade
# 손뼉의 뾰족한 끝을 부드럽게 눌러 팡파르와 크기를 맞춘다
L = np.tanh(L * 1.3); R = np.tanh(R * 1.3)
peak = max(np.abs(L).max(), np.abs(R).max())
L = L / peak * 0.89; R = R / peak * 0.89
data = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open('celebrate.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
print('ok', n / SR, 'peak', peak)
