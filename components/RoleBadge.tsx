'use client';

// --- 성직자/수도자 인증 뱃지 ---
// profiles.badge_type 값에 따라 이름 옆에 파란 인증 표시와 호칭을 보여준다.
export const BADGES: Record<string, { label: string; className: string }> = {
  bishop: { label: '주교님', className: 'bg-purple-50 text-purple-800 border-purple-200' },
  priest: { label: '신부님', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  deacon: { label: '부제님', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  sister: { label: '수녀님', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  brother: { label: '수사님', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  seminarian: { label: '신학생', className: 'bg-stone-50 text-stone-700 border-stone-200' },
};

export default function RoleBadge({ type, size = 'sm', showLabel = true }: { type?: string | null; size?: 'xs' | 'sm' | 'md'; showLabel?: boolean }) {
  const badge = type ? BADGES[type] : undefined;
  if (!badge) return null;
  const icon = size === 'md' ? 'w-[18px] h-[18px]' : size === 'sm' ? 'w-[15px] h-[15px]' : 'w-[13px] h-[13px]';
  const text = size === 'md' ? 'text-xs px-2 py-0.5' : size === 'sm' ? 'text-[0.75rem] px-1.5 py-px' : 'text-[0.6875rem] px-1 py-px';
  return (
    <span className="inline-flex items-center gap-1 shrink-0" title={`인증된 ${badge.label}`}>
      {/* 인스타그램 스타일 파란 인증 표시 */}
      <svg viewBox="0 0 24 24" className={icon} aria-label="인증됨">
        <path fill="#0095F6" d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3 3.2.1z" />
        <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M7.8 12.2l2.8 2.8 5.6-5.8" />
      </svg>
      {showLabel && (
        <span className={`rounded-full border font-serif font-bold leading-tight ${badge.className} ${text}`}>{badge.label}</span>
      )}
    </span>
  );
}

