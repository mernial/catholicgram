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

// 문양 (가운데 0,0 기준, 반지름 24 안에 그린다)
const EMBLEMS: Record<string, ReactNode> = {
  volunteer: (
    <g>
      <path strokeWidth="0" d="M0 7.5C-8.2 1.4-9.4-6.6-4.6-8.5-1.9-9.5-.4-7.6 0-6.4.4-7.6 1.9-9.5 4.6-8.5 9.4-6.6 8.2 1.4 0 7.5Z" />
      <path fill="none" strokeWidth="2.3" d="M-12.5 3.5C-12.5 10.5-6.5 14.5 0 14.5S12.5 10.5 12.5 3.5" />
      <path fill="none" strokeWidth="2.3" d="M-12.5 3.5l-2.5-3M12.5 3.5l2.5-3" />
    </g>
  ),
  choir: (
    <g>
      <ellipse cx="-7" cy="9" rx="4.4" ry="3.2" transform="rotate(-18 -7 9)" strokeWidth="0" />
      <ellipse cx="6" cy="6.5" rx="4.4" ry="3.2" transform="rotate(-18 6 6.5)" strokeWidth="0" />
      <path fill="none" strokeWidth="2.4" d="M-3.4 8.2V-9.5M9.6 5.7V-12" />
      <path strokeWidth="0" d="M-3.4-9.5 9.6-12v5.2L-3.4-4.3Z" />
      <path fill="none" strokeWidth="1.6" strokeOpacity="0.8" d="M-14-3.5c-1.5 3.5-1.5 7 0 10.5M14.5-7c1.5 3.5 1.5 7 0 10.5" />
    </g>
  ),
  catechist: (
    <g>
      <path strokeWidth="1.2" d="M-13-3.5C-9-5.8-4-5.6-.4-3.2V10.8C-4 8.4-9 8.2-13 10.5Z" />
      <path strokeWidth="1.2" d="M13-3.5C9-5.8 4-5.6.4-3.2V10.8C4 8.4 9 8.2 13 10.5Z" />
      <path fill="none" strokeWidth="1.4" strokeOpacity="0.55" stroke={'#000'} d="M-9.5 0.5c2.6-.9 5-.9 7.2 0M-9.5 4.2c2.6-.9 5-.9 7.2 0M2.3 0.5c2.6-.9 5-.9 7.2 0M2.3 4.2c2.6-.9 5-.9 7.2 0" />
      <path fill="none" strokeWidth="2.6" d="M0-14.5v8M-3.5-11.5h7" />
    </g>
  ),
  liturgy: (
    <g>
      <path strokeWidth="0" d="M0-15.5c-4.2 4.8-5.6 8.2-3.6 10.8 1 1.3 2.3 2 3.6 2s2.6-.7 3.6-2c2-2.6.6-6-3.6-10.8Z" />
      <path strokeWidth="0" fillOpacity="0.45" d="M0-9.5c-1.6 2.2-2.1 3.8-1.3 5 .3.5.8.8 1.3.8s1-.3 1.3-.8c.8-1.2.3-2.8-1.3-5Z" fill="#000" />
      <rect x="-4" y="-1" width="8" height="12" rx="1.6" strokeWidth="0" />
      <path fill="none" strokeWidth="1.2" strokeOpacity="0.5" stroke="#000" d="M-1.5 1.5v8" />
      <path strokeWidth="0" d="M-9 11.4h18c0 1.9-1 3-2.8 3H-6.2c-1.8 0-2.8-1.1-2.8-3Z" />
    </g>
  ),
  legio: (
    <g>
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse key={a} cx="0" cy="-7.2" rx="4.6" ry="6.6" transform={`rotate(${a})`} strokeWidth="1" strokeOpacity="0.6" fillOpacity="0.92" />
      ))}
      <circle r="4.2" strokeWidth="0" fill="#000" fillOpacity="0.28" />
      <circle r="2.6" strokeWidth="0" />
      <path fill="none" strokeWidth="2" d="M0 7v8.5M0 10.5c2.2-1.6 4.6-2 6.5-1.3-1 2-3.5 3-6.5 2.6" />
    </g>
  ),
  youth: (
    <g>
      <path strokeWidth="0" d="M0-15c-6.8 7.2-9.8 12.3-8.2 17.3C-7 6.2-4 9.6 0 9.6S7 6.2 8.2 2.3C9.8-2.7 6.8-7.8 0-15Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.32" d="M0-6.5C-3.4-2.5-4.9.7-3.9 3.4-3.2 5.4-1.8 6.6 0 6.6s3.2-1.2 3.9-3.2c1-2.7-.5-5.9-3.9-9.9Z" />
      <path fill="none" strokeWidth="2.2" d="M-9 13.5h18" />
    </g>
  ),
  leader: (
    <g>
      <path strokeWidth="0" d="M-12.5 1.5 0-9.5 12.5 1.5v11c0 .9-.7 1.6-1.6 1.6h-21.8c-.9 0-1.6-.7-1.6-1.6Z" />
      <path fill="none" strokeWidth="2.6" d="M0-16v6M-3-13h6" />
      <rect x="-3.2" y="4.5" width="6.4" height="9.6" rx="1" fill="#000" fillOpacity="0.35" strokeWidth="0" />
      <path fill="none" strokeWidth="2.2" strokeOpacity="0.6" stroke="#000" d="M-15 2.5 0-10.5 15 2.5" />
    </g>
  ),
  prayer: (
    <g>
      <circle cx="0" cy="-3.5" r="9.5" fill="none" strokeWidth="2.6" strokeDasharray="0.1 3.3" />
      <circle cx="0" cy="-3.5" r="9.5" fill="none" strokeWidth="0.9" strokeOpacity="0.5" />
      <path fill="none" strokeWidth="2.6" strokeDasharray="0.1 3.3" d="M3.5 5.3c1.8 1.6 3.3 3.2 4.6 4.9" />
      <circle cx="9.6" cy="12.2" r="2" strokeWidth="0" />
      <path fill="none" strokeWidth="2.2" d="M9.6 10.2v-0M9.6 12.5v5.5M7.2 14.6h4.8" />
      <circle cx="0" cy="-3.5" r="3.4" strokeWidth="0" fillOpacity="0.55" />
    </g>
  ),
  writer: (
    <g>
      <path strokeWidth="0" d="M11.5-12.5C1.5-11-5.5-5-8.3 6.5c3.6-.6 6.5-1.9 9-3.9C3.6.5 6.4-5.5 11.5-12.5Z" />
      <path fill="none" strokeWidth="1.3" strokeOpacity="0.5" stroke="#000" d="M8-9C2.5-5-1.5 0-5 5.5" />
      <path fill="none" strokeWidth="2.4" d="M-8.3 6.5-11.5 13" />
      <path fill="none" strokeWidth="1.8" strokeOpacity="0.85" d="M-2 14.5h13" />
    </g>
  ),
  peacemaker: (
    <g>
      {/* 올리브 가지 두 줄기(평화) + 가운데 작은 하트 */}
      {([-1, 1] as const).map(d => (
        <g key={d} transform={`scale(${d} 1)`}>
          <path fill="none" strokeWidth="1.8" d="M-3 14C-12 10-16 2-14-9" />
          <ellipse cx="-7.3" cy="8.5" rx="1.7" ry="3.6" transform="rotate(2 -7.3 8.5)" strokeWidth="0" />
          <ellipse cx="-13.4" cy="8.8" rx="1.7" ry="3.6" transform="rotate(-95 -13.4 8.8)" strokeWidth="0" />
          <ellipse cx="-11.2" cy="2.5" rx="1.7" ry="3.6" transform="rotate(29 -11.2 2.5)" strokeWidth="0" />
          <ellipse cx="-16.8" cy="-0.0" rx="1.7" ry="3.6" transform="rotate(-68 -16.8 -0.0)" strokeWidth="0" />
          <ellipse cx="-12.1" cy="-5.1" rx="1.7" ry="3.6" transform="rotate(54 -12.1 -5.1)" strokeWidth="0" />
          <ellipse cx="-16.4" cy="-9.7" rx="1.7" ry="3.6" transform="rotate(-47 -16.4 -9.7)" strokeWidth="0" />
        </g>
      ))}
      <path strokeWidth="0" d="M0 4.5C-5.6.3-6.4-5.2-3.1-6.5-1.3-7.2-.3-5.9 0-5 .3-5.9 1.3-7.2 3.1-6.5 6.4-5.2 5.6.3 0 4.5Z" />
    </g>
  ),
  firstfruit: (
    <g>
      <path fill="none" strokeWidth="2.4" d="M0 14V-2" />
      <path strokeWidth="0" d="M0-2C-1.8-9.3-6.8-12.5-13.5-12.2c.9 6.5 5 10.6 13.5 10.2Z" />
      <path strokeWidth="0" d="M0 5C1.6-1.6 6.3-4.8 12.8-4.5c-.7 6.2-4.7 10.2-12.8 9.5Z" />
      <path fill="none" strokeWidth="1.2" strokeOpacity="0.5" stroke="#000" d="M-10-9.5C-6-7-3-4.5-.8-2.3M10-2.5C6.5-.5 3.5 1.8 1.2 4.5" />
      <path fill="none" strokeWidth="2" d="M-7 15.5h14" />
    </g>
  ),
  newborn: (
    <g>
      <path strokeWidth="0" d="M0 12.5-12.3-1.6C-9.4-8.4-5.2-11.8 0-11.8S9.4-8.4 12.3-1.6Z" />
      <path fill="none" strokeWidth="1.3" strokeOpacity="0.5" stroke="#000" d="M0 11.5-8.4-2.7M0 11.5-4.6-6.5M0 11.5l0-19M0 11.5 4.6-6.5M0 11.5 8.4-2.7" />
      <path strokeWidth="0" d="M-7-15.5c-1.2 1.5-1.8 2.5-1.8 3.4a1.8 1.8 0 0 0 3.6 0c0-.9-.6-1.9-1.8-3.4ZM7-15.5c-1.2 1.5-1.8 2.5-1.8 3.4a1.8 1.8 0 0 0 3.6 0c0-.9-.6-1.9-1.8-3.4Z" />
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
