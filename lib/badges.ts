// 교우 뱃지 (관리자가 교우에게 달아 주는 뱃지 — 앱 안에서 한 활동을 기리는 것)
// 그림은 components/BadgeIcon.tsx 가 키마다 SVG 로 그린다. 표: supabase/member-badges.sql (member_badges)
// 새 뱃지를 더하려면 여기 한 줄 + BadgeIcon 의 EMBLEMS 에 그림 하나.
// 활동 뱃지는 그 활동 1등에게만 저절로(auto, 매일 아침 cron + 관리자 '지금 다시 계산'), 첫 열매만 관리자가 직접. 본인이 내 공간에서 숨길 수 있음(profiles.hide_badges, 기본은 보임)
// (2026-11-06 운영자: 단체 봉사자 뱃지보다 '공감 많이 받은 사람·건의 많이 한 사람' 같은 앱 활동 위주로, 그림은 바로 알아볼 수 있게)

export type BadgeGroup = 'love' | 'activity' | 'help' | 'honor';

export interface MemberBadgeDef {
  key: string;
  label: string;        // 이름 (짧게)
  desc: string;         // 무슨 뱃지인지 (받은 교우·보는 교우가 읽는 말)
  group: BadgeGroup;
  colors: [string, string]; // 안쪽 원 그라데이션 (위·아래)
  rim?: 'gold' | 'silver' | 'rose';
  stat?: StatKey;       // 달기 창에서 보여 줄 그 교우의 활동 숫자
  auto?: boolean;       // 활동 1등에게 저절로 달리는 뱃지 (refresh_auto_badges, 관리자가 직접 달지 않음)
}

export type StatKey = 'likes' | 'prays' | 'comments' | 'posts' | 'photos' | 'feedback' | 'bugs' | 'intentions' | 'lounge' | 'days';

export const BADGE_GROUPS: Record<BadgeGroup, string> = {
  love: '받은 마음',
  activity: '활동',
  help: '도움',
  honor: '기념',
};

export const MEMBER_BADGES: MemberBadgeDef[] = [
  // --- 받은 마음 ---
  { key: 'hearts', label: '공감왕', desc: '글에 공감(❤️)을 많이 받은 교우', group: 'love', colors: ['#f2748c', '#c8304f'], rim: 'gold', stat: 'likes', auto: true },
  { key: 'prayers', label: '기도의 손', desc: '글에 기도(🙏)를 많이 받은 교우', group: 'love', colors: ['#e9b94a', '#bf8220'], rim: 'gold', stat: 'prays', auto: true },
  { key: 'trophy', label: '인기 글', desc: '많은 교우가 함께한 인기 글을 쓴 교우', group: 'love', colors: ['#f0a23a', '#c9701a'], rim: 'gold', stat: 'likes', auto: true },
  // --- 활동 ---
  { key: 'talker', label: '소통왕', desc: '댓글로 교우들과 많이 이야기 나눈 교우', group: 'activity', colors: ['#5fa8e8', '#2b6fc0'], rim: 'gold', stat: 'comments', auto: true },
  { key: 'writer', label: '이야기꾼', desc: '신앙 이야기와 소식을 많이 올린 교우', group: 'activity', colors: ['#7c6cd9', '#4f3fa8'], rim: 'gold', stat: 'posts', auto: true },
  { key: 'photo', label: '사진작가', desc: '사진으로 성당과 일상을 많이 나눈 교우', group: 'activity', colors: ['#5c6b80', '#2f3a4c'], rim: 'gold', stat: 'photos', auto: true },
  { key: 'intention', label: '기도지향', desc: '오늘의 기도지향을 많이 올린 교우', group: 'activity', colors: ['#e07a3f', '#b24a1e'], rim: 'gold', stat: 'intentions', auto: true },
  { key: 'lounge', label: '사랑방 단골', desc: '모두의 사랑방에서 많이 이야기 나눈 교우', group: 'activity', colors: ['#c48a5a', '#8a5330'], rim: 'gold', stat: 'lounge', auto: true },
  { key: 'daily', label: '매일 출석', desc: '가톨릭그램에 꾸준히 매일 들르는 교우', group: 'activity', colors: ['#3fa86f', '#217a4a'], rim: 'gold', stat: 'days', auto: true },
  // --- 도움 ---
  { key: 'idea', label: '아이디어 천사', desc: '건의함에 좋은 의견을 많이 낸 교우', group: 'help', colors: ['#f5c242', '#d18f12'], rim: 'gold', stat: 'feedback', auto: true },
  { key: 'detective', label: '오류 탐정', desc: '오류를 찾아 알려 주어 앱을 좋게 만든 교우', group: 'help', colors: ['#6b7fd6', '#3a4cab'], rim: 'gold', stat: 'bugs', auto: true },
  // --- 기념 ---
  { key: 'firstfruit', label: '첫 열매', desc: '가톨릭그램의 처음을 함께한 교우', group: 'honor', colors: ['#7bbf5a', '#3f8a33'], rim: 'gold' },
];

export const badgeOf = (key: string): MemberBadgeDef | undefined => MEMBER_BADGES.find(b => b.key === key);

export const STAT_LABELS: Record<StatKey, string> = {
  likes: '받은 공감', prays: '받은 기도', comments: '쓴 댓글', posts: '쓴 글', photos: '사진 글', feedback: '건의', bugs: '오류 신고', intentions: '기도지향', lounge: '사랑방 대화', days: '들른 날',
};

export interface MemberBadgeRow { id: string; user_id: string; badge_key: string; note?: string | null; created_at: string }
