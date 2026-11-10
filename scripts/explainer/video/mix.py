import numpy as np,json,wave
SR=48000
def rd(f):
  w=wave.open(f);x=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
  return x.reshape(-1,w.getnchannels())
d=json.load(open('sfx.json'));DUR=d['dur'];N=int(DUR*SR)
out=np.zeros((N,2),np.float32)
def add(x,t,g):
  i=int(t*SR);j=min(N,i+len(x));
  if i<N: out[i:j]+=x[:j-i]*g
# narration (mono -> stereo)
nar=rd('narr.wav')[:,0];add(np.stack([nar,nar],1),0,1.0)
# sfx synth
rng=np.random.default_rng(1)
def tick():
  n=int(.05*SR);t=np.arange(n)/SR;s=np.sin(2*np.pi*1800*t)*np.exp(-t*90)*.5+rng.standard_normal(n)*np.exp(-t*200)*.15;return np.stack([s,s],1)
def whoosh():
  n=int(.45*SR);t=np.arange(n)/SR;s=rng.standard_normal(n)
  # simple lowpass via cumulative moving average
  k=40;s=np.convolve(s,np.ones(k)/k,'same');env=np.sin(np.pi*t/.45)**2;s=s*env*.6
  return np.stack([s*.9,s],1)
for t in d['taps']: add(tick(),t,.35)
for t in d['trans']: add(whoosh(),max(0,t-.05),.12)
add(rd('bell.wav'),0.0,.35)
add(rd('chime.wav'),d['fx'][-1][1]+1.4,.3) # end button
add(rd('praise.wav'),d['praise']+0.05,.55)
# music
m=rd('calm.wav');L=len(m);xf=int(3*SR);mus=np.zeros((N,2),np.float32);pos=0
while pos<N:
  seg=m.copy();seg[:xf]*=np.linspace(0,1,xf)[:,None] if pos>0 else 1;seg[-xf:]*=np.linspace(1,0,xf)[:,None]
  j=min(N,pos+L);mus[pos:j]+=seg[:j-pos];pos+=L-xf
# ducking by narration envelope
e=np.abs(nar);win=int(.25*SR);c=np.concatenate([[0],np.cumsum(e,dtype=np.float64)]);env=((c[win:]-c[:-win])/win);env=np.concatenate([np.zeros(win//2),env,np.zeros(win-win//2)])[:len(e)];env=np.pad(env,(0,max(0,N-len(env))))[:N]
sp=(env>0.01).astype(np.float32)
# smooth gate: attack 0.3s release 0.8s
g=np.zeros(N,np.float32);a=1/(0.3*SR);r=1/(0.9*SR);v=0
# vectorized-ish via chunks
step=480
for i in range(0,N,step):
  tgt=sp[i:i+step].max()
  v=v+(tgt-v)*(1-np.exp(-step*(a if tgt>v else r)*3))
  g[i:i+step]=v
gain=0.30*(1-g)+0.10*g  # 0.30 when silent, 0.10 under voice
fade=np.ones(N,np.float32);fi=int(1.5*SR);fade[:fi]=np.linspace(0,1,fi);fo=int(3*SR);fade[-fo:]=np.linspace(1,0,fo)
out+=mus*(gain*fade)[:,None]
pk=np.abs(out).max();print('peak',pk)
out=np.clip(out,-1,1)
w=wave.open('mix.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((out*32767).astype(np.int16).tobytes());w.close()
