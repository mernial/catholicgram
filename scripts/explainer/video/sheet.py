from PIL import Image,ImageDraw
import glob,os,sys
fs=sorted(glob.glob('/tmp/cgexp/pv/*.jpg'));w,h=480,270;cols=4
S=Image.new('RGB',(cols*w,((len(fs)+cols-1)//cols)*h),'white');d=ImageDraw.Draw(S)
for i,f in enumerate(fs):
  S.paste(Image.open(f).resize((w,h)),((i%cols)*w,(i//cols)*h));d.text(((i%cols)*w+4,(i//cols)*h+4),os.path.basename(f),fill='red')
S.save('/tmp/cgexp/pvsheet.jpg',quality=85);print(len(fs))
