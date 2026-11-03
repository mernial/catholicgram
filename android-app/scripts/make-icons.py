# 가톨릭그램 안드로이드 앱 그림 만들기 (웹의 public/ 그림에서): 실행 위치 = 저장소 맨 위
#   python3 android-app/scripts/make-icons.py
# - 앱 아이콘(적응형): 바탕 = 남색, 앞 = icon-v2-512 를 108dp 칸의 94dp 로 (금빛 동그라미가 가려지지 않게)
# - 테마 아이콘(안드로이드 13 모양만 쓰는 아이콘)·알림 작은 그림: icon-monochrome-512 (흰 ☧)
# - 안드로이드 7.1 이하용 네모 아이콘: icon-v2-512 그대로
from PIL import Image
import os

RES = 'android-app/app/src/main/res'
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
icon = Image.open('public/icon-v2-512.png').convert('RGBA')
mono = Image.open('public/icon-monochrome-512.png').convert('RGBA')
mono = mono.crop(mono.getbbox())


def canvas(px, img, frac):
    c = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    s = round(px * frac)
    im = img.resize((s, s), Image.LANCZOS)
    c.paste(im, ((px - s) // 2, (px - s) // 2), im)
    return c


for d, k in DENS.items():
    os.makedirs(f'{RES}/mipmap-{d}', exist_ok=True)
    os.makedirs(f'{RES}/drawable-{d}', exist_ok=True)
    fg = round(108 * k)
    canvas(fg, icon, 94 / 108).save(f'{RES}/mipmap-{d}/ic_launcher_foreground.png')
    canvas(fg, mono, 66 / 108).save(f'{RES}/mipmap-{d}/ic_launcher_monochrome.png')
    legacy = round(48 * k)
    icon.resize((legacy, legacy), Image.LANCZOS).save(f'{RES}/mipmap-{d}/ic_launcher.png')
    n = round(24 * k)
    canvas(n, mono, 22 / 24).save(f'{RES}/drawable-{d}/ic_stat_cg.png')
print('done')
