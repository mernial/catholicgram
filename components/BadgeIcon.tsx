'use client';

import { useId, type ReactNode } from 'react';
import { MEMBER_BADGES, badgeOf, type MemberBadgeDef } from '@/lib/badges';

// --- 메달 모양 뱃지 그림 ---
// 금테(물결 테두리) + 색 원판 + 흰 문양. 작게(13px)도 크게(96px)도 또렷하게 보이도록 SVG 로 그린다.
// 교우 뱃지(BadgeIcon)는 Medal, 역할 뱃지(관리자·성직자·수도자, RoleBadge)는 RoleIcon.

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
  // 댓글 인기: 말풍선 속 하트
  comment_loved: (
    <g>
      <path strokeWidth="0" d="M-14-12h28c1.7 0 3 1.3 3 3v15c0 1.7-1.3 3-3 3H-2l-6 5.5V9h-6c-1.7 0-3-1.3-3-3V-9c0-1.7 1.3-3 3-3Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.4" d="M0 5.2C-5.6 1.5-6.4-3.4-3.1-4.6-1.3-5.2-.3-4 0-3.2.3-4 1.3-5.2 3.1-4.6 6.4-3.4 5.6 1.5 0 5.2Z" />
    </g>
  ),
  // 인기인: 별
  popular: (
    <g>
      <path strokeWidth="1.5" d="M0-14.5l4.2 8.8 9.6 1.3-7 6.7 1.8 9.6L0 7.3l-8.6 4.6 1.8-9.6-7-6.7 9.6-1.3Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.18" d="M0-14.5l4.2 8.8 9.6 1.3-7 6.7 1.8 9.6L0 7.3Z" />
    </g>
  ),
  // 응원왕: 손 위의 하트
  cheer: (
    <g>
      <path strokeWidth="0" d="M0 0C-5.2-3.4-5.9-8.2-2.9-9.3-1.3-9.9-.3-8.8 0-8 .3-8.8 1.3-9.9 2.9-9.3 5.9-8.2 5.2-3.4 0 0Z" />
      <path strokeWidth="0" d="M-13.5 4.5c3-2.3 6.3-2.6 9.8-1.3l5.6 1.9c1.6.6 2.4 1.9 2.1 3.2l-8.6-1.4-.4 2 9.3 1.7c1.4.3 2.6-.2 3.6-1.2l5-4.6c1.2-1.1 2.8-1.1 3.7 0 .9 1.1.6 2.6-.5 3.7l-7.2 7c-1.8 1.7-4 2.3-6.5 1.9l-8.3-1.4c-2.7-.5-5.2.1-7.6 1.6Z" />
    </g>
  ),
  // 함께 기도: 묵주
  intercessor: (
    <g>
      <circle cx="0" cy="-3.5" r="9.5" fill="none" strokeWidth="2.6" strokeDasharray="0.1 3.3" />
      <circle cx="0" cy="-3.5" r="9.5" fill="none" strokeWidth="0.9" strokeOpacity="0.5" />
      <path fill="none" strokeWidth="2.6" strokeDasharray="0.1 3.3" d="M3.5 5.3c1.8 1.6 3.3 3.2 4.6 4.9" />
      <circle cx="9.6" cy="12.2" r="2" strokeWidth="0" />
      <path fill="none" strokeWidth="2.2" d="M9.6 12.5v5.5M7.2 14.6h4.8" />
      <circle cx="0" cy="-3.5" r="3.4" strokeWidth="0" fillOpacity="0.55" />
    </g>
  ),
  // 위로 천사: 구름 뒤 해
  comforter: (
    <g>
      <circle cx="4" cy="-4" r="7" strokeWidth="0" fillOpacity="0.95" />
      <path fill="none" strokeWidth="1.8" strokeOpacity="0.9" d="M4-15.5v3M15.5-4h-3M12.1-12.1l-2.1 2.1M-4.1-12.1l2.1 2.1" />
      <path strokeWidth="1.2" stroke="#000" strokeOpacity="0.15" d="M-11 11.5c-3.3 0-5.5-2.2-5.5-5s2.2-5 5-5c.5-3.6 3.5-6 7-6 3.1 0 5.7 1.9 6.6 4.6 3.5-.6 6.4 1.8 6.4 5.2 0 3.4-2.6 6.2-6 6.2Z" />
    </g>
  ),
  // 마당발: 사람 셋
  friendly: (
    <g>
      <circle cx="-9" cy="-3" r="4" strokeWidth="0" fillOpacity="0.85" /><path strokeWidth="0" fillOpacity="0.85" d="M-16 11c0-4.5 3-7.5 7-7.5s7 3 7 7.5Z" />
      <circle cx="9" cy="-3" r="4" strokeWidth="0" fillOpacity="0.85" /><path strokeWidth="0" fillOpacity="0.85" d="M2 11c0-4.5 3-7.5 7-7.5s7 3 7 7.5Z" />
      <circle cx="0" cy="-7" r="4.8" strokeWidth="0" /><path strokeWidth="0" d="M-8.5 13c0-5.5 3.6-9 8.5-9s8.5 3.5 8.5 9Z" />
    </g>
  ),
  // 영상 작가: 재생 단추
  video: (
    <g>
      <rect x="-14" y="-10.5" width="28" height="21" rx="4.5" strokeWidth="0" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.4" d="M-4-6.5 7 0-4 6.5Z" />
    </g>
  ),
  // 스토리 작가: 스토리 동그라미 + 번개
  story: (
    <g>
      <circle r="12.5" fill="none" strokeWidth="2.8" strokeDasharray="6 3" />
      <path strokeWidth="0" d="M1.5-9-6 2h5l-2 7L5-2H0Z" />
    </g>
  ),
  // 음악 애호가: 음표
  dj: (
    <g>
      <ellipse cx="-7" cy="9" rx="4.4" ry="3.2" transform="rotate(-18 -7 9)" strokeWidth="0" />
      <ellipse cx="6" cy="6.5" rx="4.4" ry="3.2" transform="rotate(-18 6 6.5)" strokeWidth="0" />
      <path fill="none" strokeWidth="2.4" d="M-3.4 8.2V-9.5M9.6 5.7V-12" />
      <path strokeWidth="0" d="M-3.4-9.5 9.6-12v5.2L-3.4-4.3Z" />
    </g>
  ),
  // 메시지왕: 종이비행기
  messenger: (
    <g>
      <path strokeWidth="0" d="M-15-6 15-13 6 14l-6.5-8.5L-2 0Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.3" d="M-.5 5.5 15-13-2 0Z" />
    </g>
  ),
  // 단체방 단골: 말풍선 속 사람 셋
  groupchat: (
    <g>
      <path strokeWidth="0" d="M-15-11h30c1.7 0 3 1.3 3 3v14c0 1.7-1.3 3-3 3H-1l-6 5.5V9h-8c-1.7 0-3-1.3-3-3V-8c0-1.7 1.3-3 3-3Z" />
      <g fill="#000" fillOpacity="0.4" strokeWidth="0">
        <circle cx="-7" cy="-4" r="2.4" /><path d="M-11 4c0-2.6 1.8-4.4 4-4.4s4 1.8 4 4.4Z" />
        <circle cx="0" cy="-4.5" r="2.6" /><path d="M-4.4 4c0-2.9 2-4.8 4.4-4.8s4.4 1.9 4.4 4.8Z" />
        <circle cx="7" cy="-4" r="2.4" /><path d="M3 4c0-2.6 1.8-4.4 4-4.4s4 1.8 4 4.4Z" />
      </g>
    </g>
  ),
  // 새벽 기도: 해돋이
  earlybird: (
    <g>
      <path strokeWidth="0" d="M-10 6a10 10 0 0 1 20 0Z" />
      <path fill="none" strokeWidth="1.8" d="M0-11v-4M-9.5-7.5l-2.8-2.8M9.5-7.5l2.8-2.8M-14 3h-3M14 3h3" />
      <path fill="none" strokeWidth="2.4" d="M-16 10h32M-11 14.5h22" />
    </g>
  ),
  // 밤 기도: 달과 별
  nightowl: (
    <g>
      <path strokeWidth="0" d="M3-13c-6.8 0-12.3 5.5-12.3 12.3S-3.8 11.6 3 11.6c3.5 0 6.7-1.5 8.9-3.9-7.5.9-13.3-5-11.3-12.2.5-1.8 1.4-3.3 2.4-4.4C3 -12.9 3-13 3-13Z" />
      <path strokeWidth="0" d="M9.5-12l1.3 2.9 3 .4-2.2 2.1.5 3-2.6-1.5-2.6 1.5.5-3-2.2-2.1 3-.4Z" />
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
  // 연속 출석: 불꽃 (매일 이어진 열정)
  streak: (
    <g>
      <path strokeWidth="0" d="M1-15c1 5-2.5 7-4.5 10C-6 -1.5-7.5 2-6.5 6.2-5.3 11.4-1 14 3 13.8c6-.3 9.5-5 8.6-10.4-.6-3.6-2.8-6-5.2-8.2.2 2.6-.4 4.4-2 5.4.6-5.5-1.2-8.4-3.4-10.6Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.22" d="M1.5 2c1.2 2.2.4 3.8-.7 5.3-1.2 1.5-1.6 3-.7 4.6 2.6.6 5.3-1.2 5.3-4 0-2.4-1.8-4.2-3.9-5.9Z" />
    </g>
  ),
  // 답글 요정: 말풍선 안 답장 화살표
  replier: (
    <g>
      <path strokeWidth="0" d="M-14-12h28c1.7 0 3 1.3 3 3V5c0 1.7-1.3 3-3 3H-1l-6 6V8h-7c-1.7 0-3-1.3-3-3V-9c0-1.7 1.3-3 3-3Z" />
      <path fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="2.4" d="M-5-6l-4.5 4L-5 2M-9.5-2H3c3 0 5 2 5 4.5V5" />
    </g>
  ),
  // 리액션왕: 웃는 얼굴 + 하트·손 모양 표시
  reactor: (
    <g>
      <circle r="10.5" cx="-2" cy="2" strokeWidth="0" />
      <circle cx="-5.5" cy="-1" r="1.5" fill="#000" fillOpacity="0.4" strokeWidth="0" /><circle cx="1.5" cy="-1" r="1.5" fill="#000" fillOpacity="0.4" strokeWidth="0" />
      <path fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="1.8" d="M-6.5 4.5c2.2 3 6.8 3 9 0" />
      <path strokeWidth="0" d="M11-14c-3 2-5 4.5-4.2 7.2.3 1 1.2 1.6 2.2 1.6s1.8-.6 2.2-1.6c.8-2.7-1.2-5.2-.2-7.2Z" transform="translate(0 2)" />
      <path strokeWidth="0" d="M10.5-5C7.2-2.8 6.5-.2 8.3 1.2c.8.6 1.8.6 2.6 0 1.8-1.4 1.1-4-.4-6.2Z" transform="translate(2.5 7)" />
    </g>
  ),
  // 이모티콘 애호가: 모서리가 접힌 이모티콘(스티커) 네모 + 웃는 얼굴
  sticker: (
    <g>
      <path strokeWidth="0" d="M-13-13h26v16l-10 10h-16Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.25" d="M13 3L3 13V5c0-1.1.9-2 2-2Z" />
      <circle cx="-5.5" cy="-5" r="1.7" fill="#000" fillOpacity="0.4" strokeWidth="0" /><circle cx="3.5" cy="-5" r="1.7" fill="#000" fillOpacity="0.4" strokeWidth="0" />
      <path fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="2" d="M-6.5 1c2.5 3.5 7.5 3.5 10 0" />
    </g>
  ),
  // 주일 지킴이: 성당 (종탑·십자가)
  sunday: (
    <g>
      <path strokeWidth="0" d="M-14 14V2l6-5v17ZM14 14V2l-6-5v17Z" fillOpacity="0.6" />
      <path strokeWidth="0" d="M-8 14V-3L0-9l8 6v17Z" />
      <path fill="none" strokeWidth="2.2" d="M0-16v6M-2.6-13.2h5.2" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.4" d="M-2.6 14V6c0-1.6 1.1-2.7 2.6-2.7S2.6 4.4 2.6 6v8Z" />
    </g>
  ),
  // 묵상가: 펼친 두루마리에 글줄
  longform: (
    <g>
      <path strokeWidth="0" d="M-12-12h24c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3h-24c-1.7 0-3-1.3-3-3V-9c0-1.7 1.3-3 3-3Z" fillOpacity="0.92" />
      <path fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="1.8" d="M-9-6h18M-9-1.5h18M-9 3h18M-9 7.5h10" />
    </g>
  ),
  // 해시태그 장인: #
  hashtag: (
    <g>
      <path fill="none" strokeWidth="3.6" d="M-5-13l-3 26M8-13l-3 26M-13-5h26M-14 5h26" />
    </g>
  ),
  // 환영 천사: 인사하는 손 + 하트
  welcomer: (
    <g>
      <path strokeWidth="0" d="M-6 14c-5 0-8.5-3.5-8.5-8.5V-4c0-1.4 1.1-2.5 2.5-2.5S-9.5-5.4-9.5-4v4.5h1V-10c0-1.4 1.1-2.5 2.5-2.5S-3.5-11.4-3.5-10v10h1V-13c0-1.4 1.1-2.5 2.5-2.5S2.5-14.4 2.5-13v13h1V-9c0-1.4 1.1-2.5 2.5-2.5S8.5-10.4 8.5-9v12c0 6-4 11-10 11Z" />
      <path strokeWidth="0" d="M13.5-3.5C10.4-5.6 7.6-2.4 8.7.2 9.5 2 11.5 3.8 13.5 5.3 15.5 3.8 17.5 2 18.3.2 19.4-2.4 16.6-5.6 13.5-3.5Z" transform="translate(-2 2) scale(0.85)" />
    </g>
  ),
  // 사연 작가: 하트 봉인 편지
  letter: (
    <g>
      <path strokeWidth="0" d="M-15-9h30v18h-30Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.28" d="M-15-9h30L0 3Z" />
      <path strokeWidth="0" fill="#000" fillOpacity="0.14" d="M-15 9L-4 0l4 3 4-3 11 9Z" />
      <path strokeWidth="0" fill="#fff" d="M0 8.5C-3.8 5.9-4.6 2.5-2.4 1.3-1.2.6-.2 1.3 0 2.1.2 1.3 1.2.6 2.4 1.3 4.6 2.5 3.8 5.9 0 8.5Z" transform="translate(0 -1)" />
    </g>
  ),
  // --- 달성 도장: 작은 그림 + 숫자 ---
  m_posts10: <Numbered n="10"><path strokeWidth="0" d="M-6-14h8l3 3v8H-6Z" fillOpacity="0.9" /><path fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.1" d="M-4-9h5M-4-6.5h4" /></Numbered>,
  m_posts50: <Numbered n="50"><path strokeWidth="0" d="M-6-14h8l3 3v8H-6Z" fillOpacity="0.9" /><path fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.1" d="M-4-9h5M-4-6.5h4" /></Numbered>,
  m_comments100: <Numbered n="100"><path strokeWidth="0" d="M-7-14h14c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H-2l-3 3v-3h-2c-1.1 0-2-.9-2-2v-6c0-1.1.9-2 2-2Z" fillOpacity="0.9" /></Numbered>,
  m_hearts100: <Numbered n="100"><path strokeWidth="0" d="M0-3C-6.4-7.4-7.8-13.3-4.1-15.5-2-16.7-.5-15.5 0-14.3.5-15.5 2-16.7 4.1-15.5 7.8-13.3 6.4-7.4 0-3Z" fillOpacity="0.9" /></Numbered>,
  m_prays100: <Numbered n="100"><g transform="translate(-6.5 -16) scale(0.0508)"><path fillRule="evenodd" strokeWidth="0" d="M235.32,180l-36.24-36.25L162.62,23.46A21.76,21.76,0,0,0,128,12.93,21.76,21.76,0,0,0,93.38,23.46L56.92,143.76,20.68,180a16,16,0,0,0,0,22.62l32.69,32.69a16,16,0,0,0,22.63,0L124.28,187a40.68,40.68,0,0,0,3.72-4.29,40.68,40.68,0,0,0,3.72,4.29L180,235.32a16,16,0,0,0,22.63,0l32.69-32.69A16,16,0,0,0,235.32,180ZM122.50,24.00 L122.50,178.00 L133.50,178.00 L133.50,24.00ZM46.11,164.89 L91.11,209.89 L98.89,202.11 L53.89,157.11ZM202.11,157.11 L157.11,202.11 L164.89,209.89 L209.89,164.89Z" /></g></Numbered>,
  m_days30: <Numbered n="30"><path strokeWidth="0" d="M-7-13h14c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H-7c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2Z" fillOpacity="0.9" /><path fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="1.3" d="M-9-9h18M-4-15v3M4-15v3" /><path fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="1.6" d="M-3-4l2 2 4-4" /></Numbered>,
  m_days100: <Numbered n="100"><path strokeWidth="0" d="M-7-13h14c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H-7c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2Z" fillOpacity="0.9" /><path fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="1.3" d="M-9-9h18M-4-15v3M4-15v3" /><path fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="1.6" d="M-3-4l2 2 4-4" /></Numbered>,
  m_streak7: <Numbered n="7일"><path strokeWidth="0" d="M.5-16c.6 3-1.5 4.2-2.7 6C-3.6-8-4.5-6-3.9-3.5-3.2-.4-.6 1.2 1.8 1.1c3.6-.2 5.7-3 5.2-6.3-.4-2.1-1.7-3.6-3.1-4.9.1 1.6-.2 2.6-1.2 3.2.4-3.3-.7-5-2.2-6.3Z" fillOpacity="0.95" transform="translate(0 1)" /></Numbered>,
  m_year1: <Numbered n="1년"><path strokeWidth="0" d="M0-16l1.9 4 4.4.6-3.2 3.1.8 4.4L0-6l-3.9 2.1.8-4.4-3.2-3.1 4.4-.6Z" fillOpacity="0.95" /></Numbered>,
};

// 달성 도장 문양: 위에 작은 그림, 아래에 큰 숫자
function Numbered({ n, children }: { n: string; children: ReactNode }) {
  const size = n.length >= 3 ? 13 : 15.5;
  return (
    <g>
      {children}
      <text y="12.5" textAnchor="middle" fontSize={size} fontWeight="900" fontFamily="inherit" strokeWidth="0" style={{ letterSpacing: '-0.03em' }}>{n}</text>
    </g>
  );
}

export function BadgeIcon({ badge, size = 40, className = '' }: { badge: MemberBadgeDef | string; size?: number | string; className?: string }) {
  const def = typeof badge === 'string' ? badgeOf(badge) : badge;
  if (!def) return null;
  return <Medal colors={def.colors} rim={def.rim} size={size} title={`${def.label} 뱃지`} className={className}>{EMBLEMS[def.key]}</Medal>;
}

// 성직자·수도자 인증 뱃지 그림 (RoleBadge) — 바탕 없이 그림만 크게 보이므로 색과 가는 테두리 선을 넣어 그린다
// (운영자 2026-11-06: 원·네모 없이 그림 자체를 크게, 고급스럽고 단순하게)
// --- 역할 뱃지(관리자·성직자·수도자) — 운영자 시안 C (2026-11-10) ---
// 물결 테두리 안 색 바탕 + 상징: 관리자 = 톱니바퀴 위 파란 방패·체크·십자가(금), 성직자 = 보라 제의·로만 칼라·금 십자가, 수도자 = 회색 베일 아치 안 올리브 가지 문 비둘기(파랑)
export const ROLE_ART: Record<string, { ring: [string, string]; fill: [string, string]; emblem: ReactNode }> = {
  admin: { ring: ['#ffd978', '#f0a62a'], fill: ['#fff2bf', '#ffd45c'], emblem: (
    <g>
      {/* 톱니바퀴 */}
      <g fill="#f7c24a" stroke="#c98a12" strokeWidth="0.9" strokeLinejoin="round">
        {Array.from({ length: 10 }, (_, i) => <rect key={i} x="-3.2" y="-23" width="6.4" height="7" rx="1.6" transform={`rotate(${i * 36})`} />)}
        <circle r="19" />
      </g>
      <circle r="15.5" fill="#fbe08a" stroke="#c98a12" strokeWidth="0.8" />
      {/* 십자가 */}
      <path d="M0-22.5v8M-3.4-18.5h6.8" stroke="#e39a1c" strokeWidth="2.6" strokeLinecap="round" />
      {/* 방패 + 체크 */}
      <path d="M0-12 11-8v8c0 7-4.5 12-11 15C-6.5 12-11 7-11 0v-8Z" fill="#2f7be6" stroke="#1d57ad" strokeWidth="1" strokeLinejoin="round" />
      <path d="M0-12 11-8v8c0 7-4.5 12-11 15Z" fill="#fff" fillOpacity="0.14" />
      <path d="M-5.5 1 -1.5 5 6-4" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 월계수 */}
      <path d="M-17 4c-3-3-3-8-1-11M-14 9c-4-1-7-4-8-8M17 4c3-3 3-8 1-11M14 9c4-1 7-4 8-8" fill="none" stroke="#d8a428" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  ) },
  clergy: { ring: ['#f7f1e3', '#c5b48c'], fill: ['#ffffff', '#f3eee2'], emblem: (
    <g>
      {/* 흰 제의(카주블) + 금 테 (운영자 2026-11-10: 보라 대신 하얀색) */}
      <path d="M-14-11 -7-18h14l7 7v26c-3 1.5-11 2.5-14 2.5S-11 15.5-14 14Z" fill="#fbf8f1" stroke="#8a7c5e" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M-5-18v33M5-18v33" stroke="#d9b64a" strokeWidth="2.2" />
      <path d="M-21 2-14-11V14l-7 1Z" fill="#efe9db" stroke="#8a7c5e" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M21 2 14-11V14l7 1Z" fill="#efe9db" stroke="#8a7c5e" strokeWidth="1.3" strokeLinejoin="round" />
      {/* 로만 칼라 */}
      <path d="M-7-18c2 3 4.5 4 7 4s5-1 7-4" fill="none" stroke="#2e2e38" strokeWidth="3.6" strokeLinecap="round" />
      <rect x="-2.2" y="-19.2" width="4.4" height="4" fill="#fff" rx="0.6" />
      {/* 금 십자가 둘 */}
      <path d="M-11 0v8M-14 3h6M11 0v8M8 3h6" stroke="#d4a94a" strokeWidth="2" strokeLinecap="round" />
    </g>
  ) },
  religious: { ring: ['#9ec8ff', '#4d8fe8'], fill: ['#e6f0ff', '#bfd8fb'], emblem: (
    <g>
      {/* 베일 아치 (바깥 밝은 회색 → 안쪽 어두운 남회색) */}
      <path d="M-17 20C-17-6-10-18 0-22c10 4 17 16 17 42Z" fill="#e8ebf1" stroke="#8b94a3" strokeWidth="1" strokeLinejoin="round" />
      <path d="M-12.5 20C-12.5-2-7-13 0-17c7 4 12.5 15 12.5 37Z" fill="#5b6679" />
      <path d="M-9 20c0-17 4-26 9-30 5 4 9 13 9 30Z" fill="#303a4d" />
      {/* 비둘기 (크게) + 올리브 가지 */}
      <path d="M-8.5 5.5c.5-5 4-8.5 9-8 1.5-3 5.5-3.5 8-1.5L4.5-2l1.2 2.6c-1.5 5-6.5 7.5-11.5 6.5L-9 11l.5-4.2c-.8-.4-1.2-.8 0-1.3Z" fill="#fff" stroke="#c4ccd8" strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M-2 10c2-1 4-3 5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5.5-1.5c3.5-3 7.5-3 10.5-1.5M8-2.6c0-1.6 1.2-2.6 2.5-2.6M11-2.4c.3-1.6 1.6-2.4 3-2.1M13.5-1.6c.6-1.3 1.9-1.9 3.2-1.4" fill="none" stroke="#8bbf5a" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="2.2" cy="-3.6" r="0.75" fill="#303a4d" />
    </g>
  ) },
};
/** 예전 badge_type(주교·신부·부제·수녀·수사)을 세 역할로 — 신학생은 뱃지 없음 */
export const roleOf = (type?: string | null): 'admin' | 'clergy' | 'religious' | null => {
  if (!type) return null;
  if (type === 'admin' || type === 'clergy' || type === 'religious') return type;
  if (['bishop', 'priest', 'deacon'].includes(type)) return 'clergy'; // 신학생(seminarian)은 뱃지 없음 (운영자 2026-11-10)
  if (['sister', 'nun', 'brother', 'monk'].includes(type)) return 'religious';
  return null;
};

export function RoleIcon({ type, size = 24, title, className = '' }: { type: string; size?: number | string; title?: string; className?: string }) {
  const id = `rl${useId().replace(/[^\w-]/g, '')}`;
  const role = roleOf(type);
  const art = role ? ROLE_ART[role] : undefined;
  if (!art) return null;
  const px = typeof size === 'number' ? `${size}px` : size;
  return (
    <svg viewBox="0 0 64 64" width={px} height={px} className={`shrink-0 ${className}`} role="img" aria-label={title} style={{ width: px, height: px }}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={art.ring[0]} /><stop offset="1" stopColor={art.ring[1]} /></linearGradient>
        <radialGradient id={`${id}-fill`} cx="0.5" cy="0.35" r="0.7"><stop offset="0" stopColor={art.fill[0]} /><stop offset="1" stopColor={art.fill[1]} /></radialGradient>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodColor="#000" floodOpacity="0.22" /></filter>
      </defs>
      <circle cx="32" cy="33" r="30.5" fill="#000" fillOpacity="0.12" />
      <path d={SCALLOP} fill={`url(#${id}-ring)`} />
      <circle cx="32" cy="32" r="25.5" fill={`url(#${id}-fill)`} />
      <circle cx="32" cy="32" r="25.5" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" />
      <g filter={`url(#${id}-sh)`} transform="translate(32 33) scale(0.88)" strokeLinecap="round" strokeLinejoin="round">{art.emblem}</g>
    </svg>
  );
}

// 뱃지 목록 (관리자 고르기·소개 창에서)
export const ALL_BADGES = MEMBER_BADGES;
