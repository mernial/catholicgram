'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm, showAlert } from '@/components/ConfirmDialog';
import { useBackLayer } from '@/lib/back-layers';
import { BADGE_GROUPS, MEMBER_BADGES, STAT_LABELS, badgeOf, type BadgeGroup, type MemberBadgeRow, type StatKey } from '@/lib/badges';
import { BadgeIcon } from '@/components/BadgeIcon';
import { clipText, charCount } from '@/lib/clip-text';

// --- 교우 뱃지 (관리자가 일반 신자에게 달아 주는 뱃지) ---
// 표 member_badges (supabase/member-badges.sql). 공간 머리에 '뱃지 선반'(BadgeShelf), 프로필 카드에 작은 줄(BadgeRow),
// 관리자는 '뱃지 달기' 창(BadgeGrantSheet)에서 달고 뗀다. 표가 없으면(SQL 전) 조용히 빈 채로.

const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };

export function useMemberBadges(userId: string | null | undefined) {
  const [rows, setRows] = useState<MemberBadgeRow[]>([]);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false); // 표가 아직 없음 (SQL 전)
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('member_badges').select('id, user_id, badge_key, note, created_at').eq('user_id', userId).order('created_at', { ascending: true });
      if (!alive) return;
      if (error) { setMissing(/member_badges/.test(error.message) || error.code === '42P01'); setRows([]); setReady(true); return; }
      setMissing(false);
      setRows(((data || []) as MemberBadgeRow[]).filter(r => badgeOf(r.badge_key)));
      setReady(true);
    })();
    return () => { alive = false; };
  }, [userId, tick]);
  return { rows, ready, missing, reload };
}

// 뱃지 하나를 크게: 이름·뜻·받은 날 (관리자는 떼기)
function BadgeDetail({ row, admin, onClose, onRevoke }: { row: MemberBadgeRow; admin: boolean; onClose: () => void; onRevoke?: (row: MemberBadgeRow) => void }) {
  useBackLayer(true, onClose);
  const def = badgeOf(row.badge_key)!;
  return (
    <div className="fixed inset-0 z-[96] bg-black/60 flex items-center justify-center p-6 animate-fade-in" onClick={onClose} role="dialog" aria-label={`${def.label} 뱃지`}>
      <div className="bg-white rounded-3xl w-full max-w-xs p-6 flex flex-col items-center text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="animate-[giftBounce_1.2s_ease-in-out_infinite]"><BadgeIcon badge={def} size={112} /></div>
        <p className="mt-3 text-[0.75rem] font-bold text-amber-700 tracking-wide">{BADGE_GROUPS[def.group]}</p>
        <h3 className="mt-0.5 text-[1.25rem] font-bold text-stone-900">{def.label}</h3>
        <p className="mt-1.5 text-[0.9375rem] text-stone-600 leading-relaxed">{def.desc}</p>
        {row.note && <p className="mt-2 text-[0.875rem] text-stone-700 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">“{row.note}”</p>}
        <p className="mt-3 text-[0.75rem] text-stone-400">{fmtDate(row.created_at)} 받음</p>
        <div className="mt-4 flex gap-2 w-full">
          {admin && onRevoke && <button onClick={() => onRevoke(row)} className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 text-[0.9375rem] font-bold">떼기</button>}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-[0.9375rem] font-bold">닫기</button>
        </div>
      </div>
    </div>
  );
}

// 공간 머리의 뱃지 선반
export function BadgeShelf({ userId, admin, mine, onGrant }: { userId: string; admin: boolean; mine: boolean; onGrant?: () => void }) {
  const { rows, missing, reload } = useMemberBadges(userId);
  const [open, setOpen] = useState<MemberBadgeRow | null>(null);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<string>).detail === userId) reload(); };
    window.addEventListener('member-badges-changed', h);
    return () => window.removeEventListener('member-badges-changed', h);
  }, [userId, reload]);
  const revoke = async (row: MemberBadgeRow) => {
    const def = badgeOf(row.badge_key)!;
    if (!(await askConfirm(`'${def.label}' 뱃지를 뗄까요?\n이 교우의 공간에서 사라져요.`))) return;
    const { error } = await supabase.from('member_badges').delete().eq('id', row.id);
    if (error) { showAlert(`뱃지를 떼지 못했어요\n${error.message}`); return; }
    setOpen(null); reload();
  };
  if (rows.length === 0 && !(admin && !missing)) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[0.75rem] font-bold text-stone-500">{mine ? '내 뱃지' : '뱃지'}{rows.length > 0 ? ` ${rows.length}` : ''}</p>
        {admin && !missing && <button onClick={onGrant} className="text-[0.75rem] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">＋ 뱃지 달기</button>}
      </div>
      {rows.length === 0 ? (
        <p className="text-[0.8125rem] text-stone-400">아직 달아 준 뱃지가 없어요.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 pb-1">
          {rows.map(r => { const def = badgeOf(r.badge_key)!; return (
            <button key={r.id} onClick={() => setOpen(r)} className="shrink-0 w-[4.25rem] flex flex-col items-center gap-1" aria-label={`${def.label} 뱃지 보기`}>
              <BadgeIcon badge={def} size={48} />
              <span className="text-[0.6875rem] font-bold text-stone-700 leading-tight text-center">{def.label}</span>
            </button>
          ); })}
        </div>
      )}
      {open && <BadgeDetail row={open} admin={admin} onClose={() => setOpen(null)} onRevoke={revoke} />}
    </div>
  );
}

// 프로필 카드·목록 줄의 작은 뱃지 줄 (누르면 이름만 안내)
export function BadgeRow({ userId, size = 22, max = 6, className = '' }: { userId: string; size?: number; max?: number; className?: string }) {
  const { rows } = useMemberBadges(userId);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, max);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={`뱃지 ${rows.map(r => badgeOf(r.badge_key)!.label).join(', ')}`}>
      {shown.map(r => <BadgeIcon key={r.id} badge={r.badge_key} size={size} />)}
      {rows.length > max && <span className="text-[0.75rem] text-stone-500 font-bold">+{rows.length - max}</span>}
    </span>
  );
}

// 관리자: 뱃지 달기·떼기 창
export function BadgeGrantSheet({ user, onClose, onGranted }: { user: { id: string; name: string }; onClose: () => void; onGranted?: (rowId: string) => void }) {
  const { rows, ready, missing, reload } = useMemberBadges(user.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const have = new Map(rows.map(r => [r.badge_key, r]));
  // 그 교우의 앱 활동 숫자 (서버 /api/admin/member-stats, 관리자만) — 어떤 뱃지가 어울리는지 참고
  const [stats, setStats] = useState<Partial<Record<StatKey, number>> | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/member-stats?user=${encodeURIComponent(user.id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      if (!alive || !res || !res.ok) return;
      setStats(await res.json());
    })();
    return () => { alive = false; };
  }, [user.id]);
  const notify = () => window.dispatchEvent(new CustomEvent('member-badges-changed', { detail: user.id }));
  const toggle = async (key: string) => {
    if (busy) return;
    const def = badgeOf(key)!;
    const row = have.get(key);
    setBusy(key);
    try {
      if (row) {
        if (!(await askConfirm(`'${def.label}' 뱃지를 뗄까요?`))) return;
        const { error } = await supabase.from('member_badges').delete().eq('id', row.id);
        if (error) { showAlert(`뱃지를 떼지 못했어요\n${error.message}`); return; }
      } else {
        const { data, error } = await supabase.from('member_badges').insert({ user_id: user.id, badge_key: key, note: note.trim() || null }).select('id').single();
        if (error) { showAlert(`뱃지를 달지 못했어요\n${error.message}`); return; }
        onGranted?.(data.id as string);
      }
      reload(); notify();
    } finally { setBusy(null); }
  };
  const groups: BadgeGroup[] = ['love', 'activity', 'help', 'honor'];
  return (
    <BottomSheet bare label="뱃지 달기" onClose={onClose} z="z-[94]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-stone-100">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-[1.125rem] text-stone-900 truncate">🏅 {user.name}님 뱃지</h2>
            <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 text-2xl leading-none" aria-label="닫기">×</button>
          </div>
          <p className="text-[0.8125rem] text-stone-500 mt-0.5">누르면 달고, 다시 누르면 떼요. 달면 교우에게 휴대폰 알림이 가요.</p>
          {stats && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label="이 교우의 활동">
              {(Object.keys(STAT_LABELS) as StatKey[]).map(k => (
                <span key={k} className="text-[0.6875rem] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600"><b className="text-stone-900">{stats[k] ?? 0}</b> {STAT_LABELS[k]}</span>
              ))}
            </div>
          )}
          <input value={note} onChange={e => setNote(clipText(e.target.value, 60))} placeholder="함께 남길 말 (선택, 예: 2026년 성탄 성가대 봉사 감사해요)" aria-label="남길 말"
            className="mt-2 w-full px-3 py-2 rounded-xl border border-stone-300 bg-stone-50 text-[0.9375rem] focus:outline-none focus:border-stone-500" />
          {note && <p className="text-right text-[0.6875rem] text-stone-400 mt-0.5">{charCount(note)}/60</p>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {missing ? (
            <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[0.875rem] text-amber-900 leading-relaxed">
              아직 뱃지 표가 없어요. Supabase SQL 편집기에서 <b>supabase/member-badges.sql</b> 을 실행해 주세요.
            </div>
          ) : !ready ? <p className="p-6 text-center text-sm text-stone-400">불러오는 중…</p> : groups.map(g => (
            <div key={g} className="mt-4">
              <p className="text-[0.8125rem] font-bold text-stone-500 mb-2">{BADGE_GROUPS[g]}</p>
              <div className="grid grid-cols-3 gap-2">
                {MEMBER_BADGES.filter(b => b.group === g).map(b => { const on = have.has(b.key); return (
                  <button key={b.key} onClick={() => toggle(b.key)} disabled={busy !== null} aria-pressed={on}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-colors ${on ? 'bg-amber-50 border-amber-300' : 'bg-white border-stone-200'} ${busy === b.key ? 'opacity-60' : ''}`}>
                    <BadgeIcon badge={b} size={52} className={on ? '' : 'opacity-80'} />
                    <span className="text-[0.8125rem] font-bold text-stone-800 leading-tight">{b.label}</span>
                    <span className="text-[0.6875rem] text-stone-500 leading-snug">{b.desc}</span>
                    {b.stat && stats && <span className="text-[0.6875rem] font-bold text-amber-700">{STAT_LABELS[b.stat]} {stats[b.stat] ?? 0}</span>}
                    {on && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-500 text-white text-[0.75rem] font-bold flex items-center justify-center" aria-hidden>✓</span>}
                  </button>
                ); })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
