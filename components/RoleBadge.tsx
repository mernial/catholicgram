'use client';

import type React from 'react';
import { ClergyIcon, CLERGY_ART } from '@/components/BadgeIcon';

// --- 성직자/수도자 인증 뱃지 ---
// profiles.badge_type 값에 따라 이름 옆에 메달(금테 + 십자가 문양, components/BadgeIcon Medal)과 호칭을 보여준다.
// 예전(2026-11-06 전)에는 인스타그램식 파란 체크였음 — 운영자 요청으로 고급스러운 메달로 바꿈.
// 호칭 글자('신부님')는 이제 기본으로 붙이지 않음(운영자 2026-11-06: '뱃지만 붙여') — 뱃지를 누르면 안내로 알 수 있음. showLabel 은 관리자 고르기 등에서만
export const BADGES: Record<string, { label: string; className: string }> = {
  bishop: { label: '주교님', className: 'bg-purple-50 text-purple-900 border-purple-200' },
  priest: { label: '신부님', className: 'bg-amber-50 text-amber-900 border-amber-300' },
  deacon: { label: '부제님', className: 'bg-amber-50 text-amber-900 border-amber-300' },
  sister: { label: '수녀님', className: 'bg-sky-50 text-sky-900 border-sky-200' },
  brother: { label: '수사님', className: 'bg-sky-50 text-sky-900 border-sky-200' },
  seminarian: { label: '신학생', className: 'bg-stone-50 text-stone-700 border-stone-300' },
};

export default function RoleBadge({ type, size = 'sm', showLabel = false, onClick }: { type?: string | null; size?: 'xs' | 'sm' | 'md'; showLabel?: boolean; onClick?: () => void }) {
  const badge = type ? BADGES[type] : undefined;
  const art = type ? CLERGY_ART[type] : undefined;
  if (!badge || !art) return null;
  const icon = size === 'md' ? 30 : size === 'sm' ? 24 : 20; // 운영자 2026-11-06: 작아서 티가 안 남 → 키움 (글줄 높이 안에서)
  const text = size === 'md' ? 'text-xs px-2 py-0.5' : size === 'sm' ? 'text-[0.75rem] px-1.5 py-px' : 'text-[0.6875rem] px-1 py-px';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick ? (e: React.MouseEvent) => { e.stopPropagation(); onClick(); } : undefined} className="inline-flex items-center gap-1 shrink-0" title={`인증된 ${badge.label}`} aria-label={onClick ? `인증된 ${badge.label} — 무슨 뱃지인지 보기` : undefined}>
      <ClergyIcon type={type!} size={icon} title={`인증된 ${badge.label}`} />
      {showLabel && (
        <span className={`rounded-full border font-serif font-bold leading-tight ${badge.className} ${text}`}>{badge.label}</span>
      )}
    </Tag>
  );
}
