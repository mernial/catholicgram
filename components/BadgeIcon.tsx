'use client';

import { useId, type ReactNode } from 'react';
import { MEMBER_BADGES, badgeOf, type MemberBadgeDef } from '@/lib/badges';

// --- 메달 모양 뱃지 그림 ---
// 금테(물결 테두리) + 색 원판 + 흰 문양. 작게(13px)도 크게(96px)도 또렷하게 보이도록 SVG 로 그린다.
// 교우 뱃지(BadgeIcon)와 성직자·수도자 인증 뱃지(RoleBadge)가 같은 메달(Medal)을 쓴다.

const RIMS = {
  gold: ['#fff2c4', '#e2b94e', '#9a6a13', '#f6d98a'],
  silver: ['#ffffff', '#d7dde6', '#7c8795', '#eef1f5'],
  rose: ['#ffe3ea', '#e8a2b4', '#9d4f66', '#f7c9d4'],
};

// 물결 테두리 (메달 가장자리 24개 봉우리)
const scallop = (r = 30, bump = 1.5, n = 24) => {
  const pts: string[] = [];
  const steps = n * 6;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rr = r + bump * Math.cos(n * t);
    pts.push(`${(32 + rr * Math.cos(t)).toFixed(2)} ${(32 + rr * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
};
const SCALLOP = scallop();

export function Medal({ colors, rim = 'gold', size = 40, title, className = '', children }: {
  colors: [string, string]; rim?: 'gold' | 'silver' | 'rose'; size?: number | string; title?: string; className?: string; children?: ReactNode;
}) {
  const id = `bd${useId().replace(/[^\w-]/g, '')}`;
  const [r0, r1, r2, r3] = RIMS[rim];
  const px = typeof size === 'number' ? `${size}px` : size;
  return (
    <svg viewBox="0 0 64 64" width={px} height={px} className={`shrink-0 ${className}`} role="img" aria-label={title} style={{ width: px, height: px }}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={r0} /><stop offset="0.45" stopColor={r1} /><stop offset="0.62" stopColor={r2} /><stop offset="1" stopColor={r3} />
        </linearGradient>
        <linearGradient id={`${id}-rim2`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={r3} /><stop offset="0.5" stopColor={r1} /><stop offset="1" stopColor={r0} />
        </linearGradient>
        <radialGradient id={`${id}-disc`} cx="0.35" cy="0.28" r="0.85">
          <stop offset="0" stopColor={colors[0]} /><stop offset="1" stopColor={colors[1]} />
        </radialGradient>
        <radialGradient id={`${id}-shine`} cx="0.3" cy="0.2" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.7" floodColor="#000" floodOpacity="0.35" />
        </filter>
        <clipPath id={`${id}-clip`}><circle cx="32" cy="32" r="24.5" /></clipPath>
      </defs>
      {/* 바깥 그림자 → 금테 → 테 안쪽 가는 선 → 색 원판 → 광택 → 문양 */}
      <circle cx="32" cy="32.8" r="30.5" fill="#000" fillOpacity="0.18" />
      <path d={SCALLOP} fill={`url(#${id}-rim)`} />
      <circle cx="32" cy="32" r="27.2" fill="none" stroke={`url(#${id}-rim2)`} strokeWidth="1.6" />
      <circle cx="32" cy="32" r="25.6" fill={r2} fillOpacity="0.55" />
      <circle cx="32" cy="32" r="24.5" fill={`url(#${id}-disc)`} />
      <circle cx="32" cy="32" r="24.5" fill={`url(#${id}-shine)`} />
      <circle cx="32" cy="32" r="23.6" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="0.9" />
      <g clipPath={`url(#${id}-clip)`} filter={`url(#${id}-sh)`} fill="#fff" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(32 32)">{children}</g>
      </g>
    </svg>
  );
}

// 문양 (가운데 0,0 기준, 반지름 24 안에 그린다) — 한눈에 알아보이는 그림으로
const EMBLEMS: Record<string, ReactNode> = {
  // 공감왕: 큰 하트 (오른쪽 위 반짝)
  hearts: (
    <g>
      <path strokeWidth="0" d="M0 13C-11.5 5.2-14-5.2-7.4-9-3.6-11.2-.8-9 0-6.8.8-9 3.6-11.2 7.4-9 14-5.2 11.5 5.2 0 13Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.14" d="M0 13C-11.5 5.2-14-5.2-7.4-9c2.2-1.3 4.1-1.1 5.6-.1C-8.2-5.6-9.4 3.6 0 10.6Z" />
      <path fill="none" strokeWidth="1.6" strokeOpacity="0.9" d="M11.5-14v5M9-11.5h5" />
    </g>
  ),
  // 기도의 손: 앱의 기도 단추와 같은 모은 두 손 (components/Icon pray, 256 → 34)
  prayers: (
    <g transform="translate(-17 -17) scale(0.1328)">
      <path fillRule="evenodd" strokeWidth="0" d="M235.32,180l-36.24-36.25L162.62,23.46A21.76,21.76,0,0,0,128,12.93,21.76,21.76,0,0,0,93.38,23.46L56.92,143.76,20.68,180a16,16,0,0,0,0,22.62l32.69,32.69a16,16,0,0,0,22.63,0L124.28,187a40.68,40.68,0,0,0,3.72-4.29,40.68,40.68,0,0,0,3.72,4.29L180,235.32a16,16,0,0,0,22.63,0l32.69-32.69A16,16,0,0,0,235.32,180ZM122.50,24.00 L122.50,178.00 L133.50,178.00 L133.50,24.00ZM46.11,164.89 L91.11,209.89 L98.89,202.11 L53.89,157.11ZM202.11,157.11 L157.11,202.11 L164.89,209.89 L209.89,164.89Z" />
    </g>
  ),
  // 인기 글: 트로피
  trophy: (
    <g>
      <path strokeWidth="0" d="M-9-14h18v7c0 5.5-3.6 9.5-9 9.5s-9-4-9-9.5Z" />
      <path fill="none" strokeWidth="2.4" d="M-9-11h-4.5c-.6 4.8 1.8 7.8 5.5 8.6M9-11h4.5c.6 4.8-1.8 7.8-5.5 8.6" />
      <path strokeWidth="0" d="M-2.2 2.5h4.4v4.5h-4.4Z" />
      <path strokeWidth="0" d="M-7.5 7h15c0 2.2-1.2 3.5-3.2 3.5h-8.6c-2 0-3.2-1.3-3.2-3.5Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.2" d="M0-14h9v7c0 5.5-3.6 9.5-9 9.5Z" />
      <path fill="none" strokeWidth="1.8" strokeOpacity="0.9" d="M-5.2-10.5v6" />
    </g>
  ),
  // 소통왕: 말풍선 둘
  talker: (
    <g>
      <path strokeWidth="0" d="M-13.5-11h15.5c2 0 3.5 1.5 3.5 3.5v7.5c0 2-1.5 3.5-3.5 3.5h-7.3l-4.2 4v-4h-4c-2 0-3.5-1.5-3.5-3.5V-7.5c0-2 1.5-3.5 3.5-3.5Z" />
      <path strokeWidth="1.6" stroke="#fff" fillOpacity="0.75" d="M13.5-2.5H-2c-2 0-3.5 1.5-3.5 3.5v7.5c0 2 1.5 3.5 3.5 3.5h7.3l4.2 4v-4h4c2 0 3.5-1.5 3.5-3.5V1c0-2-1.5-3.5-3.5-3.5Z" />
      <circle cx="-8.5" cy="-3.5" r="1.4" fill="#000" fillOpacity="0.35" strokeWidth="0" /><circle cx="-4" cy="-3.5" r="1.4" fill="#000" fillOpacity="0.35" strokeWidth="0" />
    </g>
  ),
  // 이야기꾼: 연필 + 종이
  writer: (
    <g>
      <path strokeWidth="0" fillOpacity="0.55" d="M-13-12h16l5 5v18h-21Z" />
      <path strokeWidth="0" d="M12.5-9.5l3 3L2 7l-4.2 1.2L-1 4Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.3" d="M-1 4l1.2 1.2L-2.2 8.2Z" />
      <path fill="none" strokeWidth="1.4" strokeOpacity="0.5" stroke="#000" d="M-9-5h7M-9-1h5M-9 3h3" />
    </g>
  ),
  // 사진작가: 카메라
  photo: (
    <g>
      <path strokeWidth="0" d="M-14.5-6h6l2.5-4h12l2.5 4h6v16h-29Z" />
      <circle r="5.8" cy="2" fill="#000" fillOpacity="0.4" strokeWidth="0" />
      <circle r="3.6" cy="2" strokeWidth="0" />
      <circle cx="-1.3" cy="0.6" r="1" fill="#000" fillOpacity="0.25" strokeWidth="0" />
      <circle cx="10.5" cy="-2.5" r="1.3" fill="#000" fillOpacity="0.35" strokeWidth="0" />
    </g>
  ),
  // 기도지향: 촛불
  intention: (
    <g>
      <path strokeWidth="0" d="M0-15.5c-4.2 4.8-5.6 8.2-3.6 10.8 1 1.3 2.3 2 3.6 2s2.6-.7 3.6-2c2-2.6.6-6-3.6-10.8Z" />
      <path strokeWidth="0" fillOpacity="0.45" d="M0-9.5c-1.6 2.2-2.1 3.8-1.3 5 .3.5.8.8 1.3.8s1-.3 1.3-.8c.8-1.2.3-2.8-1.3-5Z" fill="#000" />
      <rect x="-4" y="-1" width="8" height="12" rx="1.6" strokeWidth="0" />
      <path strokeWidth="0" d="M-9 11.4h18c0 1.9-1 3-2.8 3H-6.2c-1.8 0-2.8-1.1-2.8-3Z" />
    </g>
  ),
  // 사랑방 단골: 찻잔 + 김
  lounge: (
    <g>
      <path strokeWidth="0" d="M-12 -1h19v7c0 4.4-3.6 8-8 8h-3c-4.4 0-8-3.6-8-8Z" />
      <path fill="none" strokeWidth="2.4" d="M7-1h4c2.5 0 4 1.6 4 4s-1.5 4-4 4H7" />
      <path strokeWidth="0" d="M-13.5 15h22c0 1.6-1 2.5-2.5 2.5h-17c-1.5 0-2.5-.9-2.5-2.5Z" />
      <path fill="none" strokeWidth="1.8" strokeOpacity="0.9" d="M-6.5-13c-1.5 2-1.5 3.5 0 5.5M-1.5-14.5c-1.5 2-1.5 3.5 0 5.5M3.5-13c-1.5 2-1.5 3.5 0 5.5" />
    </g>
  ),
  // 매일 출석: 달력 + 체크
  daily: (
    <g>
      <rect x="-12.5" y="-10" width="25" height="23" rx="3" strokeWidth="0" />
      <rect x="-12.5" y="-10" width="25" height="6.5" rx="3" fill="#000" fillOpacity="0.32" strokeWidth="0" />
      <path fill="none" strokeWidth="2.4" d="M-6.5-14.5v6M6.5-14.5v6" />
      <path fill="none" strokeWidth="3" stroke={'#000'} strokeOpacity="0.45" d="M-6 3.5l4 4 8.5-8.5" />
    </g>
  ),
  // 아이디어 천사: 전구
  idea: (
    <g>
      <path strokeWidth="0" d="M0-15c-6.1 0-10.5 4.4-10.5 10 0 3.7 2 6.2 4 8.3 1 1.1 1.6 2.3 1.8 3.7h9.4c.2-1.4.8-2.6 1.8-3.7 2-2.1 4-4.6 4-8.3 0-5.6-4.4-10-10.5-10Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.32" d="M-4.7 9.5h9.4v2.2c0 1.4-1 2.3-2.4 2.3h-4.6c-1.4 0-2.4-.9-2.4-2.3Z" />
      <path fill="none" strokeWidth="1.6" strokeOpacity="0.9" d="M-14.5-5h3M11.5-5h3M-10-13l2 2M10-13l-2 2" />
      <path fill="none" strokeWidth="1.5" strokeOpacity="0.45" stroke="#000" d="M-2.5 7c-.2-3.5-1.5-5.5-3.5-7.5M2.5 7c.2-3.5 1.5-5.5 3.5-7.5" />
    </g>
  ),
  // 오류 탐정: 돋보기 (안에 작은 벌레 점)
  detective: (
    <g>
      <circle cx="-3" cy="-3" r="9.5" fill="none" strokeWidth="3.2" />
      <path fill="none" strokeWidth="4" d="M4 4l8.5 8.5" />
      <circle cx="-3" cy="-3" r="7.4" fill="#000" fillOpacity="0.18" strokeWidth="0" />
      <ellipse cx="-3" cy="-2.5" rx="2.6" ry="3.4" strokeWidth="0" />
      <path fill="none" strokeWidth="1.3" d="M-6.5-5l-2-1.5M.5-5l2-1.5M-6.8-1h-2.2M.8-1h2.2M-6.5 2l-2 1.5M.5 2l2 1.5" />
    </g>
  ),
  // 첫 열매: 새싹
  firstfruit: (
    <g>
      <path fill="none" strokeWidth="2.4" d="M0 14V-2" />
      <path strokeWidth="0" d="M0-2C-1.8-9.3-6.8-12.5-13.5-12.2c.9 6.5 5 10.6 13.5 10.2Z" />
      <path strokeWidth="0" d="M0 5C1.6-1.6 6.3-4.8 12.8-4.5c-.7 6.2-4.7 10.2-12.8 9.5Z" />
      <path fill="none" strokeWidth="1.2" strokeOpacity="0.5" stroke="#000" d="M-10-9.5C-6-7-3-4.5-.8-2.3M10-2.5C6.5-.5 3.5 1.8 1.2 4.5" />
      <path fill="none" strokeWidth="2" d="M-7 15.5h14" />
    </g>
  ),
};

export function BadgeIcon({ badge, size = 40, className = '' }: { badge: MemberBadgeDef | string; size?: number | string; className?: string }) {
  const def = typeof badge === 'string' ? badgeOf(badge) : badge;
  if (!def) return null;
  return <Medal colors={def.colors} rim={def.rim} size={size} title={`${def.label} 뱃지`} className={className}>{EMBLEMS[def.key]}</Medal>;
}

// 성직자·수도자 인증 뱃지 문양 (RoleBadge)
export const CLERGY_ART: Record<string, { colors: [string, string]; rim: 'gold' | 'silver'; emblem: ReactNode }> = {
  bishop: { colors: ['#9b6fd6', '#5c2f9e'], rim: 'gold', emblem: (
    <g>
      <path fill="none" strokeWidth="3" d="M0-15.5v29M-5-9.5h10M-8.5-3.5h17" />
    </g>
  ) },
  priest: { colors: ['#e4b955', '#a86f1a'], rim: 'gold', emblem: (
    <g>
      <path fill="none" strokeWidth="3.2" d="M0-15v29M-9-6h18" />
      <circle r="2.2" strokeWidth="0" fill="#000" fillOpacity="0.3" />
    </g>
  ) },
  deacon: { colors: ['#e0a94e', '#9c5f18'], rim: 'gold', emblem: (
    <g>
      <path fill="none" strokeWidth="3" d="M0-15v29M-9-6h18" />
      <path fill="none" strokeWidth="2.6" strokeOpacity="0.95" d="M-13-11 11 13" />
    </g>
  ) },
  sister: { colors: ['#63a9e6', '#2b6fb3'], rim: 'gold', emblem: (
    <g>
      <path fill="none" strokeWidth="3" d="M0-14.5v28M-8.5-5.5h17" />
      <circle r="12.5" fill="none" strokeWidth="1.4" strokeOpacity="0.75" />
    </g>
  ) },
  brother: { colors: ['#5d9fd8', '#2a62a4'], rim: 'gold', emblem: (
    <g>
      <path fill="none" strokeWidth="3.2" d="M0-11v25M-11-11h22" />
      <path fill="none" strokeWidth="1.4" strokeOpacity="0.75" d="M-11-11c0-2 1.5-3.5 3.5-3.5M11-11c0-2-1.5-3.5-3.5-3.5" />
    </g>
  ) },
  seminarian: { colors: ['#9aa5b4', '#5c6673'], rim: 'silver', emblem: (
    <g>
      <path strokeWidth="1.2" d="M-13-3C-9-5.3-4-5.1-.4-2.7V11.3C-4 8.9-9 8.7-13 11Z" />
      <path strokeWidth="1.2" d="M13-3C9-5.3 4-5.1.4-2.7V11.3C4 8.9 9 8.7 13 11Z" />
      <path fill="none" strokeWidth="2.6" d="M0-14.5v8M-3.5-11.5h7" />
    </g>
  ) },
};

// 뱃지 목록 (관리자 고르기·소개 창에서)
export const ALL_BADGES = MEMBER_BADGES;
