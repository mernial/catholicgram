import Anthropic from '@anthropic-ai/sdk';
import { MOTIF_NAMES, type Motif } from '@/lib/meditation-motifs';

// 매일 묵상글 만들기 (Claude)
// 1) 웹 검색으로 그날 매일미사 독서·복음을 찾아 요약 (본문을 그대로 옮기지 않음)
// 2) 그 내용을 바탕으로 주제·묵상글(1500자 내외)·핵심 문장·해시태그·카드 색과 그림을 정함

const MODEL = 'claude-opus-5-5';
// 거절(안전 분류) 시 서버가 알맞은 모델로 다시 시도하도록 (fallbacks: 'default')
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type LiturgicalColor = 'green' | 'violet' | 'white' | 'red' | 'rose';

export interface Meditation {
  dateLabel: string;        // 예: 10월 6일 화요일
  liturgicalDay: string;    // 예: 연중 제27주간 화요일
  readings: string;         // 예: 제1독서 갈라 1,13-24 · 복음 루카 10,38-42
  theme: string;            // 오늘의 주제
  meditation: string;       // 본문
  keySentence: string;      // 카드에 넣을 핵심 문장
  hashtags: string[];
  color: LiturgicalColor;
  motif: Motif;             // 그림을 못 그렸을 때 쓰는 기본 그림
  illustration: string;     // 주제를 담은 단순한 선 그림 (SVG)
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('\n').trim();

const ensureNotRefused = (res: Anthropic.Beta.BetaMessage) => {
  if (res.stop_reason === 'refusal') throw new Error(`묵상글을 만들지 못했어요 (거절: ${res.stop_details?.category ?? '알 수 없음'})`);
};

// 1단계: 그날 매일미사 독서·복음 찾기
async function findReadings(client: Anthropic, isoDate: string, dateLabel: string) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content:
      `${isoDate} (${dateLabel}) 한국 천주교 「매일미사」의 전례일 이름, 전례색, 제1독서·화답송·제2독서(있으면)·복음의 성경 장절과 각 내용을 찾아 주세요.\n` +
      '한국천주교주교회의(cbck.or.kr), 굿뉴스(maria.catholic.or.kr) 같은 가톨릭 공식 자료를 우선 확인해 주세요.\n' +
      '결과는 다음 형식으로 짧게 정리해 주세요. 성경 본문을 길게 옮겨 적지 말고, 각 독서는 3~4문장으로 요약하고 복음의 핵심 구절만 한 문장 인용해 주세요.\n' +
      '전례일: ...\n전례색: (녹색/자색/백색/홍색/장미색)\n제1독서: 장절 - 요약\n화답송: 장절 - 후렴\n제2독서: (있으면) 장절 - 요약\n복음: 장절 - 요약\n복음 핵심 구절: ...',
  }];
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
      ],
      messages,
    });
    ensureNotRefused(res);
    if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
    const text = textOf(res.content);
    if (!text) throw new Error('매일미사 독서를 찾지 못했어요');
    return text;
  }
  throw new Error('매일미사 독서를 찾는 데 너무 오래 걸렸어요');
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['liturgicalDay', 'readings', 'theme', 'meditation', 'keySentence', 'hashtags', 'color', 'motif', 'illustration'],
  properties: {
    liturgicalDay: { type: 'string', description: '전례일 이름 (예: 연중 제27주간 화요일)' },
    readings: { type: 'string', description: '독서·복음 장절을 한 줄로 (예: 제1독서 갈라 1,13-24 · 복음 루카 10,38-42)' },
    theme: { type: 'string', description: '오늘의 주제, 20자 이내' },
    meditation: { type: 'string', description: '묵상글 본문, 1400~1600자' },
    keySentence: { type: 'string', description: '포토카드에 넣을 아주 짧은 핵심 문장, 20자 이내' },
    hashtags: { type: 'array', items: { type: 'string' }, description: '해시태그 6~8개, # 없이' },
    color: { type: 'string', enum: ['green', 'violet', 'white', 'red', 'rose'], description: '전례색' },
    motif: { type: 'string', enum: MOTIF_NAMES, description: '그림이 안 될 때 쓸 기본 그림' },
    illustration: { type: 'string', description: '주제를 함축하는 단순한 선 그림 SVG 코드 전체' },
  },
} as const;

// 2단계: 묵상글 쓰기
async function writeMeditation(client: Anthropic, isoDate: string, dateLabel: string, readings: string) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA as unknown as { [key: string]: unknown } } },
    system:
      '당신은 한국 천주교 수원교구의 윤호 요셉 신부입니다. 가톨릭 신자 커뮤니티 앱 「가톨릭그램」에 매일 「오늘의 묵상」을 올립니다.\n' +
      '읽는 분들은 주로 50~70대 교우들입니다. 따뜻하고 차분한 존댓말로, 어려운 신학 용어보다 일상의 예와 함께 쉽게 풀어 써 주세요.\n' +
      '한국 천주교 표기(하느님, 예수님, 성모님, 미사, 성체, 묵주기도 등)를 지켜 주세요.\n' +
      '성경 본문은 길게 옮기지 말고 꼭 필요한 짧은 구절만 인용해 주세요. 교회 가르침에 어긋나는 내용이나 특정 인물·단체를 비판하는 내용은 쓰지 마세요.',
    messages: [{
      role: 'user',
      content:
        `${isoDate} (${dateLabel}) 매일미사 독서와 복음 정리입니다.\n\n${readings}\n\n` +
        '이 말씀을 묵상하여 하나의 주제를 정하고 다음을 만들어 주세요.\n' +
        '- theme: 오늘의 주제 (20자 이내, 마음에 남는 짧은 말)\n' +
        '- meditation: 1500자 내외(1400~1600자)의 묵상글. 말씀의 핵심 → 오늘 우리 삶에 비추어 보기 → 오늘 하루 실천할 작은 다짐 → 짧은 기도로 마무리. 문단 사이는 빈 줄 하나. 제목·해시태그·날짜는 넣지 마세요.\n' +
        '- keySentence: 포토카드에 넣을 아주 짧은 핵심 문장 (20자 이내, 한두 마디, 따옴표 없이)\n' +
        '- hashtags: 관련 해시태그 6~8개 (# 없이, 띄어쓰기 없이. 예: 오늘의묵상, 매일미사, 복음묵상 + 주제 관련)\n' +
        '- color: 그날 전례색, motif: 주제에 어울리는 기본 그림\n' +
        '- illustration: 오늘 주제를 함축적으로 표현하는 아주 단순한 선 그림(SVG). 예: 열린 문, 등불, 씨앗과 새싹, 빈 의자, 두 손, 길과 발자국, 그물, 빵과 잔 등.\n' +
        '  규칙: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"> 로 시작. 요소 4~14개(path, line, circle, ellipse, rect, polyline)만 사용.\n' +
        '  모든 요소는 fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round". 글자·그라데이션·이미지·사람 얼굴 묘사 금지. 여백을 넉넉히 두고 가운데에 배치.',
    }],
  });
  ensureNotRefused(res);
  const parsed = JSON.parse(textOf(res.content)) as Omit<Meditation, 'dateLabel'>;
  if (!MOTIF_NAMES.includes(parsed.motif)) parsed.motif = 'cross';
  parsed.illustration = safeIllustration(parsed.illustration);
  return parsed;
}

// 그림 SVG 검사: 허용된 선 그림만 남기고, 이상하면 빈 문자열(기본 그림 사용)
function safeIllustration(svg: string): string {
  const s = (svg || '').trim();
  if (!s.startsWith('<svg') || !s.endsWith('</svg>') || s.length > 12000) return '';
  if (/<(script|image|text|foreignObject|use|a|style|iframe)\b|href=|on[a-z]+=|url\(/i.test(s)) return '';
  const tags = s.match(/<([a-z]+)/gi) || [];
  const allowed = new Set(['svg', 'g', 'path', 'line', 'circle', 'ellipse', 'rect', 'polyline', 'polygon']);
  if (tags.some(t => !allowed.has(t.slice(1).toLowerCase())) || tags.length > 40) return '';
  return s;
}

export async function createMeditation(isoDate: string, dateLabel: string): Promise<Meditation> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY (Vercel 환경 변수)
  const readings = await findReadings(client, isoDate, dateLabel);
  const m = await writeMeditation(client, isoDate, dateLabel, readings);
  return {
    ...m,
    dateLabel,
    theme: m.theme.trim().slice(0, 30),
    keySentence: m.keySentence.trim().replace(/^["“'‘]|["”'’]$/g, '').slice(0, 30),
    hashtags: Array.from(new Set(['오늘의묵상', '매일미사', ...m.hashtags.map(t => t.replace(/[#\s]/g, ''))].filter(Boolean))).slice(0, 10),
  };
}

// 게시글 본문
export const meditationPostText = (m: Meditation) =>
  `[오늘의 묵상] ${m.theme}\n` +
  `${m.dateLabel} · ${m.liturgicalDay}\n${m.readings}\n\n` +
  `${m.meditation.trim()}\n\n` +
  `윤호 요셉 신부\n\n` +
  m.hashtags.map(t => `#${t}`).join(' ');
