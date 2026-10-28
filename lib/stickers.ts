// 채팅 이모티콘 (1:1 메시지·단체 채팅방·사랑방): 캐릭터마다 24개 (public/stickers/<dir>/01~24.webp)
//  - 아멘이(양) · 몽글이(구름) · 딩동이(종) · 루(초) · 신부님(관리자 전용) · 루비로사(루비로사 선물) · 엘리스텔라·양양세라피나(각자 선물)
// 메시지 글로는 '[아멘이] 안녕!' 처럼 보낸다 — 예전 앱·휴대폰 알림·대화 목록에서도 뜻이 보이고,
// 이 글과 똑같으면 말풍선 대신 이모티콘 그림으로 보여 준다. (처음 보낸 양 이모티콘 '[양 이모티콘] …'도 아멘이로 읽음)
// 전용 이모티콘: access 'admin' = 관리자만, 'gift' = giftHandles(@아이디)나 선물받은 교우만(sticker_grants) 고르고 보낼 수 있다.
// 받은 사람에게는 누구나 그림으로 보인다 (고르기·추천에서만 가림)
export interface Sticker { id: string; pack: string; packName: string; label: string; src: string }
export type PackAccess = 'admin' | 'gift';
export interface StickerPack { id: string; name: string; stickers: Sticker[]; access?: PackAccess; giftHandles?: string[] }

const COMMON = [
  '안녕!', '좋은 아침!', '잘 자요', '고마워요',
  '좋아요!', '완전 공감', 'ㅋㅋㅋㅋ', '헉!',
  '최고예요!', '축하해요!', '힘내요!', '할 수 있어!',
  '미안해요', '괜찮아요', '토닥토닥', '속상해...',
  '잠깐만요', '확인했어요', '곧 도착!', '충전 중...',
  '보고 싶어', '기도할게요', '아멘!',
];
// 사람 캐릭터 전용 이모티콘 (신부님·루비로사): 같은 24가지 말
const PERSON = [
  '안녕하세요!', '좋아요!', '사랑합니다', '기도합니다', '주님과 함께', '화이팅!',
  '감사합니다', '어?!', 'ㅋㅋㅋ', '좋다~', '와!', '죄송합니다',
  '아휴...', '음...', '맛있어요!', '커피 한잔 할까요?', '잘자요', '다녀올게요!',
  '열일중...', '너무 바빠요!', '감동이에요...', '주님 도와주세요', '어떻게 할까요?', '축하합니다!',
];
// 엘리스텔라·양양세라피나 전용 이모티콘의 24가지 말 (운영자가 준 판 순서대로, 두 판이 같은 말)
const GREETINGS = [
  '안녕하세요!', '감사합니다', '사랑합니다', '좋아요!', '응원해요', '파이팅!',
  '어??', 'ㅎㅎㅎ', '좋은 하루 되세요', '기도할게요', '말씀 안에서', '잘 자요',
  '죄송합니다', '고마워요', '음...', '열심히 할게요', '주님, 함께해 주세요', '반가워요!',
  '수고했어요', '축하해요', '최고예요!', '사랑해요', '항상 평화가 함께하기를', '또 만나요~',
];
const PACK_DEFS: { id: string; name: string; dir: string; labels: string[]; legacy?: string; access?: PackAccess; giftHandles?: string[] }[] = [
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
  { id: 'father', name: '신부님', dir: 'priest', labels: PERSON, access: 'admin' },              // 관리자 전용
  { id: 'ruby', name: '루비로사', dir: 'ruby', labels: PERSON, access: 'gift', giftHandles: ['rubyrosa'] }, // 루비로사 선물
  // 엘리스텔라 선물: @아이디 'elisabeth stella oh' (사연함 화면에서 확인, 띄어쓰기·_·. 은 빼고 비교)
  { id: 'stella', name: '엘리스텔라', dir: 'stella', labels: GREETINGS, access: 'gift', giftHandles: ['elisabeth stella oh'] },
  // 양양세라피나 선물: @아이디를 알면 giftHandles 에, 모르면 관리자가 프로필 카드·사연함의 '🎁'로 선물(sticker_grants)
  { id: 'serafina', name: '양양세라피나', dir: 'serafina', labels: GREETINGS, access: 'gift', giftHandles: [] },
];

export const STICKER_PACKS: StickerPack[] = PACK_DEFS.map(p => ({
  id: p.id,
  name: p.name,
  access: p.access,
  giftHandles: p.giftHandles,
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

// 누가 어떤 이모티콘을 쓸 수 있는지 (앱이 로그인 정보로 채움: setStickerAccess)
type Access = { admin: boolean; handle: string | null; grants: string[] };
let access: Access = { admin: false, handle: null, grants: [] };
const accessListeners = new Set<() => void>();
export function setStickerAccess(next: Partial<Access>) {
  const merged = { ...access, ...next };
  if (merged.admin === access.admin && merged.handle === access.handle && merged.grants.join() === access.grants.join()) return;
  access = merged;
  accessListeners.forEach(f => f());
}
// 코드에 적은 선물(giftHandles)의 @아이디 비교: 대소문자·띄어쓰기·_·.·- 는 따지지 않음
const handleKey = (h: string) => h.toLowerCase().replace(/[\s._\-@]/g, '');
export const isGiftHandle = (p: StickerPack, handle?: string | null) =>
  !!handle && (p.giftHandles || []).some(h => handleKey(h) === handleKey(handle));
export const onStickerAccess = (f: () => void) => { accessListeners.add(f); return () => { accessListeners.delete(f); }; };
export function canUsePack(p: StickerPack | undefined) {
  if (!p) return false;
  if (!p.access) return true;
  if (access.grants.includes(p.id)) return true;
  if (p.access === 'admin') return access.admin;
  return isGiftHandle(p, access.handle);
}
const PACK_BY_ID = new Map(STICKER_PACKS.map(p => [p.id, p]));
export const canUseSticker = (s: Sticker) => canUsePack(PACK_BY_ID.get(s.pack));
export const usablePacks = () => STICKER_PACKS.filter(canUsePack);
// 선물할 수 있는 이모티콘 (전용 이모티콘)
export const giftablePacks = () => STICKER_PACKS.filter(p => !!p.access);

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
  // 신부님·루비로사
  '안녕하세요!': ['안녕', '반가', '방가', '하이'],
  '사랑합니다': ['사랑', '하트', '좋아해'],
  '기도합니다': ['기도', '묵주', '은총'],
  '주님과 함께': ['주님', '하느님', '함께'],
  '화이팅!': ['화이팅', '파이팅', '힘내', '응원'],
  '감사합니다': ['감사', '고마', '고맙', '땡큐'],
  '어?!': ['어?', '뭐지', '어리둥절', '헐'],
  'ㅋㅋㅋ': ['ㅋㅋ', 'ㅎㅎ', '웃겨', '웃기', '재밌', '재미있'],
  '좋다~': ['좋다', '좋네', '행복'],
  '와!': ['와!', '우와', '대박'],
  '죄송합니다': ['죄송', '미안', '쏘리'],
  '아휴...': ['아휴', '에휴', '한숨', '힘들'],
  '음...': ['음...', '글쎄', '흠'],
  '맛있어요!': ['맛있', '맛나', '밥', '식사', '먹었'],
  '커피 한잔 할까요?': ['커피', '차한잔', '카페'],
  '잘자요': ['잘자', '굿나잇', '좋은밤', '자러', '잘게'],
  '다녀올게요!': ['다녀올', '다녀오', '갔다올', '나갈게', '출발'],
  '열일중...': ['열일', '일하', '일중', '업무', '회의', '작업'],
  '너무 바빠요!': ['바빠', '바쁘', '정신없'],
  '감동이에요...': ['감동', '울컥', '눈물'],
  '주님 도와주세요': ['도와주', '살려', '기도부탁'],
  '어떻게 할까요?': ['어떻게', '어쩌', '어떡'],
  '축하합니다!': ['축하', '생일', '축일', '합격', '결혼', '졸업'],
  // 엘리스텔라·양양세라피나
  '응원해요': ['응원', '힘내', '화이팅', '파이팅'],
  '파이팅!': ['파이팅', '화이팅', '힘내', '할수있'],
  '어??': ['어?', '뭐지', '어리둥절', '헐'],
  'ㅎㅎㅎ': ['ㅎㅎ', 'ㅋㅋ', '웃겨', '웃기', '재밌', '재미있', '하하'],
  '좋은 하루 되세요': ['좋은하루', '좋은아침', '굿모닝', '하루', '오늘도'],
  '말씀 안에서': ['말씀', '성경', '복음', '묵상'],
  '열심히 할게요': ['열심히', '노력', '최선', '해볼게', '할게요'],
  '주님, 함께해 주세요': ['주님', '함께해', '도와주', '하느님'],
  '반가워요!': ['반가', '방가', '오랜만', '안녕'],
  '수고했어요': ['수고', '고생', '애썼', '애쓰'],
  '축하해요': ['축하', '생일', '축일', '합격', '결혼', '졸업', '승진'],
  '사랑해요': ['사랑', '하트', '좋아해'],
  '항상 평화가 함께하기를': ['평화', '평안', '찬미'],
  '또 만나요~': ['또만나', '다음에', '나중에', '안녕히', '바이', '빠이'],
};

export const hasStickerSuggestion = (text: string) => suggestStickers(text, 1).length > 0;

// 추천은 지금 치고 있는 말에만 맞춘다: 마지막 낱말 (두 낱말에 걸친 말 '좋은 아침'은 바로 앞 낱말까지 이어 봄).
// 맞는 말이 마지막 낱말에 걸쳐 있어야 함 → 추천이 뜬 뒤 고르지 않고 다른 말을 이어 치면 그 추천은 사라지고
// 새로 친 낱말에 맞는 추천이 뜬다 (예: '위로' → 토닥토닥, 이어서 '해 드리고 싶어요' → 사라짐)
function tailMatches(text: string, keys: string[]) {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || '';
  const prev = words[words.length - 2] || '';
  const joined = prev + last;
  const hits: { at: number; len: number }[] = [];
  for (const k of keys) {
    for (let at = joined.indexOf(k); at >= 0; at = joined.indexOf(k, at + 1)) {
      if (at + k.length > prev.length) hits.push({ at, len: k.length }); // 마지막 낱말에 걸친 것만
    }
  }
  return { hits, prevLen: prev.length, joined };
}

// 친 글과 비슷한 이모티콘 (맞는 말이 많고 길수록 먼저, 같은 점수면 캐릭터 순서). 두 글자 미만이면 없음
export function suggestStickers(text: string, limit = 12): Sticker[] {
  if (text.replace(/\s+/g, '').length < 2) return [];
  const scored: { s: Sticker; score: number; i: number }[] = [];
  STICKERS.forEach((s, i) => {
    if (!canUseSticker(s)) return; // 전용 이모티콘은 쓸 수 있는 사람에게만 추천
    const score = tailMatches(text, KEYWORDS[s.label] || []).hits.reduce((sum, h) => sum + h.len, 0);
    if (score > 0) scored.push({ s, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map(x => x.s);
}

// 추천을 띄운 마지막 낱말(두 낱말에 걸친 말이면 앞 낱말까지)을 뺀 글.
// 빈 글이 되면 낱말 하나만 쳐서 뜬 추천 → 고를 때 입력칸을 비운다 (문장을 쓰는 중이면 글은 그대로, StickerAbove)
export function stripStickerWords(text: string, s: Sticker): string {
  const parts = text.split(/(\s+)/);
  const wordIdx = parts.map((p, i) => (p.trim() ? i : -1)).filter(i => i >= 0);
  const lastIdx = wordIdx[wordIdx.length - 1], prevIdx = wordIdx[wordIdx.length - 2];
  if (lastIdx === undefined) return text;
  const { hits, prevLen } = tailMatches(text, KEYWORDS[s.label] || []);
  const kill = new Set<number>();
  for (const h of hits) {
    if (h.at < prevLen && prevIdx !== undefined) kill.add(prevIdx); // 앞 낱말에 걸친 말 ('좋은 아침')
    kill.add(lastIdx);
  }
  if (kill.size === 0) return text;
  return parts.filter((_, i) => !kill.has(i)).join('').replace(/[ \t]{2,}/g, ' ').trim();
}

// 게시글의 이모티콘: 글 끝에 이모티콘 글('[아멘이] 아멘!')을 한 줄씩 붙여 저장하고(SQL 필요 없음),
// 보여 줄 때는 그 줄들을 꺼내 그림으로 — 예전 앱에서는 그 줄이 글로 보임
export const MAX_POST_STICKERS = 5;
export function splitPostStickers(content?: string | null): { text: string; stickers: Sticker[] } {
  const stickers: Sticker[] = [];
  const lines: string[] = [];
  for (const line of (content || '').split('\n')) {
    const s = parseSticker(line);
    if (s) stickers.push(s); else lines.push(line);
  }
  return { text: lines.join('\n').replace(/\s+$/, ''), stickers };
}
export const joinPostStickers = (text: string, stickers: Sticker[]) =>
  [text.replace(/\s+$/, ''), ...stickers.map(stickerText)].filter(Boolean).join('\n');
// 글만 (목록·미리 보기·공유용): 이모티콘 줄은 빼고, 글이 없으면 '이모티콘'
export const postPlainText = (content?: string | null) => {
  const { text, stickers } = splitPostStickers(content);
  return text || (stickers.length ? `이모티콘 ${stickers.map(s => s.label).join(' ')}` : '');
};
