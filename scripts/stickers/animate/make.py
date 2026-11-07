import math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import numpy as np
random.seed(7)
SRC='/tmp/cggif'; OUT='/tmp/cggif/out'
FONT=lambda s: ImageFont.truetype(f'{SRC}/EB.ttf', s)
W=412
BG=np.array([254,249,241])

def load(i):
    return Image.open(f'{SRC}/f{i}.png').convert('RGBA')

def transparent(im):
    """크림색 바탕을 가장자리에서 이어진 곳만 투명으로 (옷·머리 안의 밝은 곳은 그대로)"""
    a=np.asarray(im).astype(int); h,w=a.shape[:2]
    near=(np.abs(a[:,:,:3]-BG).sum(2) < 48)
    from collections import deque
    seen=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        for y in (0,h-1):
            if near[y,x] and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    for y in range(h):
        for x in (0,w-1):
            if near[y,x] and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and near[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True; q.append((ny,nx))
    out=np.asarray(im).copy()
    # 경계 1px 는 반투명으로 부드럽게
    dist=np.abs(a[:,:,:3]-BG).sum(2)
    alpha=np.where(seen, 0, 255).astype(np.uint8)
    edge=seen & (dist>20)
    alpha[edge]=np.clip(dist[edge]*4,0,255).astype(np.uint8)
    out[:,:,3]=alpha
    return Image.fromarray(out,'RGBA')

# 바탕 투명 기본 그림들
calm=transparent(load(0)); calm_fist=transparent(load(8)); open_=transparent(load(2)); open_fist=transparent(load(4))
# 윙크 그림(f5)은 '화이팅!' 글자가 박혀 있어 글자 자리만 f4 의 옷으로 덮음
wink_fist=transparent(Image.open(f'{SRC}/f5clean.png').convert('RGBA'))


def text_img(txt, size=56, fill=(255,196,0), stroke=(120,70,0), sw=7):
    f=FONT(size); pad=sw*2+6
    bbox=f.getbbox(txt); w=bbox[2]-bbox[0]+pad*2; h=bbox[3]-bbox[1]+pad*2
    im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.text((pad-bbox[0],pad-bbox[1]),txt,font=f,fill=fill,stroke_width=sw,stroke_fill=stroke)
    # 흰 바깥 테두리
    im2=Image.new('RGBA',(w,h),(0,0,0,0)); d2=ImageDraw.Draw(im2)
    d2.text((pad-bbox[0],pad-bbox[1]),txt,font=f,fill=fill,stroke_width=sw+4,stroke_fill=(255,255,255))
    im2.alpha_composite(im); return im2

def heart(size, color=(255,90,120)):
    im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im); s=size
    d.ellipse((0,0,s*0.55,s*0.55),fill=color); d.ellipse((s*0.45,0,s,s*0.55),fill=color)
    d.polygon([(s*0.02,s*0.38),(s*0.98,s*0.38),(s*0.5,s*0.98)],fill=color)
    return im

def star(size, color=(255,210,40)):
    im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im); c=size/2
    pts=[]
    for i in range(10):
        r=c if i%2==0 else c*0.45; a=-math.pi/2+i*math.pi/5
        pts.append((c+r*math.cos(a),c+r*math.sin(a)))
    d.polygon(pts,fill=color); return im

def sparkle(size, color=(255,230,120)):
    im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im); c=size/2
    d.polygon([(c,0),(c*1.18,c*0.82),(size,c),(c*1.18,c*1.18),(c,size),(c*0.82,c*1.18),(0,c),(c*0.82,c*0.82)],fill=color); return im

def paste_rot(canvas, im, cx, cy, angle=0, scale=1.0, alpha=1.0):
    if scale!=1: im=im.resize((max(1,int(im.width*scale)),max(1,int(im.height*scale))),Image.LANCZOS)
    if angle: im=im.rotate(angle,resample=Image.BICUBIC,expand=True)
    if alpha<1:
        a=im.split()[3].point(lambda v:int(v*alpha)); im=im.copy(); im.putalpha(a)
    canvas.alpha_composite(im,(int(cx-im.width/2),int(cy-im.height/2)))

def place_char(canvas, ch, dx=0, dy=0, angle=0):
    im=ch
    if angle: im=im.rotate(angle,resample=Image.BICUBIC,center=(W/2,W*0.75))
    canvas.alpha_composite(im,(int(dx),int(dy)))

def save(name, frames, dur=100):
    frames[0].save(f'{OUT}/{name}.webp',save_all=True,append_images=frames[1:],duration=dur,loop=0,quality=85,method=4)
    # GIF 미리 보기(투명은 흰 바탕)
    gifs=[]
    for f in frames:
        bg=Image.new('RGBA',f.size,(255,255,255,255)); bg.alpha_composite(f); gifs.append(bg.convert('P',palette=Image.ADAPTIVE,colors=128))
    gifs[0].save(f'{OUT}/{name}.gif',save_all=True,append_images=gifs[1:],duration=dur,loop=0)
    print(name, len(frames))

N=12
def canvas(): return Image.new('RGBA',(W,W),(0,0,0,0))

# 1 안녕하세요! — 살짝 끄덕끄덕 + 글자
fr=[]
t=text_img('안녕하세요!',54)
for i in range(N):
    c=canvas(); ph=i/N*2*math.pi
    place_char(c,calm,dy=4*math.sin(ph),angle=2.5*math.sin(ph))
    paste_rot(c,t,W*0.5,W*0.86,angle=-3,scale=0.95+0.03*math.sin(ph))
    fr.append(c)
save('hello',fr)

# 2 감사합니다 — 고개 숙여 인사 + 반짝
fr=[]; t=text_img('감사합니다',52,fill=(255,170,60))
for i in range(N):
    c=canvas(); k=i/N; bow=math.sin(k*math.pi)
    place_char(c,calm,dy=18*bow,angle=-9*bow)
    for j,(sx,sy) in enumerate([(60,70),(340,55),(375,150),(40,180)]):
        s=28+10*math.sin(k*2*math.pi+j); paste_rot(c,sparkle(int(s)),sx,sy,angle=i*8+j*30)
    paste_rot(c,t,W*0.5,W*0.87)
    fr.append(c)
save('thanks',fr)

# 3 사랑해요 — 하트 둥실
fr=[]; t=text_img('사랑해요',54,fill=(255,120,150),stroke=(150,30,70))
hearts=[(70,0.0,34),(330,0.35,28),(200,0.6,22),(370,0.8,30),(30,0.5,24)]
for i in range(N):
    c=canvas(); k=i/N
    place_char(c,calm,dy=3*math.sin(k*2*math.pi),angle=-3+3*math.sin(k*2*math.pi))
    for x,off,s in hearts:
        p=(k+off)%1; y=W*0.75-p*W*0.7; a=1-max(0,p-0.6)/0.4
        paste_rot(c,heart(s),x+10*math.sin(p*6),y,angle=-15+30*p,alpha=a)
    paste_rot(c,t,W*0.5,W*0.87,angle=-2)
    fr.append(c)
save('love',fr)

# 4 축하해요! — 입 벌린 얼굴·주먹 번갈아 + 꽃가루
fr=[]; t=text_img('축하해요!',54,fill=(255,120,60),stroke=(140,40,0))
conf=[(random.randint(0,W),random.random(),random.choice([(255,90,120),(90,180,255),(255,210,40),(120,220,120),(200,120,255)]),random.randint(10,18)) for _ in range(28)]
for i in range(N):
    c=canvas(); k=i/N; ch=open_ if (i//3)%2==0 else open_fist
    place_char(c,ch,dy=-6*abs(math.sin(k*2*math.pi)))
    for x,off,col,s in conf:
        p=(k+off)%1; y=-20+p*(W+40); im=Image.new('RGBA',(s,int(s*0.6)),col)
        paste_rot(c,im,x+12*math.sin(p*8+x),y,angle=p*360+x)
    paste_rot(c,t,W*0.5,W*0.87,scale=1+0.05*math.sin(k*4*math.pi))
    fr.append(c)
save('congrats',fr)

# 5 최고예요! — 윙크+주먹 + 별
fr=[]; t=text_img('최고예요!',54,fill=(255,210,40),stroke=(130,80,0))
for i in range(N):
    c=canvas(); k=i/N
    place_char(c,wink_fist,dy=4*math.sin(k*2*math.pi))
    for j,(sx,sy) in enumerate([(55,60),(355,45),(385,170),(30,200)]):
        s=26+12*math.sin(k*2*math.pi+j*1.3); paste_rot(c,star(int(s)),sx,sy,angle=i*10+j*40)
    paste_rot(c,t,W*0.5,W*0.87,angle=3)
    fr.append(c)
save('best',fr)

# 6 ㅋㅋㅋ — 웃으며 들썩들썩
fr=[]
for i in range(N):
    c=canvas(); k=i/N; ch=open_ if i%2==0 else calm
    place_char(c,ch,dx=3*math.sin(k*8*math.pi),dy=5*abs(math.sin(k*4*math.pi)))
    for j in range(3):
        t=text_img('ㅋ',48+8*j,fill=(255,200,40))
        paste_rot(c,t,60+j*52,110-j*30+6*math.sin(k*4*math.pi+j),angle=-10+8*j)
    fr.append(c)
save('kkk',fr,80)

# 7 잘 자요 — 어둑하게 + Zzz + 달
fr=[]; t=text_img('잘 자요',50,fill=(200,210,255),stroke=(40,50,120))
night=Image.new('RGBA',(W,W),(40,50,110,70))
moon=Image.new('RGBA',(90,90),(0,0,0,0)); d=ImageDraw.Draw(moon); d.ellipse((0,0,80,80),fill=(255,230,120)); d.ellipse((22,-10,100,70),fill=(0,0,0,0))
m2=Image.new('RGBA',(90,90),(0,0,0,0)); md=ImageDraw.Draw(m2); md.ellipse((0,0,80,80),fill=(255,230,120)); mask=Image.new('L',(90,90),255); ImageDraw.Draw(mask).ellipse((25,-12,100,68),fill=0); m2.putalpha(ImageChops.multiply(m2.split()[3],mask))
for i in range(N):
    c=canvas(); k=i/N
    place_char(c,calm,dy=2*math.sin(k*2*math.pi),angle=-6)
    dark=night.copy(); dark.putalpha(ImageChops.multiply(dark.split()[3],c.split()[3])); c.alpha_composite(dark)
    paste_rot(c,m2,350,60,angle=-20)
    for j in range(3):
        p=(k+j*0.33)%1; z=text_img('z',30+j*12,fill=(230,235,255),stroke=(60,70,140),sw=4)
        paste_rot(c,z,300+j*28+20*p,170-p*120,alpha=1-p)
    paste_rot(c,t,W*0.5,W*0.87)
    fr.append(c)
save('goodnight',fr,110)

# 8 아멘 — 십자가 빛
fr=[]; t=text_img('아멘',58,fill=(255,220,120),stroke=(120,80,0))
def cross(size,color):
    im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im); w=size*0.2
    d.rectangle((size/2-w/2,0,size/2+w/2,size),fill=color); d.rectangle((0,size*0.3-w/2,size,size*0.3+w/2),fill=color); return im
for i in range(N):
    c=canvas(); k=i/N
    glow=Image.new('RGBA',(W,W),(0,0,0,0)); gd=ImageDraw.Draw(glow); r=60+8*math.sin(k*2*math.pi); gd.ellipse((330-r,70-r,330+r,70+r),fill=(255,240,160,110)); glow=glow.filter(ImageFilter.GaussianBlur(18)); c.alpha_composite(glow)
    place_char(c,calm,dy=2*math.sin(k*2*math.pi),angle=4)
    paste_rot(c,cross(70,(255,215,90)),330,70,scale=1+0.06*math.sin(k*2*math.pi))
    for j in range(4):
        a=k*2*math.pi+j*math.pi/2; paste_rot(c,sparkle(18),330+75*math.cos(a),70+75*math.sin(a),alpha=0.8)
    paste_rot(c,t,W*0.5,W*0.87)
    fr.append(c)
save('amen',fr)

# 9 깜짝! — 입 벌린 얼굴 + !! + 땀방울 + 흔들
fr=[]; t=text_img('깜짝!',56,fill=(255,230,80),stroke=(160,60,0))
drop=Image.new('RGBA',(34,46),(0,0,0,0)); dd=ImageDraw.Draw(drop); dd.ellipse((2,14,32,44),fill=(140,200,255)); dd.polygon([(17,0),(4,24),(30,24)],fill=(140,200,255))
ex=text_img('!!',90,fill=(255,80,80),stroke=(120,0,0),sw=8)
for i in range(N):
    c=canvas(); k=i/N
    place_char(c,open_,dx=6*math.sin(k*10*math.pi),dy=-8*abs(math.sin(k*2*math.pi)))
    paste_rot(c,ex,330,80,angle=12,scale=1+0.15*abs(math.sin(k*2*math.pi)))
    paste_rot(c,drop,95,150+10*math.sin(k*2*math.pi))
    paste_rot(c,t,W*0.5,W*0.87,angle=-4)
    fr.append(c)
save('surprised',fr,70)

# 10 좋은 아침 — 햇살
fr=[]; t=text_img('좋은 아침',52,fill=(255,190,60))
for i in range(N):
    c=canvas(); k=i/N
    sun=Image.new('RGBA',(W,W),(0,0,0,0)); sd=ImageDraw.Draw(sun)
    for j in range(12):
        a=j*math.pi/6+k*math.pi/6; L=W*0.75
        sd.line((60,60,60+L*math.cos(a),60+L*math.sin(a)),fill=(255,220,120,120),width=14)
    sd.ellipse((10,10,110,110),fill=(255,215,80))
    c.alpha_composite(sun)
    place_char(c,calm_fist,dy=3*math.sin(k*2*math.pi))
    paste_rot(c,t,W*0.5,W*0.87,angle=-2)
    fr.append(c)
save('morning',fr)

# 미리 보기 판: 저장한 webp 의 세 장면씩
import glob
names=['hello','thanks','love','congrats','best','kkk','goodnight','amen','surprised','morning']
labels=['안녕하세요!','감사합니다','사랑해요','축하해요!','최고예요!','ㅋㅋㅋ','잘 자요','아멘','깜짝!','좋은 아침']
S=206; sheet=Image.new('RGB',(S*5+60,(S+40)*2+20),(255,255,255)); sd=ImageDraw.Draw(sheet); f=FONT(22)
for n,(name,lab) in enumerate(zip(names,labels)):
    im=Image.open(f'{OUT}/{name}.webp'); im.seek(4); fr0=im.convert('RGBA').resize((S,S),Image.LANCZOS)
    x=10+(n%5)*(S+10); y=10+(n//5)*(S+40)
    bg=Image.new('RGBA',(S,S),(250,246,240,255)); bg.alpha_composite(fr0); sheet.paste(bg.convert('RGB'),(x,y))
    sd.text((x+S/2,y+S+8),lab,font=f,fill=(60,50,40),anchor='mt')
sheet.save(f'{OUT}/preview.png'); print('sheet ok')
