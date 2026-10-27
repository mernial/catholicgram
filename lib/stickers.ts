// 채팅 이모티콘 (1:1 메시지·단체 채팅방·사랑방): 양 이모티콘 24개 (public/stickers/sheep/01~24.webp)
// 메시지 글로는 '[양 이모티콘] 안녕!' 처럼 보낸다 — 예전 앱·휴대폰 알림·대화 목록에서도 뜻이 보이고,
// 이 글과 똑같으면 말풍선 대신 이모티콘 그림으로 보여 준다.
export interface Sticker { id: string; label: string; src: string }

export const STICKER_PACK = '양 이모티콘';
const LABELS = [
  '안녕!', '좋은 아침!', '평안한 밤', '고마워요',
  '덕분이에요!', '마음 보낼게', '너무 좋아!', '축하해!',
  '할 수 있어!', '좋아요!', '맡겨 줘', 'ㅋㅋㅋㅋ',
  '속상해...', '토닥토닥', '충전 중...', '어...?',
  '미안해요', '기다릴게', '곧 도착!', '기도할게요',
  '기도 부탁해요', '아멘!', '평화를 빕니다', '미사 때 만나요',
];
export const STICKERS: Sticker[] = LABELS.map((label, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: `sheep-${n}`, label, src: `/stickers/sheep/${n}.webp` };
});

export const stickerText = (s: Sticker) => `[${STICKER_PACK}] ${s.label}`;
const BY_TEXT = new Map(STICKERS.map(s => [stickerText(s), s]));
export const parseSticker = (content?: string | null): Sticker | null => (content ? BY_TEXT.get(content.trim()) ?? null : null);
