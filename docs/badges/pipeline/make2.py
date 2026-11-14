# 2차 시안: 왕관은 새로 만든 3D 왕관이 수평으로 똑바로 돌고, 월계관·왕관의 반짝임은 일정한 차례로 되풀이
import sys, math, glob, numpy as np, cv2
from PIL import Image, ImageFilter, ImageDraw, ImageFont
import make as M
from make import W, CX, CY, R_IN, R_OUT, RR, TH, U, V, lerp, ramp, blur, img, NAMES, FONT
NF = 18; DUR = 70
GOLD = [(104, 50, 0), (236, 160, 16), (255, 232, 124)]

# --- 바탕: 예시의 가운데값(반짝임이 빠진 고요한 그림)에서 왕관을 지우고 테 윗부분을 되살림 ---
def base_plate():
    med = M.MED.copy()
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    k = ((np.abs(xx - CX) < 122) & (yy < 214)).astype(np.float32)
    k = np.maximum(k, ((np.abs(xx - CX) < 150) & (yy < 150)).astype(np.float32))
    inp = cv2.inpaint((med[..., ::-1] * 255).astype(np.uint8), (k * 255).astype(np.uint8), 9, cv2.INPAINT_TELEA)[..., ::-1].astype(np.float32) / 255
    inp = np.stack([blur(inp[..., c], 6) for c in range(3)], -1)
    if M.PROF is None: M.PROF = M.ring_profile()
    rpx = RR * R_IN; idx = np.clip((rpx - (R_IN - 2)) / 0.5, 0, len(M.PROF) - 1).astype(int); ring = M.PROF[idx]
    side = -(np.cos(TH) * -0.45 + np.sin(TH) * -0.6)
    ring = np.clip(ring * (1 + 0.16 * side[..., None]), 0, 1)
    inring = np.clip((R_OUT - 1 - rpx) / 1.5 + 0.5, 0, 1)[..., None]
    fill = lerp(inp, ring, inring)
    kf = blur(k, 2.5)[..., None]
    return lerp(med, fill, kf)

# --- 3D 왕관 낱장: 금빛을 예시의 금과 같은 결로 맞춤 ---
def laurel_look():
    """월계관의 금빛을 그대로 본뜸: 밝기별 실제 색(LUT) + 밝기 분포"""
    med = M.MED; yy, xx = np.mgrid[0:W, 0:W].astype(np.float32); rpx = RR * R_IN
    m = (rpx > R_OUT + 10) & (rpx < 250) & (med.max(-1) > 0.4) & ~((yy < 214) & (np.abs(xx - CX) < 150))
    px = med[m]; L = px @ np.array([0.3, 0.5, 0.2], np.float32)
    lut = np.zeros((64, 3), np.float32); ok = np.zeros(64, bool)
    for b in range(64):
        sel = (L >= b / 64) & (L < (b + 1) / 64)
        if sel.sum() > 30: lut[b] = np.median(px[sel], 0); ok[b] = True
    idx = np.arange(64)
    for c in range(3): lut[:, c] = np.interp(idx, idx[ok], lut[ok, c])
    lo = idx[ok].min()                                     # 아주 어두운 쪽은 짙은 갈색으로 이어 줌
    for b in range(lo): lut[b] = lut[lo] * (0.45 + 0.55 * b / max(lo, 1))
    for c in range(3): lut[:, c] = np.convolve(np.pad(lut[:, c], 2, mode='edge'), np.ones(5) / 5, 'valid')
    return lut, np.sort(L)

def crown_frames(src='../r3d/cr'):
    fs = [np.asarray(Image.open(f).convert('RGBA')).astype(np.float32) / 255 for f in sorted(glob.glob(src + '/*.png'))]
    al = np.max(np.stack([f[..., 3] for f in fs]), 0); ys, xs = np.where(al > 0.02); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    lut, Ls = laurel_look(); wv = np.array([0.3, 0.5, 0.2], np.float32)
    # 왕관 밝기 분포를 월계관의 분포에 맞춤 (모든 낱장을 한꺼번에 → 낱장마다 흔들리지 않게)
    allL = np.sort(np.concatenate([(f[..., :3] @ wv)[(f[..., 3] > 0.9) & (f[..., 0] < 1.9 * f[..., 1] + 0.05)] for f in fs]))
    q = np.linspace(0, 1, 256); src_q = np.quantile(allL, q); dst_q = np.quantile(Ls, q)
    out = []
    for f in fs:
        c = f[y0:y1 + 1, x0:x1 + 1]; rgb, a = c[..., :3], c[..., 3]
        L = rgb @ wv; Lm = np.interp(L, src_q, dst_q)
        Lm = np.asarray(Image.fromarray((np.clip(Lm, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32) / 255 * 0.55 + Lm * 0.45   # 붓으로 그린 듯 부드럽게
        gi = np.clip(Lm * 64, 0, 63); g0 = np.floor(gi).astype(int); g1 = np.minimum(g0 + 1, 63); gf = (gi - g0)[..., None]
        g = lut[g0] * (1 - gf) + lut[g1] * gf
        red = np.clip((rgb[..., 0] - 1.9 * rgb[..., 1]) / 0.25, 0, 1)[..., None]
        rub = np.clip(rgb * np.array([0.8, 0.22, 0.28], np.float32) + np.clip(rgb.min(-1) - 0.4, 0, 1)[..., None] * 1.5, 0, 1)
        out.append(np.concatenate([lerp(g, rub, red), a[..., None]], -1))
    return out

def paste(dst_rgb, src_rgba, x, y):
    h, w = src_rgba.shape[:2]; a = src_rgba[..., 3:]
    dst_rgb[y:y + h, x:x + w] = dst_rgb[y:y + h, x:x + w] * (1 - a) + src_rgba[..., :3] * a

CROWN_W = 246; CROWN_BOTTOM = 216
def champ_frames(tier, emb, num=None):
    base = base_plate(); crs = crown_frames()
    h0, w0 = crs[0].shape[:2]; sc = CROWN_W / w0; cw, ch = CROWN_W, int(round(h0 * sc))
    cx0 = int(round(CX - cw / 2)); cy0 = CROWN_BOTTOM - ch
    mask = np.clip((R_IN - RR * R_IN) / 2.0 + 0.5, 0, 1)[..., None]
    d0 = M.disc(tier, emb, num)
    # 반짝임 자리: 월계관 양쪽 가지를 아래→위로, 맨 아래 다이아몬드, 왕관 끝 셋
    pts = []
    for k, ang in enumerate((122, 150, 178, 204, 228)):
        for sgn in (1, -1):
            a = math.radians(ang if sgn > 0 else 180 - ang); rr = 214 + (6 if k in (1, 3) else -4)
            pts.append((CX + rr * math.cos(a), CY + rr * math.sin(a), 1.25 if k % 2 == 0 else 0.95, k / 7))
    pts.append((CX, CY + 170, 1.5, 0.0))
    for (dx, dy, s, ph) in ((0, 0.04, 1.5, 5 / 7), (-0.4, 0.2, 1.05, 6 / 7), (0.4, 0.2, 1.05, 6 / 7)):
        pts.append((CX + dx * cw, cy0 + dy * ch, s, ph))
    out = []
    for i in range(NF):
        t = i / NF
        d = d0 if tier < 6 else M.shine(M.disc(tier, emb, num, phase=math.sin(t * 2 * math.pi)) if tier == 7 else d0, t)
        comp = lerp(base, d, mask)
        cr = np.asarray(Image.fromarray((crs[i % len(crs)] * 255).astype(np.uint8), 'RGBA').resize((cw, ch), Image.LANCZOS)).astype(np.float32) / 255
        full = np.zeros((W, W, 4), np.float32); full[cy0:cy0 + ch, cx0:cx0 + cw] = cr; ca = full[..., 3]
        # 왕관 뒤 금빛 번짐 + 테 위에 드리운 그림자
        halo = np.clip(blur(ca, 16) * 1.3, 0, 1)[..., None] * (1 - ca[..., None]); comp = np.clip(comp + halo * np.array([0.95, 0.66, 0.2], np.float32) * 0.4, 0, 1)
        shd = blur(np.roll(ca, 7, 0), 5)[..., None] * (1 - ca[..., None]) * (RR * R_IN < R_OUT)[..., None]; comp = comp * (1 - 0.45 * shd)
        comp = comp * (1 - full[..., 3:]) + full[..., :3] * full[..., 3:]
        hi = np.clip((full[..., :3] @ np.array([0.3, 0.5, 0.2], np.float32) - 0.7) / 0.25, 0, 1) * ca; comp = np.clip(comp + blur(hi, 3)[..., None] * np.array([1, 0.9, 0.6], np.float32) * 0.45 + blur(hi, 10)[..., None] * np.array([1, 0.75, 0.3], np.float32) * 0.35, 0, 1)   # 왕관의 밝은 곳이 번짐
        lay = np.zeros((W, W), np.float32)
        for (x, y, s, ph) in pts:
            al = max(0.0, math.cos((t - ph) * 2 * math.pi)) ** 6
            if al > 0.02: M.star(lay, x, y, s * (0.75 + 0.5 * al), al)
        comp = np.clip(comp + np.clip(lay, 0, 1.2)[..., None] * np.array([1, 0.97, 0.86], np.float32), 0, 1)
        out.append(M.to_rgba(comp))
    return out

def tier_frames2(tier, emb, num=None):
    """등급 메달. 큰 나무·생명의 나무는 테 둘레 여섯 자리가 시계 방향 차례로 반짝임"""
    if tier < 6: return M.tier_frames(tier, emb, num)
    one = M.tier_frames(tier, emb, num, frames=1)   # 모양만 빌림
    out = []
    rpx = RR * R_IN; am = np.clip((R_OUT - 1.5 - rpx) / 1.5 + 0.5, 0, 1); inner = np.clip((R_IN - rpx) / 2.0 + 0.5, 0, 1)[..., None]
    pts = [(CX + (R_OUT - 12) * math.cos(math.radians(a)), CY + (R_OUT - 12) * math.sin(math.radians(a)), 1.2 if k % 2 == 0 else 0.9, k / 6) for k, a in enumerate((-120, -60, 0, 60, 120, 180))]
    glowc = np.array([1.0, 0.8, 0.32], np.float32) if tier == 6 else np.array([0.82, 0.68, 1.0], np.float32)
    ringrgb = one[0][..., :3]
    for i in range(NF):
        t = i / NF
        d = M.shine(M.disc(tier, emb, num, phase=math.sin(t * 2 * math.pi)) if tier == 7 else M.disc(tier, emb, num), t)
        rgb = lerp(ringrgb, d, inner) if False else np.where(inner > 0, lerp(ringrgb, d, inner), ringrgb)
        a = am
        ga = np.clip(blur(am, 22) * 1.25, 0, 1) * (0.62 + 0.1 * math.sin(t * 2 * math.pi)) * (1 - a)
        oa = a + ga * (1 - a); rgb2 = (rgb * a[..., None] + glowc * (ga * (1 - a))[..., None]) / np.maximum(oa[..., None], 1e-3)
        lay = np.zeros((W, W), np.float32)
        for (x, y, s, ph) in pts:
            al = max(0.0, math.cos((t - ph) * 2 * math.pi)) ** 6
            if al > 0.02: M.star(lay, x, y, s * (0.75 + 0.5 * al), al)
        lay = np.clip(lay, 0, 1); rgb2 = np.clip(rgb2 + lay[..., None], 0, 1); oa = np.clip(oa + lay * (1 - oa), 0, 1)
        out.append(np.concatenate([rgb2, oa[..., None]], -1))
    return out

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'test':
        c = champ_frames(6, 'talker')
        s = Image.new('RGBA', (W * 2, W), (14, 12, 10, 255))
        for k, i in enumerate((0, 5)): s.alpha_composite(img(c[i]), (k * W, 0))
        s.convert('RGB').crop((0, 0, W * 2, 520)).save('t2.png')
    if mode == 'all':
        nums = [None, '30', '100', '300', '1,000', '3,000', '7,000', '15,000']; embs = [None, 'photo', 'comforter', 'cheer', 'hearts', 'writer', 'talker', 'prayers']
        f1 = ImageFont.truetype(FONT, 24); S = 300; TB = (int(CX - 200), int(CY - 200), int(CX + 200), int(CY + 200))
        def sheet(cells, label, bg, fc, fn, box=None):
            out = []
            for i in range(NF):
                sh = Image.new('RGBA', (S * 7, S + 44), bg + (255,)); d = ImageDraw.Draw(sh)
                for k, fr in enumerate(cells):
                    f = img(fr[i % len(fr)]); f = f.crop(box) if box else f
                    sh.alpha_composite(f.resize((S, S), Image.LANCZOS), (k * S, 0))
                    tx = NAMES[k] + label; w = d.textlength(tx, font=f1); d.text((k * S + (S - w) / 2, S + 4), tx, font=f1, fill=fc)
                out.append(sh.convert('RGB'))
            out[0].save(fn + '.png'); out[0].save(fn + '.gif', save_all=True, append_images=out[1:], duration=DUR, loop=0)
        C = [champ_frames(t, embs[t]) for t in range(1, 8)]
        sheet(C, ' + 1등', (14, 12, 10), (240, 225, 190), 'v2_champ_dark'); sheet(C, ' + 1등', (253, 250, 243), (60, 40, 20), 'v2_champ_light')
        T = [tier_frames2(t, 'hearts', nums[t]) for t in range(1, 8)]
        sheet(T, '', (14, 12, 10), (240, 225, 190), 'v2_tiers_dark', TB)
        big = [Image.alpha_composite(Image.new('RGBA', (W, W), (14, 12, 10, 255)), img(f)).convert('RGB').resize((560, 560), Image.LANCZOS) for f in C[5]]
        big[0].save('v2_big.gif', save_all=True, append_images=big[1:], duration=DUR, loop=0)
