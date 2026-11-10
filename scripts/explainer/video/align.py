import numpy as np,wave,json,re
w=wave.open('narr.wav');x=np.frombuffer(w.readframes(w.getnframes()),np.int16)/32768
n=480;d=20*np.log10(np.sqrt((x[:len(x)//n*n].reshape(-1,n)**2).mean(1)+1e-12))
sp=d>-40;N=len(sp)
# gaps: runs of non-speech >=0.4s
gaps=[];i=0
while i<N:
  if not sp[i]:
    j=i
    while j<N and not sp[j]:j+=1
    if j-i>=40 and i>0 and j<N: gaps.append((i/100,j/100))
    i=j
  else:i+=1
S0=np.argmax(sp)/100;S1=(N-np.argmax(sp[::-1]))/100
src=open('/home/user/catholicgram/lib/explainer-script.ts').read()
chs=[re.findall(r'"((?:[^"\\]|\\.)*)"',m.group(1)) for m in re.finditer(r'paras: \[(.*?)\] \}',src,re.S)]
paras=[];chof=[]
for c,ps in enumerate(chs):
  for p in ps: paras.append(p.replace('(운영자 이름)','윤호요셉 신부')); chof.append(c)
L=np.array([len(re.sub(r'\s','',p)) for p in paras],float)
# expected boundary time: speech time excluding gaps proportional to chars; approximate with total
cum=np.cumsum(L)/L.sum()
marks=[12.75]+[m-12.4+12.75 for m in [82.859,120.206,179.254,215.885,264.028,320.623,351.125,384.233,410.659,433.508]]
K=len(paras)-1;G=len(gaps)
exp=[S0+(S1-S0)*cum[k] for k in range(K)]
def cost(k,g):
  t=(gaps[g][0]+gaps[g][1])/2;ln=gaps[g][1]-gaps[g][0]
  c=((t-exp[k])/6)**2 - 3*ln
  if chof[k]!=chof[k+1]: # chapter boundary near mark
    m=marks[chof[k+1]-1]; c+=((t-m)/2.5)**2
  return c
INF=1e18;D=np.full((K,G),INF);P=np.zeros((K,G),int)
for g in range(G):D[0,g]=cost(0,g)
for k in range(1,K):
  best=INF;bi=-1
  for g in range(G):
    if g>0 and D[k-1,g-1]<best:best=D[k-1,g-1];bi=g-1
    if bi>=0:D[k,g]=best+cost(k,g);P[k,g]=bi
g=int(np.argmin(D[K-1]));sel=[g]
for k in range(K-1,0,-1):g=P[k,g];sel.append(g)
sel=sel[::-1]
t0=[S0]+[gaps[g][1] for g in sel];t1=[gaps[g][0] for g in sel]+[S1]
out=[];
for i,p in enumerate(paras):
  out.append({'ch':chof[i],'t0':round(t0[i],2),'t1':round(t1[i],2),'text':p})
  print(chof[i],round(t0[i],1),round(t1[i],1),round((t1[i]-t0[i])/L[i]*10,2),p[:28])
json.dump({'dur':N/100,'paras':out},open('timing.json','w'),ensure_ascii=False,indent=1)
