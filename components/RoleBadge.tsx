'use client';

import type React from 'react';
import { RoleIcon, roleOf } from '@/components/BadgeIcon';
import { showAlert } from '@/components/ConfirmDialog';

// --- 역할 인증 뱃지: 관리자 · 성직자 · 수도자 (운영자 시안 C, 2026-11-10) ---
// profiles.badge_type → 세 역할(roleOf: 예전 값 bishop/priest/deacon → clergy, sister/brother → religious, admin; seminarian 은 뱃지 없음).
// 이름 옆에는 그림만(운영자 2026-11-14: '관리자' 글자 없이 뱃지만, 누르면 무엇인지) — showLabel=true 면 '그림 + 역할 글자' 알약.
export const BADGES: Record<string, { label: string; className: string; desc: string }> = {
  admin: { label: '관리자', className: 'bg-amber-50 text-amber-900 border-amber-200', desc: '커뮤니티를 안전하고 원활하게 운영하는 관리자입니다.' },
  clergy: { label: '성직자', className: 'bg-white text-stone-800 border-stone-300', desc: '사제로서 신앙의 길을 함께 걸어가는 성직자입니다. (주교님·신부님·부제님)' },
  religious: { label: '수도자', className: 'bg-sky-50 text-sky-900 border-sky-200', desc: '하느님께 온전히 봉헌된 삶을 살아가는 수도자입니다. (수녀님·수사님)' },
};
export const roleBadgeOf = (type?: string | null) => { const r = roleOf(type); return r ? { key: r, ...BADGES[r] } : null; };

export default function RoleBadge({ type, size = 'sm', showLabel = false, onClick }: { type?: string | null; size?: 'xs' | 'sm' | 'md'; showLabel?: boolean; onClick?: () => void }) {
  const badge = roleBadgeOf(type);
  if (!badge) return null;
  const icon = size === 'md' ? 26 : size === 'sm' ? 20 : 17;
  const text = size === 'md' ? 'text-[0.8125rem]' : size === 'sm' ? 'text-[0.75rem]' : 'text-[0.6875rem]';
  // 누르면 무슨 뱃지인지 (onClick 이 없으면 짧은 안내 창). 글·목록 줄 버튼 안에 들어가기도 해서 button 대신 span
  const open = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); if (onClick) onClick(); else showAlert({ title: `인증된 ${badge.label}`, message: badge.desc }); };
  return (
    <span role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') open(e); }}
      className={`inline-flex items-center gap-1 shrink-0 align-middle rounded-full border font-bold leading-none cursor-pointer ${badge.className} ${showLabel ? (size === 'md' ? 'pl-0.5 pr-2 py-0.5' : 'pl-px pr-1.5 py-px') : 'p-0 border-0 bg-transparent'} ${text}`}
      title={`인증된 ${badge.label}`} aria-label={`인증된 ${badge.label} — 무슨 뱃지인지 보기`}>
      {/* 관리자는 월계관·왕관 그림이라 같은 칸에서는 너무 작음 → 3.2배로 크게(운영자 2026-11-14 '많이 크게'). 글줄 높이는 그대로 두고 위(왕관)·옆으로 넘치게 */}
      {badge.key === 'admin'
        ? (() => { const B = Math.round(icon * 3.2), ex = B - icon; return <span className="inline-flex shrink-0 relative z-[1]" style={{ margin: `-${Math.round(ex * 0.62)}px -${Math.round(B * 0.1)}px -${Math.round(ex * 0.38)}px -${Math.round(B * 0.1)}px` }}><RoleIcon type="admin" size={B} title={`인증된 ${badge.label}`} /></span>; })()
        : <RoleIcon type={badge.key} size={icon} title={`인증된 ${badge.label}`} />}
      {showLabel && <span>{badge.label}</span>}
    </span>
  );
}
