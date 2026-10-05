import { ImageResponse } from 'next/og';
import { MOTIFS } from '@/lib/meditation-motifs';
import type { Meditation, LiturgicalColor } from '@/lib/meditation';

// 오늘의 묵상 포토카드 (1080×1080 정사각형 PNG)
// 글은 최소한으로: 위에 작은 날짜, 가운데 주제를 함축한 단순한 선 그림, 아래 짧은 한 마디와 '윤호요셉 신부'

const PALETTES: Record<LiturgicalColor, { from: string; to: string; text: string; accent: string; line: string }> = {
  green:  { from: '#1e3b2d', to: '#2f5641', text: '#fbf7ec', accent: '#e3cd93', line: '#f3ead2' },
  violet: { from: '#2a1b44', to: '#44305f', text: '#fbf7ec', accent: '#e3cd93', line: '#efe6f3' },
  white:  { from: '#fbf7ee', to: '#f1e7d3', text: '#3a2d1a', accent: '#a8823a', line: '#7a5c2a' },
  red:    { from: '#481515', to: '#6e2222', text: '#fbf7ec', accent: '#ecd09a', line: '#f6e3d6' },
  rose:   { from: '#57303f', to: '#7d4659', text: '#fdf6f2', accent: '#f1d7a4', line: '#f8e6ea' },
};

// 필요한 글자만 담은 한글 글꼴을 Google Fonts 에서 받아 온다 (ttf)
async function loadFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!src) throw new Error(`글꼴을 불러오지 못했어요 (${family})`);
  return (await fetch(src[1])).arrayBuffer();
}

// 그림 색을 카드 색으로 바꾼다 (Claude 그림은 #000 선, 기본 그림은 채움)
const illustrationSrc = (m: Meditation, color: string) => {
  const svg = m.illustration
    ? m.illustration.replace(/#000000|#000\b|black/gi, color)
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="${color}">${MOTIFS[m.motif] || MOTIFS.cross}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export async function renderMeditationCard(m: Meditation): Promise<ArrayBuffer> {
  const p = PALETTES[m.color] || PALETTES.green;
  const topLine = `오늘의 묵상 · ${m.dateLabel}`;
  const allText = `${topLine}${m.keySentence}윤호요셉 신부`;
  const [serifBold, serif, sans] = await Promise.all([
    loadFont('Noto Serif KR', 700, allText),
    loadFont('Noto Serif KR', 500, allText),
    loadFont('Noto Sans KR', 400, allText),
  ]);
  const size = m.keySentence.length > 14 ? 54 : 62;

  const image = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '96px 100px 92px', background: `linear-gradient(170deg, ${p.from} 0%, ${p.to} 100%)` }}>
        <div style={{ fontFamily: 'Sans', fontSize: 26, color: p.accent, letterSpacing: 6 }}>{topLine}</div>
        {/* 주제를 담은 단순한 그림 */}
        <div style={{ display: 'flex', width: 520, height: 520, borderRadius: 260, alignItems: 'center', justifyContent: 'center', background: m.color === 'white' ? 'rgba(168,130,58,0.07)' : 'rgba(255,255,255,0.05)' }}>
          <img alt="" src={illustrationSrc(m, p.line)} width={400} height={400} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: 'SerifBold', fontSize: size, color: p.text, textAlign: 'center', lineHeight: 1.4, maxWidth: 820, wordBreak: 'keep-all' }}>{m.keySentence}</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 34 }}>
            <div style={{ width: 44, height: 2, background: p.accent }} />
            <div style={{ fontFamily: 'Serif', fontSize: 30, color: p.accent, letterSpacing: 6, margin: '0 22px' }}>윤호요셉 신부</div>
            <div style={{ width: 44, height: 2, background: p.accent }} />
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
        { name: 'Sans', data: sans, weight: 400, style: 'normal' },
      ],
    },
  );
  return image.arrayBuffer();
}
