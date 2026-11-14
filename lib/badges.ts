// 교우 뱃지 (관리자가 교우에게 달아 주는 뱃지 — 앱 안에서 한 활동을 기리는 것)
// 그림은 components/BadgeIcon.tsx 가 키마다 SVG 로 그린다. 표: supabase/member-badges.sql (member_badges)
// 새 뱃지를 더하려면 여기 한 줄 + BadgeIcon 의 EMBLEMS 에 그림 하나.
// 활동 뱃지는 그 활동 1등에게만 저절로(auto, 매일 아침 cron + 관리자 '지금 다시 계산', 관리자 계정은 뺌, 숫자 5 이상일 때만 — AUTO_BADGE_MIN), 첫 열매만 관리자가 직접. 본인이 내 공간에서 숨길 수 있음(profiles.hide_badges, 기본은 보임)
// (2026-11-06 운영자: 단체 봉사자 뱃지보다 '공감 많이 받은 사람·건의 많이 한 사람' 같은 앱 활동 위주로, 그림은 바로 알아볼 수 있게)

export type BadgeGroup = 'love' | 'giving' | 'activity' | 'help' | 'milestone' | 'honor';

export interface MemberBadgeDef {
  key: string;
  label: string;        // 이름 (짧게)
  desc: string;         // 무슨 뱃지인지 (받은 교우·보는 교우가 읽는 말)
  group: BadgeGroup;
  colors: [string, string]; // 안쪽 원 그라데이션 (위·아래)
  rim?: 'gold' | 'silver' | 'rose';
  stat?: StatKey;       // 달기 창에서 보여 줄 그 교우의 활동 숫자
  auto?: boolean;       // 활동 1등에게 저절로 달리는 뱃지 (refresh_auto_badges, 관리자가 직접 달지 않음)
  permanent?: boolean;  // 달성 도장: 기준(threshold)을 넘은 교우 모두에게 저절로, 한 번 받으면 떼지 않음 (1등이 아니어도)
  threshold?: number;   // 달성 도장의 기준 숫자 (stat 이 이 이상이면)
  tier?: number;        // 활동 등급 뱃지(1~7: 일반·고급·희귀·영웅·전설·신화·유일) — 메달 색이 등급, 아래 숫자 판
  family?: string;      // 등급 뱃지의 활동 (LADDERS id)
  retired?: boolean;    // 예전 뱃지 (받은 기록·도장 모음에만 보이고, 새로 달리지 않음)
}

export type StatKey = 'likes' | 'prays' | 'comments' | 'posts' | 'photos' | 'feedback' | 'bugs' | 'intentions' | 'lounge' | 'days'
  | 'likesGiven' | 'praysGiven' | 'commentLikes' | 'videos' | 'stories' | 'followers' | 'following' | 'dms' | 'groupMsgs' | 'anonReplies' | 'dawn' | 'night' | 'music'
  | 'replies' | 'reactions' | 'stickers' | 'sunday' | 'longform' | 'welcomes' | 'hashtags' | 'streak' | 'letters' | 'years';

export const BADGE_GROUPS: Record<BadgeGroup, string> = {
  love: '받은 마음',
  giving: '나눈 마음',
  activity: '활동',
  help: '도움',
  milestone: '활동 등급',
  honor: '기념',
};

export const MEMBER_BADGES: MemberBadgeDef[] = [
  // --- 받은 마음 ---
  { key: 'hearts', label: '공감왕', desc: '글에 공감(❤️)을 많이 받은 교우', group: 'love', colors: ['#f2748c', '#c8304f'], rim: 'gold', stat: 'likes', auto: true },
  { key: 'prayers', label: '기도의 손', desc: '글에 기도(🙏)를 많이 받은 교우', group: 'love', colors: ['#e9b94a', '#bf8220'], rim: 'gold', stat: 'prays', auto: true },
  { key: 'trophy', label: '인기 글', desc: '많은 교우가 함께한 인기 글을 쓴 교우', group: 'love', colors: ['#f0a23a', '#c9701a'], rim: 'gold', stat: 'likes', auto: true },
  { key: 'comment_loved', label: '댓글 인기', desc: '쓴 댓글에 공감·기도를 많이 받은 교우', group: 'love', colors: ['#e88aa8', '#b8456e'], rim: 'gold', stat: 'commentLikes', auto: true },
  { key: 'popular', label: '인기인', desc: '팔로워가 가장 많은 교우', group: 'love', colors: ['#f2b23a', '#c7791a'], rim: 'gold', stat: 'followers', auto: true },
  // --- 내가 준 마음 ---
  { key: 'cheer', label: '응원왕', desc: '교우들의 글에 공감(❤️)을 가장 많이 보낸 교우', group: 'giving', colors: ['#ef7f6a', '#c23f2e'], rim: 'gold', stat: 'likesGiven', auto: true },
  { key: 'intercessor', label: '함께 기도', desc: '교우들의 글과 기도지향에 기도(🙏)를 가장 많이 보탠 교우', group: 'giving', colors: ['#8e7bd8', '#5a44ad'], rim: 'gold', stat: 'praysGiven', auto: true },
  { key: 'comforter', label: '위로 천사', desc: '익명 고민상담에 위로의 답글을 가장 많이 남긴 교우', group: 'giving', colors: ['#6cc1d8', '#2f88a8'], rim: 'gold', stat: 'anonReplies', auto: true },
  { key: 'friendly', label: '마당발', desc: '교우들을 가장 많이 팔로우하며 이어진 교우', group: 'giving', colors: ['#5fb08a', '#2c7d5a'], rim: 'gold', stat: 'following', auto: true },
  // --- 활동 ---
  { key: 'talker', label: '소통왕', desc: '댓글로 교우들과 많이 이야기 나눈 교우', group: 'activity', colors: ['#5fa8e8', '#2b6fc0'], rim: 'gold', stat: 'comments', auto: true },
  { key: 'writer', label: '이야기꾼', desc: '신앙 이야기와 소식을 많이 올린 교우', group: 'activity', colors: ['#7c6cd9', '#4f3fa8'], rim: 'gold', stat: 'posts', auto: true },
  { key: 'photo', label: '사진작가', desc: '사진으로 성당과 일상을 많이 나눈 교우', group: 'activity', colors: ['#5c6b80', '#2f3a4c'], rim: 'gold', stat: 'photos', auto: true },
  { key: 'intention', label: '기도지향', desc: '오늘의 기도지향을 많이 올린 교우', group: 'activity', colors: ['#e07a3f', '#b24a1e'], rim: 'gold', stat: 'intentions', auto: true },
  { key: 'lounge', label: '사랑방 단골', desc: '모두의 사랑방에서 많이 이야기 나눈 교우', group: 'activity', colors: ['#c48a5a', '#8a5330'], rim: 'gold', stat: 'lounge', auto: true },
  { key: 'video', label: '영상 작가', desc: '영상을 가장 많이 올린 교우', group: 'activity', colors: ['#d85a7a', '#9e2f4e'], rim: 'gold', stat: 'videos', auto: true },
  { key: 'story', label: '스토리 작가', desc: '스토리를 가장 많이 올린 교우', group: 'activity', colors: ['#f08c4a', '#c45a1e'], rim: 'gold', stat: 'stories', auto: true },
  { key: 'dj', label: '음악 애호가', desc: '글에 배경음악을 가장 많이 넣은 교우', group: 'activity', colors: ['#7c6cd9', '#4f3fa8'], rim: 'gold', stat: 'music', auto: true },
  { key: 'messenger', label: '메시지왕', desc: '1:1 메시지를 가장 많이 보낸 교우', group: 'activity', colors: ['#4fa3e0', '#2466a8'], rim: 'gold', stat: 'dms', auto: true },
  { key: 'groupchat', label: '단체방 단골', desc: '단체 채팅방에서 가장 많이 이야기한 교우', group: 'activity', colors: ['#5f9f6a', '#2f6f3f'], rim: 'gold', stat: 'groupMsgs', auto: true },
  { key: 'earlybird', label: '새벽 기도', desc: '새벽(4~7시)에 글을 가장 많이 올린 교우', group: 'activity', colors: ['#f6b26b', '#d9772a'], rim: 'gold', stat: 'dawn', auto: true },
  { key: 'nightowl', label: '밤 기도', desc: '밤(22~3시)에 글을 가장 많이 올린 교우', group: 'activity', colors: ['#5c6bc0', '#2c3680'], rim: 'gold', stat: 'night', auto: true },
  { key: 'daily', label: '매일 출석', desc: '가톨릭그램에 꾸준히 매일 들르는 교우', group: 'activity', colors: ['#3fa86f', '#217a4a'], rim: 'gold', stat: 'days', auto: true },
  { key: 'streak', label: '연속 출석', desc: '하루도 빠지지 않고 가장 오래 연속으로 들른 교우', group: 'activity', colors: ['#f0783c', '#c2451c'], rim: 'gold', stat: 'streak', auto: true },
  { key: 'replier', label: '답글 요정', desc: '교우들의 댓글에 답글을 가장 많이 달아 준 교우', group: 'activity', colors: ['#56b3c9', '#2b7d93'], rim: 'gold', stat: 'replies', auto: true },
  { key: 'reactor', label: '리액션왕', desc: '대화·댓글에 ❤️🙏😊 감정 표시를 가장 많이 남긴 교우', group: 'giving', colors: ['#f29a4a', '#c86a1c'], rim: 'gold', stat: 'reactions', auto: true },
  { key: 'sticker', label: '이모티콘 애호가', desc: '대화에서 이모티콘을 가장 많이 보낸 교우', group: 'activity', colors: ['#e6a23c', '#b8761a'], rim: 'gold', stat: 'stickers', auto: true },
  { key: 'sunday', label: '주일 지킴이', desc: '주일(일요일)에 글을 가장 많이 올린 교우', group: 'activity', colors: ['#6c8ed6', '#3756a8'], rim: 'gold', stat: 'sunday', auto: true },
  { key: 'longform', label: '묵상가', desc: '긴 글(300자 이상)로 깊은 묵상을 가장 많이 나눈 교우', group: 'activity', colors: ['#8a6ad0', '#5a3ea0'], rim: 'gold', stat: 'longform', auto: true },
  { key: 'hashtag', label: '해시태그 장인', desc: '#해시태그를 붙인 글을 가장 많이 올린 교우', group: 'activity', colors: ['#4fb0a0', '#237a6c'], rim: 'gold', stat: 'hashtags', auto: true },
  { key: 'welcomer', label: '환영 천사', desc: '새로 온 교우(가입 2주 안)의 글에 댓글로 가장 많이 반겨 준 교우', group: 'giving', colors: ['#f0a0b4', '#c45a7a'], rim: 'gold', stat: 'welcomes', auto: true },
  { key: 'letter', label: '사연 작가', desc: '사연함에 사연을 가장 많이 보낸 교우', group: 'activity', colors: ['#e07a8a', '#a8405a'], rim: 'gold', stat: 'letters', auto: true },
  // --- 도움 ---
  { key: 'idea', label: '아이디어 천사', desc: '건의함에 좋은 의견을 많이 낸 교우', group: 'help', colors: ['#f5c242', '#d18f12'], rim: 'gold', stat: 'feedback', auto: true },
  { key: 'detective', label: '오류 탐정', desc: '오류를 찾아 알려 주어 앱을 좋게 만든 교우', group: 'help', colors: ['#6b7fd6', '#3a4cab'], rim: 'gold', stat: 'bugs', auto: true },
  // --- 달성 도장 (기준을 넘으면 누구나, 한 번 받으면 계속 남음 — 운영자 2026-11-06 '스탬프 모으듯') ---
  { key: 'm_posts10', retired: true, label: '글 10편', desc: '글을 10편 올렸어요', group: 'milestone', colors: ['#7c6cd9', '#4f3fa8'], rim: 'silver', stat: 'posts', auto: true, permanent: true, threshold: 10 },
  { key: 'm_posts50', retired: true, label: '글 50편', desc: '글을 50편 올렸어요', group: 'milestone', colors: ['#7c6cd9', '#4f3fa8'], rim: 'gold', stat: 'posts', auto: true, permanent: true, threshold: 50 },
  { key: 'm_comments100', retired: true, label: '댓글 100개', desc: '댓글을 100개 남겼어요', group: 'milestone', colors: ['#5fa8e8', '#2b6fc0'], rim: 'gold', stat: 'comments', auto: true, permanent: true, threshold: 100 },
  { key: 'm_hearts100', retired: true, label: '공감 100', desc: '글에 공감(❤️)을 100번 받았어요', group: 'milestone', colors: ['#f2748c', '#c8304f'], rim: 'gold', stat: 'likes', auto: true, permanent: true, threshold: 100 },
  { key: 'm_prays100', retired: true, label: '기도 100번', desc: '교우들의 글과 기도지향에 기도(🙏)를 100번 보탰어요', group: 'milestone', colors: ['#8e7bd8', '#5a44ad'], rim: 'gold', stat: 'praysGiven', auto: true, permanent: true, threshold: 100 },
  { key: 'm_days30', retired: true, label: '출석 30일', desc: '가톨릭그램에 30일 들렀어요', group: 'milestone', colors: ['#3fa86f', '#217a4a'], rim: 'silver', stat: 'days', auto: true, permanent: true, threshold: 30 },
  { key: 'm_days100', retired: true, label: '출석 100일', desc: '가톨릭그램에 100일 들렀어요', group: 'milestone', colors: ['#3fa86f', '#217a4a'], rim: 'gold', stat: 'days', auto: true, permanent: true, threshold: 100 },
  { key: 'm_streak7', retired: true, label: '7일 연속', desc: '일주일 동안 하루도 빠지지 않고 들렀어요', group: 'milestone', colors: ['#f0783c', '#c2451c'], rim: 'gold', stat: 'streak', auto: true, permanent: true, threshold: 7 },
  { key: 'm_year1', label: '함께 1년', desc: '가톨릭그램과 함께한 지 1년이 되었어요', group: 'milestone', colors: ['#d4a94a', '#9a6a13'], rim: 'gold', stat: 'years', auto: true, permanent: true, threshold: 1 },
  // --- 기념 ---
  // 테스터 명예 훈장: Play 테스트 앱으로 14일 출석을 모두 마친 테스터에게 저절로 (app/api/tester/attendance, 한 번 받으면 평생 — permanent)
  { key: 'tester14', label: '테스터 명예 훈장', desc: '가톨릭그램 초창기 테스터로 활약하며 정식 출시를 함께 연 교우 · Play 테스트 앱으로 14일 출석을 모두 마친 분께 드리는 명예 훈장이에요', group: 'honor', colors: ['#3e5a94', '#1c2b4f'], rim: 'gold' },
  { key: 'firstfruit', label: '첫 열매', desc: '가톨릭그램의 처음을 함께한 교우', group: 'honor', colors: ['#7bbf5a', '#3f8a33'], rim: 'gold' },
];

// --- 활동 등급 뱃지 (운영자 2026-11-14: '일반·고급·희귀·영웅·전설·신화·유일, 댓글 10·50·100 처럼 올라갈 때마다 등급이 올라가게') ---
// 활동마다 지금 닿은 가장 높은 등급 하나만 달린다(낮은 등급은 떼고, 받은 기록은 도장 모음에 남음). 숫자는 supabase/member-badges.sql 의 badge_ladder_steps 표와 같아야 함
// (2026-11-14 운영자: 한 달 만에 전설이 나와서 올리기 쉬운 활동(공감·기도·댓글·글)은 구간을 넓힘 — 숫자를 바꿀 땐 표만 고치고 badge-tiers-reset.sql 처럼 다시 계산)
// 그 활동 1등이면(champion 키) 그 등급 메달에 금 월계관 + 왕관 (BadgeIcon champion)
export const TIERS = [
  { name: '일반', colors: ['#c9ced6', '#7d858f', '#4d545d'], pill: ['#f3f4f6', '#d1d5db', '#374151'] },
  { name: '고급', colors: ['#8fe0a0', '#2f9a4b', '#155f2a'], pill: ['#effaf1', '#b6e6c1', '#155f2a'] },
  { name: '희귀', colors: ['#8cc3f7', '#2f73d0', '#163f85'], pill: ['#eef5fe', '#bcd8f7', '#163f85'] },
  { name: '영웅', colors: ['#ff9a8f', '#d8382f', '#7e130f'], pill: ['#fff1f0', '#fbc4bf', '#9e1f1a'] },
  { name: '전설', colors: ['#fff09a', '#f2c21b', '#a87a00'], pill: ['#fffbe6', '#f6e08a', '#7a5a00'] },
  { name: '신화', colors: ['#fff4c2', '#b8800f', '#5e3a00'], pill: ['#fdf3dc', '#d9a94a', '#6b4300'] },
  { name: '유일', colors: ['#ffd1f0', '#9b6cf0', '#1fb5c9'], pill: ['#f6f0ff', '#d6c4fb', '#5b3fb0'] },
] as const;
export const LADDERS: { id: string; short: string; unit: string; emblem: string; stat: StatKey; champion: string; what: string; steps: number[] }[] = [
  { id: 'comments', short: '댓글', unit: '개', emblem: 'talker', stat: 'comments', champion: 'talker', what: '댓글을', steps: [10, 50, 150, 400, 1000, 2500, 5000] },
  { id: 'hearts', short: '공감', unit: '', emblem: 'hearts', stat: 'likes', champion: 'hearts', what: '글에 공감(❤️)을', steps: [30, 100, 300, 1000, 3000, 7000, 15000] },
  { id: 'posts', short: '글', unit: '편', emblem: 'writer', stat: 'posts', champion: 'writer', what: '글을', steps: [3, 10, 30, 80, 200, 400, 800] },
  { id: 'days', short: '출석', unit: '일', emblem: 'daily', stat: 'days', champion: 'daily', what: '가톨릭그램에 들른 날이', steps: [7, 30, 60, 120, 200, 300, 365] },
  { id: 'streak', short: '연속', unit: '일', emblem: 'streak', stat: 'streak', champion: 'streak', what: '하루도 빠지지 않고 연속으로 들른 날이', steps: [7, 14, 30, 60, 100, 200, 365] },
  { id: 'prays', short: '기도', unit: '번', emblem: 'prayers', stat: 'praysGiven', champion: 'intercessor', what: '교우들의 글·기도지향에 기도(🙏)를', steps: [30, 100, 300, 1000, 3000, 7000, 15000] },
];
const fmtN = (n: number) => n.toLocaleString('en-US');
const LADDER_DEFS: MemberBadgeDef[] = LADDERS.flatMap(L => L.steps.map((n, i) => ({
  key: `t_${L.id}_${i + 1}`, label: `${L.short} ${fmtN(n)}${L.unit}`, desc: `${L.what} ${fmtN(n)}${L.unit || '번'} 넘었어요 · ${TIERS[i].name} 등급`,
  group: 'milestone' as BadgeGroup, colors: [TIERS[i].colors[0], TIERS[i].colors[1]] as [string, string], stat: L.stat, auto: true, permanent: true, threshold: n, tier: i + 1, family: L.id,
})));
MEMBER_BADGES.push(...LADDER_DEFS);
export const ladderOf = (id?: string) => LADDERS.find(l => l.id === id);
export const tierNum = (def: MemberBadgeDef) => (def.tier && ladderOf(def.family) ? fmtN(ladderOf(def.family)!.steps[def.tier - 1]) : '');
// 이름 옆·목록에 보일 차례: 1등 → 높은 등급 → 기념 → 나머지 (예전 뱃지는 맨 뒤)
export const badgeRank = (key: string) => {
  const d = badgeOf(key); if (!d) return 99;
  if (d.retired) return 90;
  if (d.auto && !d.permanent) return 0;
  if (d.tier) return 10 - d.tier;
  if (d.group === 'honor') return 20;
  return 30;
};
// 한 교우의 뱃지 → 보여 줄 것: 등급 뱃지와 같은 활동의 1등 뱃지가 함께 있으면 하나로(그 등급 메달 + 월계관)
export type ShownBadge = { key: string; champion: boolean; label: string };
export function shownBadges(keys: string[]): ShownBadge[] {
  const set = new Set(keys);
  const merged = new Set<string>();
  const out: ShownBadge[] = [];
  for (const k of keys) {
    const d = badgeOf(k); if (!d) continue;
    if (merged.has(k)) continue;
    if (d.tier) {
      const champ = ladderOf(d.family)?.champion;
      if (champ && set.has(champ)) { merged.add(champ); out.push({ key: k, champion: true, label: badgeOf(champ)?.label || d.label }); continue; }
      out.push({ key: k, champion: false, label: d.label }); continue;
    }
    if (d.auto && !d.permanent) {
      // 같은 활동의 등급 뱃지가 뒤에 있으면 그쪽이 월계관을 받음
      const L = LADDERS.find(l => l.champion === k);
      if (L && keys.some(x => badgeOf(x)?.family === L.id)) continue;
      out.push({ key: k, champion: true, label: d.label }); continue;
    }
    out.push({ key: k, champion: false, label: d.label });
  }
  return out;
}

export const AUTO_BADGE_MIN = 5; // 자동 뱃지 최소 기준 (supabase/member-badges.sql refresh_auto_badges 의 `bs.s < 5` 와 같아야 함)

export const badgeOf = (key: string): MemberBadgeDef | undefined => MEMBER_BADGES.find(b => b.key === key);

export const STAT_LABELS: Record<StatKey, string> = {
  likes: '받은 공감', prays: '받은 기도', commentLikes: '댓글에 받은 공감', followers: '팔로워', likesGiven: '보낸 공감', praysGiven: '보낸 기도', anonReplies: '고민 답글', following: '팔로잉',
  comments: '쓴 댓글', posts: '쓴 글', photos: '사진 글', videos: '영상', stories: '스토리', music: '음악 넣은 글', dms: '보낸 메시지', groupMsgs: '단체방 대화', dawn: '새벽 글', night: '밤 글', intentions: '기도지향', lounge: '사랑방 대화', days: '들른 날', feedback: '건의', bugs: '오류 신고',
  replies: '답글', reactions: '감정 표시', stickers: '보낸 이모티콘', sunday: '주일 글', longform: '긴 글', welcomes: '새 교우 환영 댓글', hashtags: '해시태그 글', streak: '최장 연속 출석', letters: '사연', years: '함께한 햇수',
};

// 받은 기록(도장): 뱃지를 받을 때마다 한 줄 (member_badges 에서 떼어져도 남음 — supabase/member-badges.sql badge_stamps)
export interface BadgeStamp { id: string; user_id: string; badge_key: string; earned_at: string; auto?: boolean; note?: string | null }

export interface MemberBadgeRow { id: string; user_id: string; badge_key: string; note?: string | null; created_at: string }
