// 채팅 이모티콘 (1:1 메시지·단체 채팅방·사랑방): 캐릭터 넷 × 24개 (public/stickers/<dir>/01~24.webp)
//  - 아멘이(양) · 몽글이(구름) · 딩동이(종) · 루(초)
// 메시지 글로는 '[아멘이] 안녕!' 처럼 보낸다 — 예전 앱·휴대폰 알림·대화 목록에서도 뜻이 보이고,
// 이 글과 똑같으면 말풍선 대신 이모티콘 그림으로 보여 준다. (처음 보낸 양 이모티콘 '[양 이모티콘] …'도 아멘이로 읽음)
export interface Sticker { id: string; pack: string; packName: string; label: string; src: string }
export interface StickerPack { id: string; name: string; stickers: Sticker[] }

const COMMON = [
  '안녕!', '좋은 아침!', '잘 자요', '고마워요',
  '좋아요!', '완전 공감', 'ㅋㅋㅋㅋ', '헉!',
  '최고예요!', '축하해요!', '힘내요!', '할 수 있어!',
  '미안해요', '괜찮아요', '토닥토닥', '속상해...',
  '잠깐만요', '확인했어요', '곧 도착!', '충전 중...',
  '보고 싶어', '기도할게요', '아멘!',
];
const PACK_DEFS: { id: string; name: string; dir: string; labels: string[]; legacy?: string }[] = [
  {
    id: 'amen', name: '아멘이', dir: 'sheep', legacy: '양 이모티콘',
    labels: [
      '안녕!', '좋은 아침!', '평안한 밤', '고마워요',
      '덕분이에요!', '마음 보낼게', '너무 좋아!', '축하해!',
      '할 수 있어!', '좋아요!', '맡겨 줘', 'ㅋㅋㅋㅋ',
      '속상해...', '토닥토닥', '충전 중...', '어...?',
      '미안해요', '기다릴게', '곧 도착!', '기도할게요',
      '기도 부탁해요', '아멘!', '평화를 빕니다', '미사 때 만나요',
    ],
  },
  { id: 'mong', name: '몽글이', dir: 'cloud', labels: [...COMMON, '평화를 빕니다'] },
  { id: 'ding', name: '딩동이', dir: 'bell', labels: [...COMMON, '미사 때 만나요'] },
  { id: 'roo', name: '루', dir: 'candle', labels: [...COMMON, '평화를 빕니다'] },
];

export const STICKER_PACKS: StickerPack[] = PACK_DEFS.map(p => ({
  id: p.id,
  name: p.name,
  stickers: p.labels.map((label, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { id: `${p.id}-${n}`, pack: p.id, packName: p.name, label, src: `/stickers/${p.dir}/${n}.webp` };
  }),
}));
export const STICKERS: Sticker[] = STICKER_PACKS.flatMap(p => p.stickers);

export const stickerText = (s: Sticker) => `[${s.packName}] ${s.label}`;
const BY_TEXT = new Map<string, Sticker>();
STICKERS.forEach(s => BY_TEXT.set(stickerText(s), s));
PACK_DEFS.forEach(p => {
  if (!p.legacy) return;
  STICKERS.filter(s => s.pack === p.id).forEach(s => BY_TEXT.set(`[${p.legacy}] ${s.label}`, s));
});
export const parseSticker = (content?: string | null): Sticker | null => (content ? BY_TEXT.get(content.trim()) ?? null : null);

// 글을 치면 비슷한 뜻의 이모티콘을 추천: 이모티콘 이름마다 떠올릴 만한 말 (띄어쓰기 없이 비교)
const KEYWORDS: Record<string, string[]> = {
  '안녕!': ['안녕', '하이', '반가', '방가', 'hi', 'hello'],
  '좋은 아침!': ['좋은아침', '굿모닝', '아침', '일어났', '기상'],
  '평안한 밤': ['잘자', '굿나잇', '좋은밤', '평안한밤', '자러', '잘게', '이만잘', '밤'],
  '잘 자요': ['잘자', '굿나잇', '좋은밤', '자러', '잘게', '이만잘', '밤'],
  '고마워요': ['고마', '고맙', '감사', '땡큐', 'thank'],
  '덕분이에요!': ['덕분', '감사'],
  '마음 보낼게': ['마음', '사랑', '하트', '응원'],
  '너무 좋아!': ['너무좋', '신나', '신난', '행복'],
  '좋아요!': ['좋아', '좋네', '좋다', '좋습', '굿', '오케이', 'ok'],
  '완전 공감': ['공감', '맞아', '맞네', '맞지', '그러게', '인정', '동감', '그렇지', '그쵸'],
  'ㅋㅋㅋㅋ': ['ㅋㅋ', 'ㅎㅎ', '웃겨', '웃기', '재밌', '재미있', '하하'],
  '헉!': ['헉', '헐', '깜짝', '놀라', '놀랐', '세상에'],
  '어...?': ['뭐지', '어리둥절', '모르겠', '헷갈', '뭐라고'],
  '최고예요!': ['최고', '짱', '대박', '멋지', '멋져', '멋있', '훌륭'],
  '축하해!': ['축하', '생일', '축일', '합격', '결혼', '졸업', '승진'],
  '축하해요!': ['축하', '생일', '축일', '합격', '결혼', '졸업', '승진'],
  '힘내요!': ['힘내', '화이팅', '파이팅', '응원', '힘들'],
  '할 수 있어!': ['할수있', '화이팅', '파이팅', '힘내', '응원'],
  '맡겨 줘': ['맡겨', '내가할', '내가해', '걱정마', '걱정말'],
  '미안해요': ['미안', '죄송', '쏘리', 'sorry'],
  '괜찮아요': ['괜찮', '걱정마', '걱정말', '문제없', '상관없'],
  '토닥토닥': ['토닥', '위로', '힘들', '괜찮아', '속상'],
  '속상해...': ['속상', '슬퍼', '슬프', '우울', '눈물', 'ㅠ', 'ㅜ', '서운'],
  '잠깐만요': ['잠깐', '잠시', '기다려'],
  '확인했어요': ['확인', '알겠', '알았', '네넵', '넵', '오케이'],
  '기다릴게': ['기다릴', '기다려', '천천히'],
  '곧 도착!': ['도착', '가는중', '가는길', '거의다', '출발', '가고있', '곧가', '금방가', '오는중', '오는길'],
  '충전 중...': ['충전', '피곤', '쉬는', '쉴게', '휴식', '지쳤', '지친', '졸려', '졸리'],
  '보고 싶어': ['보고싶', '그리워', '그립', '보고파'],
  '기도할게요': ['기도', '묵주', '은총', '주님', '하느님'],
  '기도 부탁해요': ['기도부탁', '기도해줘', '기도해주', '기도해달', '부탁'],
  '아멘!': ['아멘', '알렐루야', '주님', '하느님'],
  '평화를 빕니다': ['평화', '평안', '찬미'],
  '미사 때 만나요': ['미사', '성당', '주일', '만나'],
};

export const hasStickerSuggestion = (text: string) => suggestStickers(text, 1).length > 0;

// 친 글과 비슷한 이모티콘 (맞는 말이 많고 길수록 먼저, 같은 점수면 캐릭터 순서). 두 글자 미만이면 없음
export function suggestStickers(text: string, limit = 12): Sticker[] {
  const t = text.toLowerCase().replace(/\s+/g, '');
  if (t.length < 2) return [];
  const scored: { s: Sticker; score: number; i: number }[] = [];
  STICKERS.forEach((s, i) => {
    const score = (KEYWORDS[s.label] || []).reduce((sum, k) => (t.includes(k) ? sum + k.length : sum), 0);
    if (score > 0) scored.push({ s, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map(x => x.s);
}

// 추천 이모티콘을 고르면 그 뜻과 이어진 말(단어째)을 입력칸에서 지운다 (카카오톡처럼).
// 띄어쓰기를 빼고 맞춰 보므로 '좋은 아침이에요'의 '좋은아침'처럼 두 단어에 걸친 말도 함께 지움
export function stripStickerWords(text: string, s: Sticker): string {
  const keys = KEYWORDS[s.label] || [];
  const parts = text.split(/(\s+)/);
  const owner: number[] = []; // 띄어쓰기 없이 이은 글자 → 몇 번째 조각의 글자인지
  let joined = '';
  parts.forEach((p, i) => { if (!p.trim()) return; for (const ch of p.toLowerCase()) { joined += ch; owner.push(i); } });
  const kill = new Set<number>();
  for (const k of keys) {
    for (let at = joined.indexOf(k); at >= 0; at = joined.indexOf(k, at + 1)) {
      for (let c = at; c < at + k.length; c++) kill.add(owner[c]);
    }
  }
  if (kill.size === 0) return text;
  return parts.filter((_, i) => !kill.has(i)).join('').replace(/[ \t]{2,}/g, ' ').trim();
}
