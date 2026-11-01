'use client';

// 게시글의 글만 사진(PNG)으로 (루비로사 건의 2026-11-01: '오늘의 복음 묵상글을 캡처해서 교사 단톡방에 공유했는데
// 사진은 이미지 저장으로 쉽게 했는데 묵상글 캡처가 쉽지 않더라구요 — 딱 묵상글만 캡처나 저장할 수 있는 방법'):
// 크림색 바탕의 흰 카드에 글쓴이·날짜·글 전체(접힘 없이) + 아래 '가톨릭그램'. 앱 글꼴 그대로, 긴 글도 한 장에.
const W = 1080, PAD = 72, CARD = 48;

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

export async function renderPostTextCard({ author, handle, date, text }: { author: string; handle?: string | null; date: string; text: string }): Promise<Blob> {
  try { await document.fonts?.ready; } catch { /* 글꼴을 못 기다려도 그림 */ }
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const textW = W - PAD * 2 - CARD * 2;
  // 아주 긴 글은 글씨를 조금 줄여 한 장에 (그림 높이 15000px 안쪽)
  let size = 36;
  let lines: string[] = [];
  for (; size >= 24; size -= 2) {
    ctx.font = `400 ${size}px ${family}`;
    lines = wrap(ctx, text.trim(), textW);
    if (lines.length * size * 1.7 < 13000) break;
  }
  const lh = Math.round(size * 1.7);
  const headH = 150, footH = 110;
  const bodyH = lines.length * lh;
  const cardH = CARD + headH + bodyH + CARD;
  const H = PAD + cardH + footH;
  canvas.width = W; canvas.height = H;
  // 바탕
  ctx.fillStyle = '#f6efe3';
  ctx.fillRect(0, 0, W, H);
  // 카드
  const x0 = PAD, y0 = PAD, cw = W - PAD * 2, r = 36;
  ctx.save();
  ctx.shadowColor = 'rgba(80,60,30,0.12)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, y0, cw, cardH, r); else ctx.rect(x0, y0, cw, cardH);
  ctx.fill();
  ctx.restore();
  // 머리: 글쓴이 · 날짜
  const tx = x0 + CARD;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2b2620';
  ctx.font = `800 38px ${family}`;
  ctx.fillText(author, tx, y0 + CARD + 44);
  const nameW = ctx.measureText(author).width;
  if (handle) {
    ctx.fillStyle = '#9a8f80';
    ctx.font = `400 28px ${family}`;
    ctx.fillText(`@${handle}`, tx + nameW + 16, y0 + CARD + 44);
  }
  ctx.fillStyle = '#9a8f80';
  ctx.font = `400 28px ${family}`;
  ctx.fillText(date, tx, y0 + CARD + 92);
  // 금색 줄
  ctx.fillStyle = '#d9b46a';
  ctx.fillRect(tx, y0 + CARD + 120, 72, 4);
  // 글
  ctx.fillStyle = '#2b2620';
  ctx.font = `400 ${size}px ${family}`;
  let y = y0 + CARD + headH + Math.round(size * 1.05);
  for (const line of lines) { ctx.fillText(line, tx, y); y += lh; }
  // 아래: 가톨릭그램
  ctx.fillStyle = '#8b6d3a';
  ctx.font = `800 30px ${family}`;
  ctx.textAlign = 'center';
  ctx.fillText('가톨릭그램', W / 2, PAD + cardH + 62);
  ctx.fillStyle = '#b0a593';
  ctx.font = `400 22px ${family}`;
  ctx.fillText('catholicgram-dey7.vercel.app', W / 2, PAD + cardH + 94);
  return await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
}
