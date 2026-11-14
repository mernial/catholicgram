# 앱에 넣을 그림 조각: 등급 메달 7장 · 돋을새김 문양 · 1등 틀(월계관+금 테+빛) · 도는 왕관
import sys, math, numpy as np
from PIL import Image, ImageFilter
import make as M, make2 as M2
from make import W, CX, CY, R_IN, R_OUT, RR, lerp, blur, img
OUT = sys.argv[1]; import os; os.makedirs(OUT + '/emblem', exist_ok=True)
HALF = 199  # 등급 메달 그림 한 변의 절반 (716 기준) — 빛 번짐까지 담김
def save(im, path, size, q=90): im.resize((size, size), Image.LANCZOS).save(path, 'WEBP', quality=q, method=6)
# 1) 등급 메달 (문양·숫자 없음). 큰 나무·생명의 나무는 빛 번짐 포함(별·빛줄기는 앱에서 움직임)
for t in range(1, 8):
    if t < 6: fr = M.tier_frames(t, None)[0]
    else:
        rpx = RR * R_IN; am = np.clip((R_OUT - 1.5 - rpx) / 1.5 + 0.5, 0, 1); one = M.tier_frames(t, None, frames=1)[0]
        # tier_frames 는 6·7등급에 별을 그리므로, 별 없이 다시 합침
        inner = np.clip((R_IN - rpx) / 2.0 + 0.5, 0, 1)[..., None]; ring = None
        M.star = (lambda *a, **k: None); one = M.tier_frames(t, None, frames=1)[0]
        fr = one
    save(img(fr).crop((int(CX - HALF), int(CY - HALF), int(CX + HALF), int(CY + HALF))), f'{OUT}/tier-{t}.webp', 320)
# 2) 문양: 흰 진주빛(-w) / 금 등급용 크림빛(-g), 그림자 포함
import make
def emblem(key, gold):
    S = 400; e = Image.open(f'emb/{key}.png').convert('RGBA').resize((S - 60, S - 60), Image.LANCZOS); lay = Image.new('RGBA', (S, S), (0, 0, 0, 0)); lay.paste(e, (30, 26))
    ea = np.asarray(lay).astype(np.float32) / 255; Mk = ea[..., 3]; tone = ea[..., :3].mean(-1)
    Hh = blur(Mk, 4.4); gy, gx = np.gradient(Hh); em = np.clip(-(gx * -0.45 + gy * -0.6) * 18, -1, 1)
    sh = blur(np.roll(np.roll(Mk, 10, 0), 8, 1), 9)
    face = np.array([1.0, 0.96, 0.74] if gold else [1.0, 0.99, 0.95], np.float32); shade = np.array([0.72, 0.42, 0.02] if gold else [0.62, 0.64, 0.7], np.float32); dark = np.array([0.35, 0.18, 0.0] if gold else [0.2, 0.22, 0.28], np.float32)
    yy = np.linspace(-1, 1, S)[:, None]
    fc = lerp(shade, face, np.clip(0.86 + 0.5 * em - 0.1 * yy, 0, 1)[..., None]); fc = lerp(dark, fc, np.clip(tone / 0.9, 0, 1)[..., None]); fc = np.clip(fc + np.clip(em - 0.35, 0, 1)[..., None] * 0.5, 0, 1)
    a = np.clip(Mk + 0.55 * sh * (1 - Mk), 0, 1); rgb = np.where(a[..., None] > 1e-3, fc * (Mk / np.maximum(a, 1e-3))[..., None], 0)
    return Image.fromarray((np.concatenate([rgb, a[..., None]], -1) * 255).astype(np.uint8), 'RGBA')
keys = sys.argv[2].split(',')
for k in keys:
    save(emblem(k, False), f'{OUT}/emblem/{k}.webp', 200, 88); save(emblem(k, True), f'{OUT}/emblem/{k}-g.webp', 200, 88)
# 3) 1등 틀: 월계관 + 금 테 + 빛 번짐 (가운데는 뚫림, 왕관 자리는 비움)
base = M2.base_plate(); rgba = M.to_rgba(base)
hole = np.clip((RR * R_IN - (R_IN - 1.5)) / 2.0, 0, 1); rgba[..., 3] *= hole
save(img(rgba), f'{OUT}/frame.webp', 560, 90)
# 4) 왕관: 움직이는 webp(18장) + 멈춘 그림. 뒤 빛 번짐 포함
crs = M2.crown_frames(); h0, w0 = crs[0].shape[:2]; PAD = 40; outs = []
for c in crs:
    full = np.zeros((h0 + PAD * 2, w0 + PAD * 2, 4), np.float32); full[PAD:PAD + h0, PAD:PAD + w0] = c; a = full[..., 3]
    def bl(x, r): return np.asarray(Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
    halo = np.clip(bl(a, 22) * 0.9, 0, 1) * (1 - a) * 0.5; hi = np.clip((full[..., :3] @ np.array([0.3, 0.5, 0.2], np.float32) - 0.7) / 0.25, 0, 1) * a
    rgb = np.clip(full[..., :3] + bl(hi, 5)[..., None] * np.array([1, 0.9, 0.6], np.float32) * 0.45, 0, 1)
    oa = a + halo * (1 - a); rgb = (rgb * a[..., None] + np.array([1.0, 0.72, 0.25], np.float32) * (halo * (1 - a))[..., None]) / np.maximum(oa[..., None], 1e-3)
    im = Image.fromarray((np.concatenate([rgb, oa[..., None]], -1) * 255).astype(np.uint8), 'RGBA'); sc = 300 / im.size[0]
    outs.append(im.resize((300, int(round(im.size[1] * sc))), Image.LANCZOS))
outs[0].save(f'{OUT}/crown.webp', 'WEBP', save_all=True, append_images=outs[1:], duration=70, loop=0, quality=82, method=6)
outs[0].save(f'{OUT}/crown-still.webp', 'WEBP', quality=90, method=6)
print('crown', outs[0].size, 'w0', w0, 'pad', PAD)
