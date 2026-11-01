'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/chat-actions';

// 대화 캡처 (1:1 메시지·단체 채팅방·사랑방 공통)
//  1) 무엇을: '대화 골라서'(메시지를 눌러 고름) 또는 '지금 화면'(지금 보이는 대화)
//  2) 그림으로 만들기: 화면을 찍는 대신 말풍선을 직접 그린다 (어느 휴대폰에서나 같게)
//  3) 어떻게: 다른 앱으로 공유하기 또는 복사해서 붙여 넣기 (사진으로 저장도)

export interface CaptureItem {
  id: string;
  name?: string;          // 남이 보낸 것: 보낸 사람
  text: string;           // 글 (사진만이면 빈 글)
  mine: boolean;
  time: string;           // ISO
  photos?: string[];      // 사진 주소들
  video?: boolean;        // 동영상
  system?: boolean;       // 가운데 안내 글
}

const W = 420, SCALE = 3, PAD = 16;
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

const loadImage = (src: string) => new Promise<HTMLImageElement | null>(resolve => {
  const img = new Image();
  img.crossOrigin = 'anonymous'; // 저장소가 허락하지 않으면 그리지 않고 '📷 사진' 칸으로
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
  setTimeout(() => resolve(null), 6000);
});

// 글을 폭에 맞게 줄 나누기 (띄어쓰기 기준, 너무 긴 낱말은 글자 단위로)
const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const token of para.split(/(\s+)/)) {
      if (!token) continue;
      if (ctx.measureText(line + token).width <= maxW) { line += token; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
      if (ctx.measureText(token).width <= maxW) { line = token.trimStart(); continue; }
      for (const ch of Array.from(token)) {
        if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ''; }
        line += ch;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
};

// 고른 대화를 그림(PNG)으로
export async function renderCapture(items: CaptureItem[], title: string, theme: { mine: string; bg: string } = { mine: '#5f7d55', bg: '#eef1ea' }): Promise<Blob> {
  const list = items.slice(0, 80);
  const photoUrls = Array.from(new Set(list.flatMap(i => (i.photos || []).slice(0, 9))));
  const images = new Map<string, HTMLImageElement | null>();
  await Promise.all(photoUrls.map(async u => images.set(u, await loadImage(u))));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const textMax = Math.round(W * 0.62);
  const font = (size: number, bold = false) => `${bold ? '700' : '400'} ${size}px ${FONT}`;

  // 1) 자리 재기
  type Laid = { item: CaptureItem; lines: string[]; bw: number; bh: number; mediaH: number; tile: number; cols: number; showName: boolean; showDay: boolean; y: number };
  const laid: Laid[] = [];
  let y = PAD + 44; // 제목 자리
  let prev: CaptureItem | null = null;
  for (const item of list) {
    const showDay = !prev || dayOf(prev.time) !== dayOf(item.time);
    if (showDay) y += 34;
    if (item.system) {
      laid.push({ item, lines: [item.text], bw: 0, bh: 26, mediaH: 0, tile: 0, cols: 0, showName: false, showDay, y });
      y += 26 + 10; prev = item; continue;
    }
    ctx.font = font(15);
    const lines = item.text ? wrap(ctx, item.text, textMax) : [];
    const textW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
    const n = item.photos?.length || 0;
    const cols = n <= 1 ? 1 : n === 2 || n === 4 ? 2 : 3;
    const tile = n <= 1 ? 200 : Math.floor((Math.min(textMax, 240)) / cols);
    const rows = n ? Math.ceil(Math.min(n, 9) / cols) : 0;
    const mediaH = n ? rows * tile + (lines.length ? 8 : 0) : item.video ? 120 + (lines.length ? 8 : 0) : 0;
    const mediaW = n ? cols * tile : item.video ? 200 : 0;
    const bw = Math.max(textW, mediaW) + 24;
    const bh = mediaH + (lines.length ? lines.length * 22 : 0) + 18;
    const showName = !item.mine && !!item.name && (!prev || prev.mine || prev.system || prev.name !== item.name || showDay);
    if (showName) y += 20;
    laid.push({ item, lines, bw, bh, mediaH, tile, cols, showName, showDay, y });
    y += bh + 10;
    prev = item;
    if (y > 5200) break; // 너무 길면 여기까지
  }
  const H = y + PAD + 22;

  // 2) 그리기
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#292524';
  ctx.font = font(16, true);
  ctx.fillText(title.length > 26 ? title.slice(0, 25) + '…' : title, PAD, PAD + 4);
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(PAD, PAD + 32, W - PAD * 2, 1);

  for (const l of laid) {
    const { item } = l;
    let top = l.y;
    if (l.showDay) {
      const d = dayOf(item.time);
      ctx.font = font(12);
      const w = ctx.measureText(d).width + 20;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      roundRect(ctx, (W - w) / 2, top - 28, w, 20, 10); ctx.fill();
      ctx.fillStyle = '#57534e'; ctx.fillText(d, (W - w) / 2 + 10, top - 24);
    }
    if (item.system) {
      ctx.font = font(12.5);
      const w = Math.min(W - PAD * 2, ctx.measureText(item.text).width + 24);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      roundRect(ctx, (W - w) / 2, top, w, 24, 12); ctx.fill();
      ctx.fillStyle = '#57534e'; ctx.fillText(item.text, (W - w) / 2 + 12, top + 5, w - 24);
      continue;
    }
    if (l.showName) {
      ctx.font = font(12.5, true); ctx.fillStyle = '#44403c';
      ctx.fillText(item.name!, PAD + 4, top - 18);
    }
    const x = item.mine ? W - PAD - l.bw : PAD;
    ctx.fillStyle = item.mine ? theme.mine : '#ffffff';
    roundRect(ctx, x, top, l.bw, l.bh, 16); ctx.fill();
    if (!item.mine) { ctx.strokeStyle = '#e7e5e4'; ctx.lineWidth = 1; ctx.stroke(); }
    let cy = top + 9;
    const n = item.photos?.length || 0;
    if (n) {
      item.photos!.slice(0, 9).forEach((u, i) => {
        const tx = x + 12 + (i % l.cols) * l.tile, ty = cy + Math.floor(i / l.cols) * l.tile;
        const img = images.get(u);
        ctx.save(); roundRect(ctx, tx + 1, ty + 1, l.tile - 2, l.tile - 2, 8); ctx.clip();
        if (img) drawCover(ctx, img, tx + 1, ty + 1, l.tile - 2, l.tile - 2);
        else { ctx.fillStyle = '#d6d3d1'; ctx.fillRect(tx, ty, l.tile, l.tile); ctx.fillStyle = '#57534e'; ctx.font = font(13); ctx.fillText('📷 사진', tx + 10, ty + l.tile / 2 - 8); }
        ctx.restore();
        if (i === 8 && n > 9) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(tx + 1, ty + 1, l.tile - 2, l.tile - 2); ctx.fillStyle = '#fff'; ctx.font = font(18, true); ctx.fillText(`+${n - 9}`, tx + l.tile / 2 - 14, ty + l.tile / 2 - 10); }
      });
      cy += l.mediaH;
    } else if (item.video) {
      ctx.fillStyle = '#1c1917'; roundRect(ctx, x + 12, cy, 200, 120, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = font(14, true); ctx.fillText('🎬 동영상', x + 64, cy + 50);
      cy += l.mediaH;
    }
    ctx.font = font(15);
    ctx.fillStyle = item.mine ? '#ffffff' : '#1c1917';
    l.lines.forEach((line, i) => ctx.fillText(line, x + 12, cy + i * 22));
    // 시간
    ctx.font = font(10.5); ctx.fillStyle = '#78716c';
    const t = timeOf(item.time);
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, item.mine ? x - tw - 6 : x + l.bw + 6, top + l.bh - 14);
  }
  ctx.font = font(11); ctx.fillStyle = '#a8a29e';
  ctx.fillText('가톨릭그램', W - PAD - ctx.measureText('가톨릭그램').width, H - PAD - 10);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('capture failed'))), 'image/png'));
}

// 대화 목록 칸에서 지금 화면에 보이는 메시지 id (줄의 id 가 prefix + 메시지 id 인 것)
export function visibleIds(list: HTMLElement | null, prefix: string): string[] {
  if (!list) return [];
  const box = list.getBoundingClientRect();
  return Array.from(list.querySelectorAll<HTMLElement>(`[id^="${prefix}"]`))
    .filter(el => { const r = el.getBoundingClientRect(); return r.bottom > box.top + 4 && r.top < box.bottom - 4; })
    .map(el => el.id.slice(prefix.length));
}

// 1) 무엇을 캡처할지
export function CaptureChoice({ onPick, onScreen, onClose }: { onPick: () => void; onScreen: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[96] bg-black/45 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:w-96 bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-2.5" onClick={e => e.stopPropagation()} role="dialog" aria-label="캡처">
        <h3 className="font-bold text-[1.125rem] text-stone-900">무엇을 캡처할까요?</h3>
        <button onClick={onPick} className="w-full text-left px-4 py-3.5 rounded-2xl border-2 border-stone-200 active:bg-stone-50">
          <span className="block font-bold text-[1rem] text-stone-900">💬 대화 골라서 캡처</span>
          <span className="block text-[0.8125rem] text-stone-500 mt-0.5">남기고 싶은 메시지를 눌러서 고른 뒤 그림으로 만들어요</span>
        </button>
        <button onClick={onScreen} className="w-full text-left px-4 py-3.5 rounded-2xl border-2 border-stone-200 active:bg-stone-50">
          <span className="block font-bold text-[1rem] text-stone-900">📱 지금 화면 캡처</span>
          <span className="block text-[0.8125rem] text-stone-500 mt-0.5">지금 화면에 보이는 대화를 그대로 그림으로 만들어요</span>
        </button>
        <button onClick={onClose} className="py-3 text-stone-500 font-bold">취소</button>
      </div>
    </div>
  );
}

// 대화 고르는 중: 아래 막대
export function CaptureBar({ count, busy, onCancel, onDone }: { count: number; busy?: boolean; onCancel: () => void; onDone: () => void }) {
  return (
    <div className="shrink-0 bg-stone-900 text-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3" role="toolbar" aria-label="캡처할 대화 고르기">
      <p className="flex-1 text-[0.9375rem] font-bold">📸 {count > 0 ? `${count}개 골랐어요` : '캡처할 메시지를 눌러 고르세요'}</p>
      <button onClick={onCancel} className="h-11 px-4 rounded-xl bg-white/15 font-bold">취소</button>
      <button onClick={onDone} disabled={count === 0 || busy} className="h-11 px-4 rounded-xl bg-amber-400 text-stone-900 font-bold disabled:opacity-40">{busy ? '만드는 중…' : '캡처하기'}</button>
    </div>
  );
}

// 3) 만든 그림 보기 → 공유하기 / 복사하기 / 사진으로 저장
export function CapturePreview({ blob, title, onClose }: { blob: Blob; title: string; onClose: () => void }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const file = useMemo(() => new File([blob], `catholicgram-${Date.now()}.png`, { type: 'image/png' }), [blob]);
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });

  const save = () => {
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const share = async () => {
    if (!canShare) { save(); toast('사진으로 저장했어요'); return; }
    setBusy(true);
    try { await navigator.share({ files: [file], title }); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') alert('공유하지 못했어요. 사진으로 저장해서 보내 주세요.'); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('복사했어요. 붙여 넣을 곳에서 꾹 눌러 붙여 넣으세요');
    } catch {
      alert('이 휴대폰에서는 그림 복사가 안 돼요.\n\'공유하기\'로 보내거나 \'사진으로 저장\'해 주세요.');
    }
  };

  return (
    <div className="fixed inset-0 z-[97] bg-black/80 flex flex-col" onClick={onClose} role="dialog" aria-label="캡처한 그림">
      <div className="shrink-0 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2 flex items-center justify-between text-white">
        <p className="font-bold text-[1.0625rem]">📸 캡처했어요</p>
        <button onClick={onClose} className="w-11 h-11 text-3xl leading-none" aria-label="닫기">×</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 flex justify-center" onClick={e => e.stopPropagation()}>
        {/* 그림을 꾹 눌러 저장할 수도 있다 */}
        <img src={url} alt="캡처한 그림" className="self-start max-w-full rounded-xl shadow-2xl" />
      </div>
      <div className="shrink-0 bg-white rounded-t-3xl px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-2" onClick={e => e.stopPropagation()}>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={share} disabled={busy} className="py-3.5 rounded-2xl bg-stone-900 text-white font-bold text-[1rem]">📤 공유하기</button>
          <button onClick={copy} className="py-3.5 rounded-2xl bg-amber-400 text-stone-900 font-bold text-[1rem]">📋 복사하기</button>
        </div>
        <p className="text-[0.8125rem] text-stone-500 text-center">공유하기: 카카오톡·문자 등 다른 앱으로 보내기 · 복사하기: 다른 곳에 붙여 넣기</p>
        <button onClick={save} className="py-2 text-[0.9375rem] font-bold text-stone-600 underline underline-offset-4">사진으로 저장</button>
      </div>
    </div>
  );
}
