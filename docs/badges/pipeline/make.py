# 예시 GIF(운영자 제공)를 바탕으로: 가운데 판만 등급 색 + 문양으로 바꾼 1등 배지, 같은 테로 만든 등급 메달
import sys, math, numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont

W = 716; CX, CY = 358.0, 359.0; R_IN = 121.0; R_OUT = 159.0
NF = 12
FONT = '../r3d/nsr.ttf'
# 등급 색: [어두움, 가운데, 밝음] (운영자: 회색·초록·파랑·빨강·노랑·금·무지개)
RAMP = {
    1: [(52, 58, 66), (128, 137, 148), (224, 229, 236)],
    2: [(8, 74, 30), (34, 160, 72), (150, 235, 160)],
    3: [(10, 40, 110), (36, 110, 225), (150, 205, 255)],
    4: [(100, 0, 12), (222, 24, 40), (255, 140, 130)],
    5: [(176, 120, 0), (255, 222, 20), (255, 250, 170)],
    6: [(104, 50, 0), (218, 136, 6), (255, 212, 84)],
}
NAMES = ['겨자씨', '새싹', '줄기', '꽃', '열매', '큰 나무', '생명의 나무']

def lerp(a, b, t): return a + (b - a) * t
def ramp(L, cols):
    d, m, l = [np.array(c, np.float32) / 255 for c in cols]
    L = L[..., None]
    lo = lerp(d, m, np.clip(L / 0.5, 0, 1)); hi = lerp(m, l, np.clip((L - 0.5) / 0.35, 0, 1)); wt = lerp(l, np.ones(3, np.float32), np.clip((L - 0.85) / 0.3, 0, 1))
    return np.where(L < 0.5, lo, np.where(L < 0.85, hi, wt))

def blur(a, r): return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255

yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
U = (xx - CX) / R_IN; V = (yy - CY) / R_IN; RR = np.hypot(U, V); TH = np.arctan2(V, U)
rng = np.random.default_rng(3)
NOISE = blur(rng.random((W, W)).astype(np.float32), 0.8)

def disc(tier, emb, num=None, phase=0.0):
    """가운데 판: 등급 색 금속판(볼록, 왼쪽 위에서 빛) + 돋을새김 문양 (+숫자 판). RGB float"""
    # 볼록한 판의 밝기
    nz = np.sqrt(np.clip(1 - 0.35 * RR ** 2, 0, 1)); nx = 0.55 * U * 0.6; ny = 0.55 * V * 0.6
    lx, ly, lz = -0.45, -0.6, 0.66
    L = 0.5 + 0.42 * (-(nx * lx + ny * ly)) * 2 + 0.2 * (nz - 0.8)
    L += 0.34 * np.exp(-(((U + 0.38) ** 2 + (V + 0.45) ** 2) / 0.16))            # 넓은 반사광
    L += 0.10 * np.exp(-(((U - 0.45) ** 2 + (V - 0.55) ** 2) / 0.1))             # 아래 되비침
    # 햇살 결(가늘게) + 금속 알갱이
    L += 0.02 * np.sin(TH * 48) * np.clip(RR, 0, 1) + (NOISE - 0.5) * 0.05
    # 테 안쪽 그림자(왼쪽 위) / 밝은 턱(오른쪽 아래)
    edge = np.clip((RR - 0.84) / 0.16, 0, 1); side = -(U * lx + V * ly) / np.maximum(RR, 1e-3)
    L += edge * (-0.38 * np.clip(-side, 0, 1) * 0 - 0.30 * np.clip(side, 0, 1) + 0.22 * np.clip(-side, 0, 1))
    if tier == 7:
        # 무지개 오팔: 각도·대각선에 따라 색이 도는 진주빛
        pal = np.array([(255, 138, 216), (155, 108, 240), (54, 198, 224), (126, 240, 176), (255, 138, 216)], np.float32) / 255
        q = ((U * 0.5 + V * 0.5 + 1) / 2 * 0.9 + 0.05 * np.sin(TH * 3 + RR * 4) + phase * 0.12) % 1.0 * 4
        qi = np.clip(q.astype(int), 0, 3); qf = (q - qi)[..., None]; c = pal[qi] * (1 - qf) + pal[qi + 1] * qf
        Lc = np.clip(L, 0, 1.3)[..., None]
        rgb = lerp(c * 0.6, lerp(c, np.ones(3), 0.3), np.clip(Lc / 0.8, 0, 1)); rgb = lerp(rgb, np.ones(3), np.clip((Lc - 0.8) / 0.4, 0, 1) * 0.9)
        dark = np.array([70, 40, 130], np.float32) / 255
    else:
        if tier == 6: L = 0.5 + (L - 0.5) * 1.35 - 0.03
        rgb = ramp(np.clip(L, 0, 1.3), RAMP[tier]); dark = np.array(RAMP[tier][0], np.float32) / 255
    # --- 문양 돋을새김 ---
    if emb is None: return np.clip(rgb, 0, 1)
    S = int(R_IN * (1.12 if num else 1.3)); e = Image.open(f'emb/{emb}.png').convert('RGBA').resize((S, S), Image.LANCZOS)
    lay = Image.new('RGBA', (W, W), (0, 0, 0, 0)); oy = -R_IN * 0.16 if num else 0
    lay.paste(e, (int(CX - S / 2), int(CY - S / 2 + oy)))
    ea = np.asarray(lay).astype(np.float32) / 255; M = ea[..., 3]; tone = ea[..., :3].mean(-1)
    Hh = blur(M, 2.2); gy, gx = np.gradient(Hh); em = np.clip(-(gx * lx + gy * ly) * 9, -1, 1)   # 왼쪽 위가 밝게
    sh = blur(np.roll(np.roll(M, 5, 0), 4, 1), 4.5)                                              # 드리운 그림자
    rgb = rgb * (1 - 0.6 * sh[..., None] * (1 - M[..., None])) + dark * 0.0
    if tier == 6: face = np.array([1.0, 0.96, 0.74], np.float32); shade = np.array([0.72, 0.42, 0.02], np.float32)
    else: face = np.array([1.0, 0.99, 0.95], np.float32); shade = lerp(dark, np.array([1, 1, 1], np.float32), 0.25)
    fc = lerp(shade, face, np.clip(0.86 + 0.5 * em + 0.1 * (-(V)) , 0, 1)[..., None])
    fc = lerp(dark * 1.2, fc, np.clip(tone / 0.9, 0, 1)[..., None])                               # 문양 속 어두운 부분(렌즈 등)
    fc = np.clip(fc + np.clip(em - 0.35, 0, 1)[..., None] * 0.5, 0, 1)
    rgb = lerp(rgb, fc, M[..., None])
    # --- 숫자 판 ---
    if num:
        pl = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(pl)
        f = ImageFont.truetype(FONT, 37 if len(num) < 6 else 31); tw = d.textlength(num, font=f); pw = max(96, tw + 44); ph = 50; py = CY + R_IN * 0.60
        d.rounded_rectangle([CX - pw / 2 + 3, py - ph / 2 + 4, CX + pw / 2 + 3, py + ph / 2 + 4], ph / 2, fill=(0, 0, 0, 90))
        d.rounded_rectangle([CX - pw / 2, py - ph / 2, CX + pw / 2, py + ph / 2], ph / 2, fill=tuple(int(v * 255 * 0.85) for v in dark) + (255,), outline=(255, 236, 170, 255) if tier >= 4 else (245, 247, 250, 255), width=4)
        d.text((CX - tw / 2, py - ph / 2 + (5 if len(num) < 6 else 8)), num, font=f, fill=(255, 255, 255, 255))
        pa = np.asarray(pl).astype(np.float32) / 255; rgb = lerp(rgb, pa[..., :3], pa[..., 3:])
    return np.clip(rgb, 0, 1)

def shine(rgb, t, strength=0.55):
    """대각선 빛줄기가 판을 지나감 (t: 0~1)"""
    p = (U * 0.8 + V * 0.6); c = -1.6 + 3.2 * t
    band = np.exp(-((p - c) ** 2) / 0.02) * strength + np.exp(-((p - c + 0.28) ** 2) / 0.004) * strength * 0.5
    return np.clip(rgb + band[..., None] * np.array([1, 0.97, 0.85], np.float32), 0, 1)

def star(lay, x, y, s, al):
    """네 갈래 별빛 (더하기)"""
    yy2, xx2 = np.mgrid[0:W, 0:W].astype(np.float32); dx = xx2 - x; dy = yy2 - y
    core = np.exp(-(dx ** 2 + dy ** 2) / (2 * (2.2 * s) ** 2))
    h = np.exp(-(dy ** 2) / (2 * (1.1 * s) ** 2)) * np.exp(-np.abs(dx) / (16 * s)); v = np.exp(-(dx ** 2) / (2 * (1.1 * s) ** 2)) * np.exp(-np.abs(dy) / (16 * s))
    halo = np.exp(-(dx ** 2 + dy ** 2) / (2 * (9 * s) ** 2)) * 0.35
    lay += (core * 1.2 + h + v + halo) * al

def to_rgba(rgb_black):
    """검은 바탕 그림 → 투명 바탕. 몸통은 불투명, 빛 번짐은 밝기만큼 비치게"""
    mx = rgb_black.max(-1); body = (mx > 0.42).astype(np.float32)
    bi = Image.fromarray((body * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(13)).filter(ImageFilter.GaussianBlur(1.2))
    body = np.asarray(bi).astype(np.float32) / 255
    body = np.maximum(body, np.clip((R_OUT - 3 - RR * R_IN) / 2, 0, 1))
    a = np.clip(np.maximum(body, np.clip(mx * 1.15, 0, 1) ** 0.9), 0, 1)
    col = np.where(a[..., None] > 1e-3, rgb_black / np.maximum(a[..., None], 1e-3), 0)
    # 번짐 부분은 어두운 갈색이 아니라 금빛으로
    gold = np.array([1.0, 0.80, 0.34], np.float32); col = lerp(np.maximum(col, gold * 0.9), col, body[..., None])
    return np.concatenate([np.clip(col, 0, 1), a[..., None]], -1)

FR = [np.asarray(Image.open(f'f{i:02d}.png').convert('RGB').resize((W, W), Image.LANCZOS)).astype(np.float32) / 255 for i in range(NF)]
MED = np.median(np.stack(FR), 0)

def champion_frames(tier, emb, num=None):
    out = []
    mask = np.clip((R_IN - RR * R_IN) / 2.0 + 0.5, 0, 1)[..., None]
    base = disc(tier, emb, num)
    for i in range(NF):
        d = base if tier < 6 else shine(disc(tier, emb, num, phase=math.sin(i / NF * 2 * math.pi)) if tier == 7 else base, i / NF)
        f = FR[i]
        # 예시의 판 위를 지나던 반짝임(아주 밝은 흰빛)은 살린다
        spark = np.clip(((f - MED).min(-1) - 0.22) / 0.2, 0, 1)[..., None] * mask
        comp = lerp(f, d, mask); comp = np.clip(comp + spark * 0.9, 0, 1)
        out.append(to_rgba(comp))
    return out

# --- 등급 메달(월계관·왕관 없음): 예시의 금 테를 둥글게 되살려 쓰고, 1~5등급은 테도 등급 색 금속으로 ---
def ring_profile():
    med = np.median(np.stack(FR), 0); prof = []
    angs = [a * math.pi / 180 for a in list(range(150, 211, 4)) + list(range(-30, 31, 4))]
    for r in np.arange(R_IN - 2, R_OUT + 6, 0.5):
        px = [med[int(round(CY + r * math.sin(a))), int(round(CX + r * math.cos(a)))] for a in angs]
        prof.append(np.median(np.array(px), 0))
    return np.array(prof)
PROF = None
def tier_frames(tier, emb, num=None, frames=NF):
    global PROF
    if PROF is None: PROF = ring_profile()
    rpx = RR * R_IN; idx = np.clip(((rpx - (R_IN - 2)) / 0.5), 0, len(PROF) - 1).astype(int)
    ring = PROF[idx]                                                              # 금 테(둥글게)
    side = -(np.cos(TH) * -0.45 + np.sin(TH) * -0.6)                              # 왼쪽 위가 밝게
    ringL = ring.mean(-1, keepdims=True); ring = np.clip(ring * (1 + 0.22 * side[..., None]) + 0.10 * np.clip(side, 0, 1)[..., None] * (ringL > 0.5), 0, 1)
    # 테의 볼록한 턱: 바깥 비탈은 왼쪽 위가 밝고, 안쪽 비탈은 반대
    w = np.clip((rpx - R_IN) / (R_OUT - R_IN), 0, 1); bev = np.sin(w * math.pi * 2) * -1
    Lr = np.clip((ring.max(-1) - 0.62) * 1.15 + 0.46 + 0.17 * side * (0.3 + bev), 0, 1.1)
    if tier <= 5: ring = ramp(Lr, RAMP[tier])
    elif tier == 7: ring = ramp(Lr, [(80, 50, 150), (176, 136, 240), (250, 228, 255)])
    else: ring = ramp(Lr, [(110, 56, 0), (232, 158, 14), (255, 228, 120)])
    outer = R_OUT - 1.5
    am = np.clip((outer - rpx) / 1.5 + 0.5, 0, 1)
    inner = np.clip((R_IN - rpx) / 2.0 + 0.5, 0, 1)[..., None]
    out = []; base = disc(tier, emb, num)
    rs = np.random.default_rng(tier * 11)
    stars = [(CX + r * math.cos(a), CY + r * math.sin(a), s, ph) for a, r, s, ph in zip(rs.uniform(0, 6.28, 7), rs.uniform(0.35, 1.02, 7) * R_OUT, rs.uniform(0.9, 1.7, 7), rs.uniform(0, 1, 7))]
    for i in range(frames if tier >= 6 else 1):
        t = i / frames
        d = base if tier < 6 else shine(disc(tier, emb, num, phase=math.sin(t * 2 * math.pi)) if tier == 7 else base, t)
        rgb = lerp(ring, d, inner)
        a = am.copy()
        # 바닥 그림자
        shd = blur(np.roll(am, 6, 0), 7) * 0.45
        rgba = np.concatenate([rgb, a[..., None]], -1)
        if tier >= 6:
            glowc = np.array([1.0, 0.82, 0.36], np.float32) if tier == 6 else np.array([0.85, 0.7, 1.0], np.float32)
            halo = np.clip(blur(am, 22) * 1.25, 0, 1) * (0.62 + 0.1 * math.sin(t * 2 * math.pi)); ga = halo * (1 - a)
            oa = a + ga * (1 - a); rgb2 = (rgb * a[..., None] + glowc * (ga * (1 - a))[..., None]) / np.maximum(oa[..., None], 1e-3)
            lay = np.zeros((W, W), np.float32)
            for (x, y, s, ph) in stars:
                al = max(0.0, math.sin((t + ph) * 2 * math.pi)) ** 2
                if al > 0.03: star(lay, x, y, s * (0.7 + 0.5 * al), al)
            lay = np.clip(lay, 0, 1)
            rgb2 = np.clip(rgb2 + lay[..., None], 0, 1); oa = np.clip(oa + lay * (1 - oa), 0, 1)
            rgba = np.concatenate([rgb2, oa[..., None]], -1)
        else:
            oa = a + shd * (1 - a); rgba = np.concatenate([rgb * (a / np.maximum(oa, 1e-3))[..., None], oa[..., None]], -1)
        out.append(rgba)
    return out

def img(rgba): return Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA')

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'test':
        t = int(sys.argv[2]); emb = sys.argv[3]; num = sys.argv[4] if len(sys.argv) > 4 else None
        c = champion_frames(t, emb, num); m = tier_frames(t, emb, num)
        s = Image.new('RGBA', (W * 2, W * 2), (14, 12, 10, 255)); s.paste(Image.new('RGBA', (W * 2, W), (253, 250, 243, 255)), (0, W))
        for row in (0, 1):
            s.alpha_composite(img(m[0]), (0, row * W)); s.alpha_composite(img(c[0]), (W, row * W))
        s.convert('RGB').resize((W, W), Image.LANCZOS).save(f'test{t}.png')

    if mode == 'all':
        nums = [None, '30', '100', '300', '1,000', '3,000', '7,000', '15,000']
        embs = [None, 'photo', 'comforter', 'cheer', 'hearts', 'writer', 'talker', 'prayers']
        f1 = ImageFont.truetype(FONT, 24); S = 300
        TB = (int(CX - 200), int(CY - 200), int(CX + 200), int(CY + 200))
        def sheet(get, label, bg, fc, fn, anim, box=None):
            cells = [get(t) for t in range(1, 8)]; out = []
            for i in range(NF if anim else 1):
                sh = Image.new('RGBA', (S * 7, S + 44), bg + (255,)); d = ImageDraw.Draw(sh)
                for k, fr in enumerate(cells):
                    sh.alpha_composite((img(fr[i % len(fr)]).crop(box) if box else img(fr[i % len(fr)])).resize((S, S), Image.LANCZOS), (k * S, 0))
                    tx = NAMES[k] + label; w = d.textlength(tx, font=f1); d.text((k * S + (S - w) / 2, S + 4), tx, font=f1, fill=fc)
                out.append(sh.convert('RGB'))
            out[0].save(fn + '.png')
            if anim: out[0].save(fn + '.gif', save_all=True, append_images=out[1:], duration=110, loop=0)
            return cells
        T = {}; C = {}
        def gt(t):
            if t not in T: T[t] = tier_frames(t, 'hearts', nums[t])
            return T[t]
        def gc(t):
            if t not in C: C[t] = champion_frames(t, embs[t])
            return C[t]
        sheet(gt, '', (14, 12, 10), (240, 225, 190), 'out_tiers_dark', True, TB)
        sheet(gt, '', (253, 250, 243), (60, 40, 20), 'out_tiers_light', False, TB)
        sheet(gc, ' + 1등', (14, 12, 10), (240, 225, 190), 'out_champ_dark', True)
        sheet(gc, ' + 1등', (253, 250, 243), (60, 40, 20), 'out_champ_light', True)
        # 크게 하나 + 작은 크기 미리 보기
        big = [Image.alpha_composite(Image.new('RGBA', (W, W), (14, 12, 10, 255)), img(f)).convert('RGB').resize((520, 520), Image.LANCZOS) for f in champion_frames(6, 'talker')]
        big[0].save('out_big.gif', save_all=True, append_images=big[1:], duration=110, loop=0)
        sm = Image.new('RGBA', (760, 300), (253, 250, 243, 255)); d = ImageDraw.Draw(sm); f2 = ImageFont.truetype(FONT, 18); x = 20
        for row, px in enumerate((20, 28, 44, 64)):
            x = 110; d.text((14, 20 + row * 70 + (64 - 18) // 2 - 6), f'{px}px', font=f2, fill=(60, 40, 20))
            for t in range(1, 8):
                sm.alpha_composite(img(T[t][0]).crop((int(CX - 168), int(CY - 168), int(CX + 168), int(CY + 168))).resize((px * 2, px * 2), Image.LANCZOS).resize((px, px), Image.LANCZOS), (x, 20 + row * 70 + (64 - px) // 2)); x += px + 8
            x += 20
            for t in (2, 4, 6, 7):
                c = img(C[t][0]).crop((60, 20, 656, 616)); sm.alpha_composite(c.resize((px * 2, px * 2), Image.LANCZOS).resize((px, px), Image.LANCZOS), (x, 20 + row * 70 + (64 - px) // 2)); x += px + 8
        sm.convert('RGB').save('out_small.png')
