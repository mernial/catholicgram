import sys, glob, math
from collections import deque
from PIL import Image, ImageSequence, ImageDraw, ImageFont
import numpy as np
SRC=sys.argv[1]; OUT=sys.argv[2]; FONT=sys.argv[3]
labels=['안녕하세요!','감사합니다','사랑해요','최고!','화이팅!','기도할게요','아멘!','축복합니다','깜짝!','하하하','속상해요','화났어요','졸려요','부끄러워요','삐졌어요','고민중','괜찮아요','미안해요','고마워요','좋아요','축하해요','잘자요','기다릴게요','행복해요']
colors=[(255,150,40),(255,150,40),(255,80,120),(60,140,255),(255,120,40),(255,170,60),(100,170,255),(255,170,60),(255,200,40),(255,170,60),(120,160,255),(255,90,90),(120,170,255),(255,120,160),(120,180,120),(120,160,220),(80,190,120),(120,160,220),(255,120,160),(60,160,255),(255,120,60),(140,150,255),(255,170,60),(255,110,150)]
BG=np.array([254,249,241])
def edge_transparent(im):
    a=np.asarray(im).astype(int); h,w=a.shape[:2]
    near=(np.abs(a[:,:,:3]-BG).sum(2)<54)&(a[:,:,3]>0)
    seen=np.zeros((h,w),bool); q=deque()
    # 씨앗: 투명한 곳(그림 바깥)과 맞닿은 크림색 + 그림 가장자리
    trans=a[:,:,3]==0
    nb=np.zeros((h,w),bool); nb[1:]|=trans[:-1]; nb[:-1]|=trans[1:]; nb[:,1:]|=trans[:,:-1]; nb[:,:-1]|=trans[:,1:]
    nb[0]=nb[-1]=True; nb[:,0]=nb[:,-1]=True
    for y,x in zip(*np.where(near&nb)): seen[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and near[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True; q.append((ny,nx))
    out=np.asarray(im).copy(); dist=np.abs(a[:,:,:3]-BG).sum(2)
    alpha=out[:,:,3].copy(); alpha[seen]=0
    edge=seen&(dist>22); alpha[edge]=np.clip(dist[edge]*4,0,255)
    out[:,:,3]=alpha; return Image.fromarray(out,'RGBA')
def label_img(txt,color,size=58):
    f=ImageFont.truetype(FONT,size); sw=5; pad=sw*2+8
    b=f.getbbox(txt); w=b[2]-b[0]+pad*2; h=b[3]-b[1]+pad*2
    im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.text((pad-b[0],pad-b[1]),txt,font=f,fill=color,stroke_width=sw+3,stroke_fill=(255,255,255))
    d.text((pad-b[0],pad-b[1]),txt,font=f,fill=color,stroke_width=1,stroke_fill=tuple(int(c*0.55) for c in color))
    return im
files=sorted(glob.glob(f'{SRC}/*.gif'))
report=[]
for n,p in enumerate(files):
    im=Image.open(p); frames=[fr.convert('RGBA') for fr in ImageSequence.Iterator(im)]
    dur=im.info.get('duration',110)
    a0=np.asarray(frames[0]).astype(int)
    full=((np.abs(a0[:,:,:3]-BG).sum(2)<30)&(a0[:,:,3]>0)).mean()>0.12  # 크림 바탕 네모가 들어 있는 종류
    W=360; outs=[]
    if full:
        frames=[edge_transparent(f) for f in frames]
        lab=label_img(labels[n],colors[n])
        for f in frames:
            c=Image.new('RGBA',(W,W),(0,0,0,0))
            ch=f.resize((int(W*0.8),int(W*0.8)),Image.LANCZOS)
            c.alpha_composite(ch,((W-ch.width)//2,0))
            # 글자: 아래 가운데, 너비는 캔버스 90% 안
            if lab.width>W*0.9: lab=lab.resize((int(W*0.9),int(lab.height*W*0.9/lab.width)),Image.LANCZOS)
            c.alpha_composite(lab,((W-lab.width)//2,W-lab.height-4))
            outs.append(c)
    else:
        # 모든 프레임의 그림 범위를 합쳐 잘라 크게
        al=np.max([np.asarray(f)[:,:,3] for f in frames],axis=0)
        ys,xs=np.where(al>8); x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
        side=max(x1-x0,y1-y0); pad=int(side*0.04); side+=pad*2
        cx=(x0+x1)//2; cy=(y0+y1)//2
        for f in frames:
            c=Image.new('RGBA',(side,side),(0,0,0,0))
            c.alpha_composite(f,(side//2-cx,side//2-cy))
            outs.append(c.resize((W,W),Image.LANCZOS))
    small=[o.resize((256,256),Image.LANCZOS) for o in outs]
    name=f'{n+1:02d}'
    small[0].save(f'{OUT}/{name}.webp',save_all=True,append_images=small[1:],duration=dur,loop=0,quality=75,method=6,minimize_size=True)
    import os; report.append((name,labels[n],'full' if full else 'sticker',len(outs),os.path.getsize(f'{OUT}/{name}.webp')//1024))
for r in report: print(r)
# 미리 보기 판 (5번째 장면)
S=170; sheet=Image.new('RGB',(S*6,S*4),(250,246,240))
for n in range(len(files)):
    im=Image.open(f'{OUT}/{n+1:02d}.webp'); im.seek(5); f=im.convert('RGBA').resize((S,S))
    bg=Image.new('RGBA',(S,S),(250,246,240,255)); bg.alpha_composite(f); sheet.paste(bg.convert('RGB'),((n%6)*S,(n//6)*S))
sheet.save(f'{OUT}/_preview.png')
