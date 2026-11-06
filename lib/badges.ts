// 교우 뱃지 (관리자가 일반 신자에게 달아 주는 뱃지)
// 그림은 components/BadgeIcon.tsx 가 키마다 SVG 로 그린다. 표: supabase/member-badges.sql (member_badges)
// 새 뱃지를 더하려면 여기 한 줄 + BadgeIcon 의 EMBLEMS 에 그림 하나.

export type BadgeGroup = 'service' | 'community' | 'honor';

export interface MemberBadgeDef {
  key: string;
  label: string;        // 이름 (짧게)
  desc: string;         // 무슨 뱃지인지 (받은 교우·보는 교우가 읽는 말)
  group: BadgeGroup;
  colors: [string, string]; // 안쪽 원 그라데이션 (위·아래)
  rim?: 'gold' | 'silver' | 'rose';
}

export const BADGE_GROUPS: Record<BadgeGroup, string> = {
  service: '본당 봉사',
  community: '가톨릭그램 활동',
  honor: '기념',
};

export const MEMBER_BADGES: MemberBadgeDef[] = [
  // --- 본당 봉사 ---
  { key: 'volunteer', label: '봉사의 손', desc: '본당과 이웃을 위해 꾸준히 봉사하는 교우', group: 'service', colors: ['#f08c6a', '#c84f3a'], rim: 'gold' },
  { key: 'choir', label: '성가대', desc: '성가로 하느님을 찬미하는 교우', group: 'service', colors: ['#8b6cf0', '#5b3fc4'], rim: 'gold' },
  { key: 'catechist', label: '교리교사', desc: '아이들과 교우들에게 교리를 가르치는 교우', group: 'service', colors: ['#4c8fe0', '#2b5fb3'], rim: 'gold' },
  { key: 'liturgy', label: '전례 봉사', desc: '독서·해설·복사 등 전례를 섬기는 교우', group: 'service', colors: ['#e9b94a', '#c0862a'], rim: 'gold' },
  { key: 'legio', label: '레지오 마리애', desc: '성모님과 함께 기도하고 활동하는 레지오 단원', group: 'service', colors: ['#3f8f6a', '#246b4b'], rim: 'gold' },
  { key: 'youth', label: '청년회', desc: '본당 청년회에서 함께 걷는 교우', group: 'service', colors: ['#f0803f', '#d04a22'], rim: 'gold' },
  { key: 'leader', label: '구역·반 봉사', desc: '구역장·반장으로 이웃 교우를 돌보는 교우', group: 'service', colors: ['#5c8ad0', '#2f5a9c'], rim: 'gold' },
  // --- 가톨릭그램 활동 ---
  { key: 'prayer', label: '기도 동반자', desc: '교우들의 기도지향에 함께 기도하는 교우', group: 'community', colors: ['#7c6cd9', '#4f3fa8'], rim: 'gold' },
  { key: 'writer', label: '글벗', desc: '신앙 이야기와 소식을 정성껏 나누는 교우', group: 'community', colors: ['#5fa3a8', '#2f6f78'], rim: 'gold' },
  { key: 'peacemaker', label: '평화의 사도', desc: '따뜻한 댓글과 격려로 공동체를 밝히는 교우', group: 'community', colors: ['#6fb0e8', '#3878c0'], rim: 'gold' },
  // --- 기념 ---
  { key: 'firstfruit', label: '첫 열매', desc: '가톨릭그램의 처음을 함께한 교우', group: 'honor', colors: ['#7bbf5a', '#3f8a33'], rim: 'gold' },
  { key: 'newborn', label: '새 신자', desc: '새로 세례를 받은 교우 — 환영해요!', group: 'honor', colors: ['#62b7e6', '#2f7fb8'], rim: 'silver' },
];

export const badgeOf = (key: string): MemberBadgeDef | undefined => MEMBER_BADGES.find(b => b.key === key);

export interface MemberBadgeRow { id: string; user_id: string; badge_key: string; note?: string | null; created_at: string }
