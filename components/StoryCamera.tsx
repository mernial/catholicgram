'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';

// 스토리 카메라 (운영자 2026-11-15 '스토리에서 바로 사진 찍기와 영상 찍기'): '스토리에 추가'를 열면 앱 안에서 바로 카메라가 켜짐.
// 사진 = 셔터 한 번, 영상 = '영상'으로 바꾸고 셔터로 시작·멈춤(1분이면 저절로 멈춤). 앞·뒤 카메라 바꾸기.
// 카메라를 못 쓰면(권한 거절·기기 없음) onUnavailable → 예전처럼 휴대폰 카메라 앱으로 찍는 단추를 보여 줌.
const MAX_SEC = 60;
const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
};

export default function StoryCamera({ onShot, onUnavailable, onGallery, children }: {
  onShot: (f: File) => void;
  onUnavailable: (why: string) => void;
  onGallery: () => void;
  children?: React.ReactNode; // 카메라 위에 얹는 단추들(글·음악·콜라주)
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<{ mr: MediaRecorder; chunks: Blob[]; timer: number } | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [ready, setReady] = useState(false);
  const [recSec, setRecSec] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { onUnavailable('이 기기에서는 앱 안 카메라를 쓸 수 없어요'); return; }
      const video = { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      let stream: MediaStream | null = null;
      try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: true }); }
      catch { try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); } catch { /* */ } }
      if (!alive) { stream?.getTracks().forEach(t => t.stop()); return; }
      if (!stream) { onUnavailable('카메라를 쓸 수 있게 허용해 주세요'); return; }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; v.muted = true; await v.play().catch(() => {}); }
      setReady(true);
    })();
    return () => { alive = false; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
    // onUnavailable 은 부모가 새로 만들어도 다시 켜지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);
  useEffect(() => () => { if (recRef.current) { clearInterval(recRef.current.timer); try { recRef.current.mr.stop(); } catch { /* */ } } }, []);

  const mirror = facing === 'user';
  const takePhoto = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    // 화면에 보이던 그대로(가득 채워 잘린 부분 빼고) 찍기
    const box = v.getBoundingClientRect(), ar = box.width / box.height, vw = v.videoWidth, vh = v.videoHeight;
    let sw = vw, sh = vh; if (vw / vh > ar) sw = vh * ar; else sh = vw / ar;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const c = document.createElement('canvas'); c.width = Math.round(sw); c.height = Math.round(sh);
    const x = c.getContext('2d')!; if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    setFlash(true); setTimeout(() => setFlash(false), 160);
    c.toBlob(b => { if (b) onShot(new File([b], `story-${Date.now()}.jpg`, { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
  };
  const stopRec = () => { const r = recRef.current; if (!r) return; clearInterval(r.timer); if (r.mr.state !== 'inactive') r.mr.stop(); };
  const startRec = () => {
    const stream = streamRef.current; const mime = pickMime();
    if (!stream || !mime) { onUnavailable('이 기기에서는 앱 안에서 영상을 찍을 수 없어요'); return; }
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      recRef.current = null; setRecSec(null);
      const type = mime.split(';')[0];
      const blob = new Blob(chunks, { type });
      if (blob.size > 0) onShot(new File([blob], `story-${Date.now()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type }));
    };
    const began = Date.now();
    const timer = window.setInterval(() => { const s = Math.floor((Date.now() - began) / 1000); setRecSec(s); if (s >= MAX_SEC) stopRec(); }, 250);
    recRef.current = { mr, chunks, timer };
    mr.start(500); setRecSec(0);
  };
  const shutter = () => { if (!ready) return; if (mode === 'photo') takePhoto(); else if (recRef.current) stopRec(); else startRec(); };
  const recording = recSec !== null;
  const pct = recording ? Math.min(1, recSec! / MAX_SEC) : 0;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-[0.9375rem]">카메라를 켜는 중…</div>}
      {flash && <div className="absolute inset-0 bg-white/80 pointer-events-none" />}
      {recording && (
        <div className="absolute top-[calc(4rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1 text-white font-bold text-[0.9375rem]">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />{`0:${String(recSec).padStart(2, '0')}`} / 1:00
        </div>
      )}
      {!recording && children}
      <div className="absolute inset-x-0 bottom-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-10 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center justify-around px-6">
          <button onClick={onGallery} disabled={recording} className="w-14 h-14 rounded-xl border-2 border-white/80 bg-white/10 flex items-center justify-center text-white disabled:opacity-30" aria-label="사진첩에서 고르기">
            <Icon name="image" className="w-7 h-7" />
          </button>
          <button onClick={shutter} disabled={!ready} aria-label={mode === 'photo' ? '사진 찍기' : recording ? '영상 멈추기' : '영상 찍기 시작'}
            className="relative w-[5.25rem] h-[5.25rem] rounded-full flex items-center justify-center disabled:opacity-50">
            <svg viewBox="0 0 84 84" className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="42" cy="42" r="38" fill="none" stroke="#fff" strokeWidth="5" opacity={recording ? 0.35 : 1} />
              {recording && <circle cx="42" cy="42" r="38" fill="none" stroke="#ef4444" strokeWidth="5" strokeDasharray={`${2 * Math.PI * 38}`} strokeDashoffset={`${2 * Math.PI * 38 * (1 - pct)}`} strokeLinecap="round" />}
            </svg>
            <span className={`block transition-all ${mode === 'photo' ? 'w-[4.1rem] h-[4.1rem] rounded-full bg-white' : recording ? 'w-8 h-8 rounded-lg bg-red-500' : 'w-[4.1rem] h-[4.1rem] rounded-full bg-red-500'}`} />
          </button>
          <button onClick={() => { setReady(false); setFacing(f => f === 'user' ? 'environment' : 'user'); }} disabled={recording} className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-white disabled:opacity-30" aria-label="앞·뒤 카메라 바꾸기">
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9a8 8 0 0 1 14.3-3.3L20 7.5M20 3.5v4h-4" /><path d="M20 15a8 8 0 0 1-14.3 3.3L4 16.5M4 20.5v-4h4" /></svg>
          </button>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          {(['photo', 'video'] as const).map(m => (
            <button key={m} onClick={() => !recording && setMode(m)} aria-pressed={mode === m}
              className={`px-4 py-1.5 rounded-full text-[0.9375rem] font-bold ${mode === m ? 'bg-white text-black' : 'text-white/80'}`}>{m === 'photo' ? '사진' : '영상'}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
