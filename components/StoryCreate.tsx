'use client';

import { useEffect, useRef, useState } from 'react';
import Collage from '@/components/Collage';
import Icon from '@/components/Icon';
import { useBackLayer } from '@/lib/back-layers';

// '스토리에 추가' 화면 (운영자 2026-11-11 인스타그램 시안): 어두운 화면 · 위에 글·음악·콜라주 카드 · 아래 카메라·사진첩.
// 웹은 휴대폰 사진첩의 '최근' 사진을 직접 보여 줄 수 없어서, 사진첩은 휴대폰 사진 고르기 창을 엶.

export interface StoryMusic { value: string; title: string }

const BACKGROUNDS: { key: string; label: string; stops: [string, string]; ink: string }[] = [
  { key: 'gold', label: '금빛', stops: ['#f6e7c1', '#d9a95b'], ink: '#3b2a12' },
  { key: 'sage', label: '세이지', stops: ['#dfe9da', '#7f9c78'], ink: '#1f2d1d' },
  { key: 'navy', label: '밤하늘', stops: ['#27365f', '#0f1530'], ink: '#fdf7e8' },
  { key: 'rose', label: '장미', stops: ['#fbe1e4', '#d97a8a'], ink: '#3d1520' },
  { key: 'sky', label: '하늘', stops: ['#dcefff', '#7fb3e6'], ink: '#10304f' },
  { key: 'wine', label: '포도주', stops: ['#7a2638', '#3b0f1a'], ink: '#fdf2e6' },
];

const fontFamily = () => (typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : 'sans-serif');

// 글을 캔버스 너비에 맞춰 줄 바꿈 (한국어는 띄어쓰기 없이도 글자 단위로)
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      if (ctx.measureText(line + ch).width > width && line) {
        const sp = line.lastIndexOf(' ');
        if (sp > line.length * 0.5) { lines.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { lines.push(line); line = ch; }
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

// 글 스토리를 1080×1920 사진으로
async function renderTextStory(text: string, bg: typeof BACKGROUNDS[number], music?: StoryMusic | null): Promise<File> {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, bg.stops[0]); g.addColorStop(1, bg.stops[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  await document.fonts?.ready?.catch(() => {});
  const fam = fontFamily();
  const body = text.trim();
  if (body) {
    let size = 96;
    let lines: string[] = [];
    for (; size >= 44; size -= 4) {
      ctx.font = `800 ${size}px ${fam}`;
      lines = wrap(ctx, body, W - 180);
      if (lines.length * size * 1.42 < H * (music ? 0.5 : 0.62)) break;
    }
    const lh = size * 1.42;
    const top = H / 2 - (lines.length * lh) / 2 - (music ? 120 : 0);
    ctx.fillStyle = bg.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + lh * (i + 0.5)));
  }
  if (music) {
    // 음악 카드 (가운데 아래)
    const cw = 640, ch = 150, cx = (W - cw) / 2, cy = body ? H / 2 + 260 : H / 2 - ch / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.fill();
    ctx.fillStyle = '#3b2a12'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `800 64px ${fam}`; ctx.fillText('♫', cx + 44, cy + ch / 2);
    ctx.font = `800 44px ${fam}`;
    let t = music.title;
    while (ctx.measureText(t).width > cw - 190 && t.length > 1) t = t.slice(0, -1);
    ctx.fillText(t === music.title ? t : `${t}…`, cx + 140, cy + ch / 2 - 18);
    ctx.font = `600 32px ${fam}`; ctx.fillStyle = '#8a7558'; ctx.fillText('가톨릭그램 음악', cx + 140, cy + ch / 2 + 34);
  }
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.9));
  return new File([blob!], `story_text_${Date.now()}.jpg`, { type: 'image/jpeg' });
}

// 글·음악 스토리 만들기: 바탕색 고르기 + 가운데 글 + (음악)
function TextStory({ music, onPickMusic, onDone, onCancel }: {
  music: StoryMusic | null; onPickMusic: () => void; onDone: (f: File) => void; onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BACKGROUNDS[0]);
  const [busy, setBusy] = useState(false);
  useBackLayer(true, onCancel);
  const can = !!text.trim() || !!music;
  const done = async () => { if (!can) return; setBusy(true); try { onDone(await renderTextStory(text, bg, music)); } finally { setBusy(false); } };
  return (
    <div data-no-pinch className="fixed inset-0 z-[87] flex flex-col" style={{ background: `linear-gradient(160deg, ${bg.stops[0]}, ${bg.stops[1]})`, color: bg.ink }} role="dialog" aria-label="글 스토리 만들기">
      <div className="shrink-0 flex items-center justify-between px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
        <button onClick={onCancel} className="w-11 h-11 flex items-center justify-center text-3xl leading-none" aria-label="닫기">×</button>
        <button onClick={onPickMusic} className="px-3 h-9 rounded-full bg-black/15 text-[0.875rem] font-bold flex items-center gap-1.5"><Icon name="music" className="w-4 h-4" />{music ? '음악 바꾸기' : '음악'}</button>
        <button onClick={done} disabled={!can || busy} className="px-4 h-9 rounded-full bg-black/80 text-white text-[0.9375rem] font-bold disabled:opacity-40">{busy ? '만드는 중' : '다음'}</button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 gap-6">
        <textarea autoFocus value={text} onChange={e => setText(e.target.value.slice(0, 300))} placeholder="오늘 나누고 싶은 말씀·기도·소식을 써 보세요"
          className="w-full bg-transparent text-center font-extrabold text-[1.625rem] leading-snug resize-none [field-sizing:content] min-h-[3rem] max-h-[50dvh] focus:outline-none placeholder:opacity-50" style={{ color: bg.ink }} />
        {music && (
          <div className="flex items-center gap-3 rounded-2xl bg-white/90 text-stone-800 px-4 py-3 max-w-full shadow">
            <span className="text-2xl">♫</span>
            <span className="min-w-0"><span className="block font-bold truncate">{music.title}</span><span className="block text-[0.75rem] text-stone-500">스토리를 보면 이 음악이 흘러요</span></span>
          </div>
        )}
      </div>
      <div className="shrink-0 flex justify-center gap-3 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {BACKGROUNDS.map(b => (
          <button key={b.key} onClick={() => setBg(b)} aria-label={`바탕 ${b.label}`} aria-pressed={bg.key === b.key}
            className={`w-9 h-9 rounded-full border-2 ${bg.key === b.key ? 'border-white scale-110 shadow-lg' : 'border-white/50'}`} style={{ background: `linear-gradient(160deg, ${b.stops[0]}, ${b.stops[1]})` }} />
        ))}
      </div>
    </div>
  );
}

export default function StoryCreate({ onClose, onFile, onPickMusic }: {
  onClose: () => void;
  onFile: (f: File, music?: StoryMusic | null) => void; // 고르거나 만든 사진·영상 → '새 스토리' 미리보기
  onPickMusic: (cb: (m: StoryMusic) => void) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const collageRef = useRef<HTMLInputElement>(null);
  const [collageFiles, setCollageFiles] = useState<File[] | null>(null);
  const [textMode, setTextMode] = useState<{ music: StoryMusic | null } | null>(null);
  useBackLayer(true, onClose);
  useBackLayer(!!collageFiles, () => setCollageFiles(null));
  // 음악 카드: 곡을 먼저 고르고 → 바탕·글을 꾸밈
  const pickMusic = () => onPickMusic(m => setTextMode({ music: m }));
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  const one = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); };
  const card = 'flex-1 min-w-0 h-28 rounded-2xl bg-[#1d1d1f] flex flex-col items-center justify-center gap-2 active:scale-[0.97] transition';
  return (
    <div data-no-pinch className="fixed inset-0 z-[86] bg-black text-white flex flex-col" role="dialog" aria-label="스토리에 추가">
      <div className="shrink-0 flex items-center justify-between px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-3xl leading-none" aria-label="닫기">×</button>
        <h2 className="font-bold text-[1.125rem]">스토리에 추가</h2>
        <span className="w-11" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-2.5 mt-2">
          <button onClick={() => setTextMode({ music: null })} className={card}>
            <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 text-stone-900 font-extrabold text-xl flex items-center justify-center">Aa</span>
            <span className="text-[0.875rem] font-bold">글</span>
          </button>
          <button onClick={() => pickMusic()} className={card}>
            <span className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-300 to-violet-500 flex items-center justify-center"><Icon name="music" className="w-6 h-6 text-white" /></span>
            <span className="text-[0.875rem] font-bold">음악</span>
          </button>
          <button onClick={() => collageRef.current?.click()} className={card}>
            <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-300 to-emerald-400 flex items-center justify-center"><Icon name="collage" className="w-6 h-6 text-white" /></span>
            <span className="text-[0.875rem] font-bold">콜라주</span>
          </button>
        </div>
        <p className="mt-6 mb-2 text-[1.0625rem] font-bold">사진·영상</p>
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => cameraRef.current?.click()} className="aspect-[3/4] rounded-2xl bg-[#1d1d1f] flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition">
            <Icon name="camera" className="w-12 h-12" />
            <span className="font-bold">카메라</span>
          </button>
          <button onClick={() => galleryRef.current?.click()} className="aspect-[3/4] rounded-2xl bg-[#1d1d1f] flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition">
            <Icon name="image" className="w-12 h-12" />
            <span className="font-bold">사진첩</span>
            <span className="text-[0.75rem] text-white/55 text-center px-4 leading-snug">사진 또는 영상<br />긴 영상은 1분 안으로 골라요</span>
          </button>
        </div>
        <p className="mt-5 text-center text-[0.75rem] text-white/45">스토리는 24시간 뒤에 저절로 사라져요</p>
      </div>
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={one} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" className="hidden" onChange={one} />
      <input ref={collageRef} type="file" accept="image/*" multiple className="hidden" onChange={e => {
        const fs = Array.from(e.target.files || []); e.target.value = '';
        if (fs.length === 1) onFile(fs[0]);
        else if (fs.length > 1) setCollageFiles(fs);
      }} />
      {collageFiles && <Collage files={collageFiles} onCancel={() => setCollageFiles(null)} onDone={f => { setCollageFiles(null); onFile(f); }} />}
      {textMode && <TextStory music={textMode.music} onPickMusic={() => pickMusic()} onCancel={() => setTextMode(null)} onDone={f => { const m = textMode.music; setTextMode(null); onFile(f, m); }} />}
    </div>
  );
}
