'use client';

import type React from 'react';
import { RoleIcon, roleOf } from '@/components/BadgeIcon';

// --- 역할 인증 뱃지: 관리자 · 성직자 · 수도자 (운영자 시안 C, 2026-11-10) ---
// profiles.badge_type → 세 역할(roleOf: 예전 값 bishop/priest/deacon/seminarian → clergy, sister/brother → religious, admin).
// 이름 옆에 '뱃지 그림 + 역할 글자' 알약(시안의 적용 예시) — showLabel=false 면 그림만.
export const BADGES: Record<string, { label: string; className: string; desc: string }> = {
  admin: { label: '관리자', className: 'bg-amber-50 text-amber-900 border-amber-200', desc: '커뮤니티를 안전하고 원활하게 운영하는 관리자입니다.' },
  clergy: { label: '성직자', className: 'bg-purple-50 text-purple-900 border-purple-200', desc: '사제로서 신앙의 길을 함께 걸어가는 성직자입니다. (주교님·신부님·부제님)' },
  religious: { label: '수도자', className: 'bg-sky-50 text-sky-900 border-sky-200', desc: '하느님께 온전히 봉헌된 삶을 살아가는 수도자입니다. (수녀님·수사님)' },
};
export const roleBadgeOf = (type?: string | null) => { const r = roleOf(type); return r ? { key: r, ...BADGES[r] } : null; };

export default function RoleBadge({ type, size = 'sm', showLabel = true, onClick }: { type?: string | null; size?: 'xs' | 'sm' | 'md'; showLabel?: boolean; onClick?: () => void }) {
  const badge = roleBadgeOf(type);
  if (!badge) return null;
  const icon = size === 'md' ? 26 : size === 'sm' ? 20 : 17;
  const text = size === 'md' ? 'text-[0.8125rem]' : size === 'sm' ? 'text-[0.75rem]' : 'text-[0.6875rem]';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick ? (e: React.MouseEvent) => { e.stopPropagation(); onClick(); } : undefined}
      className={`inline-flex items-center gap-1 shrink-0 align-middle rounded-full border font-bold leading-none ${badge.className} ${showLabel ? (size === 'md' ? 'pl-0.5 pr-2 py-0.5' : 'pl-px pr-1.5 py-px') : 'p-0 border-0 bg-transparent'} ${text}`}
      title={`인증된 ${badge.label}`} aria-label={onClick ? `인증된 ${badge.label} — 무슨 뱃지인지 보기` : undefined}>
      <RoleIcon type={badge.key} size={icon} title={`인증된 ${badge.label}`} />
      {showLabel && <span>{badge.label}</span>}
    </Tag>
  );
}
