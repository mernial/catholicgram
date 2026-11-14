# 3D 프레임에 금빛 번짐(블룸) + 반짝이는 별을 더하고 움직이는 webp/gif로
import sys, glob, math, numpy as np
from PIL import Image, ImageFilter, ImageDraw
src, out = sys.argv[1], sys.argv[2]
soft = len(sys.argv) > 3 and sys.argv[3] == 'soft'
files = sorted(glob.glob(src + '/*.png')); N = len(files)
W = Image.open(files[0]).size[0]
rng = np.random.default_rng(7)
# 별 자리: 메달 둘레
stars = []
for k in range(9):
    a = rng.uniform(0, 2 * math.pi); r = rng.uniform(0.33, 0.47) * W
    stars.append((W / 2 + r * math.cos(a), W * 0.5 + r * math.sin(a) * 0.95, rng.uniform(0.6, 1.0), rng.uniform(0, 1)))
def star(d, x, y, s, al):
    L = s * W * 0.07; w = max(1, s * W * 0.006)
    for (dx, dy, ll) in [(1, 0, L), (0, 1, L), (0.7, 0.7, L * 0.45), (0.7, -0.7, L * 0.45)]:
        for t in range(6):
            f = 1 - t / 6
            d.line([(x - dx * ll * f, y - dy * ll * f), (x + dx * ll * f, y + dy * ll * f)], fill=(255, 250, 225, int(255 * al * (0.25 + 0.75 * (1 - f)) / 1.0 * 0.5)), width=int(w * (1 + t * 0.4)))
    r = w * 1.6; d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 240, int(255 * al)))
frames = []
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA'); a = np.asarray(im).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:]
    lum = (rgb @ np.array([0.3, 0.55, 0.15])) * al[..., 0]
    hi = np.clip((lum - 0.55) / 0.45, 0, 1)
    hiI = Image.fromarray((hi * 255).astype(np.uint8))
    g1 = np.asarray(hiI.filter(ImageFilter.GaussianBlur(W * 0.012))).astype(np.float32) / 255
    g2 = np.asarray(hiI.filter(ImageFilter.GaussianBlur(W * 0.045))).astype(np.float32) / 255
    halo = np.asarray(Image.fromarray((al[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(W * 0.06))).astype(np.float32) / 255
    glow = np.clip((g1 * 0.5 + g2 * 0.3) if soft else (g1 * 0.9 + g2 * 1.4 + halo * 0.35), 0, 1)[..., None]
    gold = np.array([1.0, 0.8, 0.35])
    # 바탕(투명)에 금빛 번짐을 깔고 그 위에 메달
    base_rgb = gold * np.ones_like(rgb); base_a = glow * 0.85
    out_a = al + base_a * (1 - al)
    out_rgb = (rgb * al + base_rgb * base_a * (1 - al)) / np.maximum(out_a, 1e-4)
    # 밝은 곳 위에 더하는 빛
    out_rgb = np.clip(out_rgb + (g1[..., None] * 0.35) * gold, 0, 1)
    o = Image.fromarray((np.concatenate([out_rgb, out_a], -1) * 255).astype(np.uint8), 'RGBA')
    lay = Image.new('RGBA', o.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for (x, y, s, ph) in stars:
        t = (i / N + ph) % 1; al_ = max(0, math.sin(t * 2 * math.pi)) ** 2
        if al_ > 0.02 and not soft: star(d, x, y, s * (0.6 + 0.4 * al_), al_)
    o = Image.alpha_composite(o, lay)
    frames.append(o)
frames[0].save(out + '.webp', save_all=True, append_images=frames[1:], duration=70, loop=0, quality=86, method=4)
frames[0].save(out + '.png')
