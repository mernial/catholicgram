import { ImageResponse } from 'next/og';
import { MOTIFS } from '@/lib/meditation-motifs';
import type { Meditation, LiturgicalColor } from '@/lib/meditation';

// 오늘의 묵상 포토카드 (1080×1080 정사각형 PNG)
// 전례색에 맞춘 배경 + 주제를 나타내는 큰 그림(옅게) + 핵심 문장 + '윤호요셉 신부'

const PALETTES: Record<LiturgicalColor, { from: string; to: string; text: string; sub: string; accent: string; motif: string }> = {
  green:  { from: '#1d3a2c', to: '#3f6b51', text: '#fbf7ec', sub: '#d9e6d6', accent: '#e8d29a', motif: '#ffffff' },
  violet: { from: '#2a1a45', to: '#5b3b7c', text: '#fbf7ec', sub: '#e2d6ee', accent: '#e8d29a', motif: '#ffffff' },
  white:  { from: '#fbf6ea', to: '#eadcc0', text: '#3a2d1a', sub: '#6e5b3e', accent: '#a8823a', motif: '#a8823a' },
  red:    { from: '#4a1313', to: '#8c2b2b', text: '#fbf7ec', sub: '#f1d9d0', accent: '#f0d49a', motif: '#ffffff' },
  rose:   { from: '#5b2c3d', to: '#a15a72', text: '#fdf6f2', sub: '#f4dce3', accent: '#f6dca6', motif: '#ffffff' },
};

// 필요한 글자만 담은 한글 글꼴을 Google Fonts 에서 받아 온다 (ttf)
async function loadFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!src) throw new Error(`글꼴을 불러오지 못했어요 (${family})`);
  return (await fetch(src[1])).arrayBuffer();
}

export async function renderMeditationCard(m: Meditation): Promise<ArrayBuffer> {
  const p = PALETTES[m.color] || PALETTES.green;
  const sentence = m.keySentence;
  const topLine = `오늘의 묵상 · ${m.dateLabel}`;
  const allText = `${topLine}${m.theme}${sentence}윤호요셉 신부“”·`;
  const [serifBold, serif, sans] = await Promise.all([
    loadFont('Noto Serif KR', 700, allText),
    loadFont('Noto Serif KR', 500, allText),
    loadFont('Noto Sans KR', 500, allText),
  ]);
  const motifSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="${p.motif}">${MOTIFS[m.motif] || MOTIFS.cross}</svg>`;
  const size = sentence.length > 30 ? 60 : sentence.length > 18 ? 70 : 80;

  const image = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: `linear-gradient(160deg, ${p.from} 0%, ${p.to} 100%)` }}>
        {/* 주제를 나타내는 큰 그림 (옅게) */}
        <img alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(motifSvg)}`} width={760} height={760} style={{ position: 'absolute', right: -120, bottom: -110, opacity: m.color === 'white' ? 0.16 : 0.12 }} />
        {/* 안쪽 테두리 */}
        <div style={{ position: 'absolute', top: 40, left: 40, right: 40, bottom: 40, border: `2px solid ${p.accent}`, opacity: 0.45, borderRadius: 28, display: 'flex' }} />
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '110px 110px 100px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontFamily: 'Sans', fontSize: 30, color: p.accent, letterSpacing: 4 }}>{topLine}</div>
            <div style={{ fontFamily: 'Serif', fontSize: 40, color: p.sub, marginTop: 22 }}>{m.theme}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontFamily: 'SerifBold', fontSize: 110, color: p.accent, lineHeight: 0.6, height: 60 }}>“</div>
            <div style={{ fontFamily: 'SerifBold', fontSize: size, color: p.text, lineHeight: 1.45, textAlign: 'center', maxWidth: 820, wordBreak: 'keep-all' }}>{sentence}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 90, height: 2, background: p.accent, marginBottom: 26 }} />
            <div style={{ fontFamily: 'Serif', fontSize: 38, color: p.text, letterSpacing: 6 }}>윤호요셉 신부</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: [
        { name: 'SerifBold', data: serifBold, weight: 700, style: 'normal' },
        { name: 'Serif', data: serif, weight: 500, style: 'normal' },
        { name: 'Sans', data: sans, weight: 500, style: 'normal' },
      ],
    },
  );
  return image.arrayBuffer();
}
