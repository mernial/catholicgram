// 게시물 배경음악
// posts.music 에 다음 형식으로 저장한다.
//   'yt:<영상ID>', 'yt:<영상ID>@<시작초>', 'yt:<영상ID>@<시작초>+<구간초>' → 유튜브
//   'bgm:<트랙ID>', 'bgm:<트랙ID>@<시작초>+<구간초>'  → 앱 배경음악 목록 (bgm_tracks, 저작권 걱정 없는 곡)

export interface BgmTrack {
  id: string; title: string; artist?: string | null; url: string; active?: boolean; sort?: number;
  private?: boolean;                // 관리자 보관 음악 (선물용, supabase/profile-music.sql)
  created_at?: string;
  content_hash?: string | null;     // 중복 찾기 지문 (supabase/bgm-dedupe.sql, lib/audio-dedupe.ts)
  audio_print?: string | null;
  // CC0·CC BY 곡 (lib/music-cc.ts): 분위기·출처 표시(CC BY 는 꼭 보여야 함)·철
  mood?: MusicMood;
  feel?: string;                    // 곡을 고른 세션이 붙인 분위기 말 (예: '고요한 묵상')
  credit?: string;
  season?: 'christmas';
}

// 음악 고르기의 분위기 나누기 (CC0·CC BY 곡에 붙어 있음, 운영자가 올린 곡은 '전체'에만)
export type MusicMood = 'calm' | 'hopeful' | 'tender' | 'joyful' | 'solemn';
export const MUSIC_MOODS: { key: MusicMood; label: string }[] = [
  { key: 'calm', label: '고요' },
  { key: 'hopeful', label: '희망' },
  { key: 'tender', label: '위로' },
  { key: 'joyful', label: '기쁨' },
  { key: 'solemn', label: '장엄·성가' },
];

// 대림·성탄 시기(대림 첫 주일 ~ 1월 13일쯤, 한국 시간)에는 성탄 곡을 목록 맨 위에, 아닐 때는 맨 아래에
export function isChristmasSeason(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600e3);
  const y = k.getUTCFullYear(), m = k.getUTCMonth() + 1, d = k.getUTCDate();
  if (m === 1) return d <= 13;
  if (m !== 11 && m !== 12) return false;
  // 대림 첫 주일 = 성탄 전 넷째 주일 (11월 27일 ~ 12월 3일 사이의 일요일)
  const xmasDow = new Date(Date.UTC(y, 11, 25)).getUTCDay();
  const advent = new Date(Date.UTC(y, 11, 25 - (xmasDow === 0 ? 7 : xmasDow) - 21));
  const today = Date.UTC(y, m - 1, d);
  return today >= advent.getTime();
}
export const bySeason = (tracks: BgmTrack[], now = new Date()) => {
  const inSeason = isChristmasSeason(now);
  const xmas = tracks.filter(t => t.season === 'christmas');
  const rest = tracks.filter(t => t.season !== 'christmas');
  return inSeason ? [...xmas, ...rest] : [...rest, ...xmas];
};

export type PostMusic =
  | { kind: 'youtube'; videoId: string; start: number; clip?: number }
  | { kind: 'bgm'; trackId: string; start: number; clip?: number };

// 유튜브 음악은 2026-11-01 부터 새로 넣을 수 없음 — 예전 글의 'yt:' 음악을 읽어 재생하는 데만 씀
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

// 게시물 음악 고르기의 '가톨릭그램 음악' (public/bgm). 운영자가 직접 만든 곡 (2026-10-29 운영자 요청으로 예전 곡을 모두 빼고 이 곡들로). 새 곡은 관리자가 '게시글 음악 추가·관리'(BgmAdmin)에서 파일로 올림 → bgm_tracks.
// 파일은 운영자가 준 mp3 그대로(다시 압축하지 않음), 이름 등 꼬리표만 지움.
// 같은 제목의 곡은 고르기 목록에 하나만 (운영자: '같은 음악이 올라가 있는데 같은 건 지워줘').
// 곡 줄은 그대로 있어 그 곡을 쓴 게시글은 그대로 나옴 — 실제 정리는 관리자 음악 창(components/BgmAdmin)이 함.
// prefer: 지금 고른 곡처럼 꼭 보여야 하는 곡 (같은 제목 무리에서 그 곡을 남김)
export const normTrackTitle = (t: string) => t.replace(/\s+/g, '').toLowerCase();
export function uniqueTitles(tracks: BgmTrack[], prefer?: string | null): BgmTrack[] {
  const pick = new Map<string, BgmTrack>();
  for (const t of tracks) {
    const k = normTrackTitle(t.title);
    if (!k) continue;
    if (!pick.has(k) || t.id === prefer) pick.set(k, t);
  }
  return tracks.filter(t => !normTrackTitle(t.title) || pick.get(normTrackTitle(t.title)) === t);
}

export const BUILTIN_BGM: BgmTrack[] = [
  { id: 'builtin-calm-piano', title: '잔잔한 피아노', artist: '가톨릭그램', url: '/bgm/calm-piano.mp3' },
  { id: 'builtin-new-beginning', title: '새로운 시작', artist: '가톨릭그램', url: '/bgm/new-beginning.mp3' },
];

// 예전 기본 배경음악: 고르기 목록에서는 뺐지만(active: false) 이 곡을 쓴 예전 게시물은 그대로 나오게 남겨 둔다.
// 모두 공유 저작물(저작권이 끝난 곡: 그루버·바흐·파헬벨·제네바 시편가·뉴브리튼 곡조·베토벤·사티·영국 민요·드보르자크)이나
// 직접 만든 곡을 scripts/bgm-synth.py 로 새로 연주·녹음한 것
export const RETIRED_BGM: BgmTrack[] = [
  { id: 'builtin-silent-night', title: '고요한 밤 (오르골)', artist: '그루버 곡 · 가톨릭그램 연주', url: '/bgm/silent-night.mp3', active: false },
  { id: 'builtin-bach-prelude', title: '바흐 전주곡 C장조 (아베 마리아 반주)', artist: '바흐 곡 · 가톨릭그램 연주', url: '/bgm/bach-prelude.mp3', active: false },
  { id: 'builtin-canon', title: '캐논 (잔잔한 피아노)', artist: '파헬벨 곡 · 가톨릭그램 연주', url: '/bgm/canon.mp3', active: false },
  { id: 'builtin-hymn-organ', title: '성가 오르간 (시편 100편 곡조)', artist: '제네바 시편가 · 가톨릭그램 연주', url: '/bgm/hymn-organ.mp3', active: false },
  { id: 'builtin-quiet-prayer', title: '고요한 기도 (은은한 화음)', artist: '가톨릭그램', url: '/bgm/quiet-prayer.mp3', active: false },
  { id: 'builtin-amazing-grace', title: '나 같은 죄인 살리신 (Amazing Grace)', artist: '뉴브리튼 곡조 · 가톨릭그램 연주', url: '/bgm/amazing-grace.mp3', active: false },
  { id: 'builtin-ode-to-joy', title: '환희의 송가 (오르간)', artist: '베토벤 곡 · 가톨릭그램 연주', url: '/bgm/ode-to-joy.mp3', active: false },
  { id: 'builtin-dawn-harp', title: '새벽 묵상 (하프)', artist: '가톨릭그램', url: '/bgm/dawn-harp.mp3', active: false },
  { id: 'builtin-morning-piano', title: '성당의 아침 (피아노)', artist: '가톨릭그램', url: '/bgm/morning-piano.mp3', active: false },
  { id: 'builtin-candle-strings', title: '촛불 (현악)', artist: '가톨릭그램', url: '/bgm/candle-strings.mp3', active: false },
  { id: 'builtin-gymnopedie', title: '짐노페디 1번 (피아노)', artist: '사티 곡 · 가톨릭그램 연주', url: '/bgm/gymnopedie.mp3', active: false },
  { id: 'builtin-fur-elise', title: '엘리제를 위하여 (피아노)', artist: '베토벤 곡 · 가톨릭그램 연주', url: '/bgm/fur-elise.mp3', active: false },
  { id: 'builtin-peace-guitar', title: '평화의 강 (기타)', artist: '가톨릭그램', url: '/bgm/peace-guitar.mp3', active: false },
  { id: 'builtin-christmas-bells', title: '성탄 종소리 (벨)', artist: '가톨릭그램', url: '/bgm/christmas-bells.mp3', active: false },
  { id: 'builtin-rosary-musicbox', title: '묵주 기도 (오르골)', artist: '가톨릭그램', url: '/bgm/rosary-musicbox.mp3', active: false },
  { id: 'builtin-greensleeves', title: '그린슬리브스 (기타)', artist: '영국 민요 · 가톨릭그램 연주', url: '/bgm/greensleeves.mp3', active: false },
  { id: 'builtin-going-home', title: '꿈속의 고향 (현악)', artist: '드보르자크 곡 · 가톨릭그램 연주', url: '/bgm/going-home.mp3', active: false },
  { id: 'builtin-spring-marimba', title: '봄날의 산책 (마림바)', artist: '가톨릭그램', url: '/bgm/spring-marimba.mp3', active: false },
  { id: 'builtin-mary-cello', title: '성모의 노래 (첼로)', artist: '가톨릭그램', url: '/bgm/mary-cello.mp3', active: false },
  { id: 'builtin-evening-prayer', title: '저녁 기도 (피아노)', artist: '가톨릭그램', url: '/bgm/evening-prayer.mp3', active: false },
  { id: 'builtin-minuet', title: '미뉴에트 G장조 (바흐)', artist: '가톨릭그램', url: '/bgm/minuet.mp3', active: false },
  { id: 'builtin-westminster-bells', title: '성당 종소리', artist: '가톨릭그램', url: '/bgm/westminster-bells.mp3', active: false },
  { id: 'builtin-grace-rain', title: '은총의 비 (피아노)', artist: '가톨릭그램', url: '/bgm/grace-rain.mp3', active: false },
  { id: 'builtin-forest-flute', title: '평화의 숲 (플루트)', artist: '가톨릭그램', url: '/bgm/forest-flute.mp3', active: false },
  { id: 'builtin-organ-meditation', title: '오르간 묵상', artist: '가톨릭그램', url: '/bgm/organ-meditation.mp3', active: false },
  { id: 'builtin-kpop-festival', title: '빛의 축제 (케이팝 댄스)', artist: '가톨릭그램', url: '/bgm/kpop-festival.mp3', active: false },
  { id: 'builtin-kpop-walk', title: '함께 걷는 길 (밝은 팝)', artist: '가톨릭그램', url: '/bgm/kpop-walk.mp3', active: false },
  { id: 'builtin-citypop-dawn', title: '새벽 도시 (시티팝)', artist: '가톨릭그램', url: '/bgm/citypop-dawn.mp3', active: false },
  { id: 'builtin-future-sky', title: '하늘 위로 (퓨처베이스)', artist: '가톨릭그램', url: '/bgm/future-sky.mp3', active: false },
  { id: 'builtin-tropical-joy', title: '기쁨의 리듬 (트로피컬 팝)', artist: '가톨릭그램', url: '/bgm/tropical-joy.mp3', active: false },
];

export const CLIP_SECONDS = 30;  // 고를 수 있는 가장 긴 구간
export const DEFAULT_CLIP = 15;  // 처음 고를 때 구간 길이

export const encodeBgm = (trackId: string, start = 0, clip?: number) =>
  `bgm:${trackId}${start > 0 || clip ? `@${start}` : ''}${clip ? `+${clip}` : ''}`;

export const parsePostMusic = (value?: string | null): PostMusic | null => {
  if (!value) return null;
  if (value.startsWith('yt:')) {
    const [videoId, range = ''] = value.slice(3).split('@');
    const [start, clip] = range.split('+');
    return YT_ID.test(videoId) ? { kind: 'youtube', videoId, start: Number(start) || 0, clip: Number(clip) || undefined } : null;
  }
  if (value.startsWith('bgm:')) {
    const [trackId, range = ''] = value.slice(4).split('@');
    const [start, clip] = range.split('+');
    return { kind: 'bgm', trackId, start: Number(start) || 0, clip: Number(clip) || undefined };
  }
  return null;
};
