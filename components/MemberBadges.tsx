'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm, showAlert } from '@/components/ConfirmDialog';
import { useBackLayer } from '@/lib/back-layers';
import { AUTO_BADGE_MIN, BADGE_GROUPS, MEMBER_BADGES, STAT_LABELS, TIERS, badgeOf, badgeRank, shownBadges, type BadgeGroup, type BadgeStamp, type MemberBadgeRow, type StatKey } from '@/lib/badges';
type Row = MemberBadgeRow & { auto?: boolean };
import { BadgeIcon } from '@/components/BadgeIcon';
import { clipText, charCount } from '@/lib/clip-text';
import Switch from '@/components/Switch';
import { toast } from '@/lib/chat-actions';
import { useBadgeMap } from '@/lib/badge-map';
import { RoleIcon, roleOf } from '@/components/BadgeIcon';
import { BADGES } from '@/components/RoleBadge';

// --- 교우 뱃지 (관리자가 일반 신자에게 달아 주는 뱃지) ---
// 표 member_badges (supabase/member-badges.sql). 공간 머리에 '뱃지 선반'(BadgeShelf), 프로필 카드에 작은 줄(BadgeRow),
// 관리자는 '뱃지 달기' 창(BadgeGrantSheet)에서 달고 뗀다. 표가 없으면(SQL 전) 조용히 빈 채로.

const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
// 저절로 달리는 뱃지의 설명: 1등 뱃지 / 달성 도장
const autoNote = (key: string) => { const d = badgeOf(key); return !d?.auto ? '' : d.permanent ? ' · 기준을 넘으면 저절로 받고 계속 남아요' : ' · 활동 1등에게 저절로 달려요 (1등이 바뀌면 옮겨 가요)'; };

// 받은 기록(도장): 뱃지를 받을 때마다 남는 줄 (badge_stamps — 뱃지가 떨어져도 남음)
export function useBadgeStamps(userId: string | null | undefined, enabled = true) {
  const [stamps, setStamps] = useState<BadgeStamp[]>([]);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    if (!userId || !enabled) return;
    let alive = true;
    supabase.from('badge_stamps').select('id, user_id, badge_key, earned_at, auto, note').eq('user_id', userId).order('earned_at', { ascending: false }).limit(500).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setMissing(true); setStamps([]); setReady(true); return; }
      setMissing(false); setStamps(((data || []) as BadgeStamp[]).filter(r => badgeOf(r.badge_key))); setReady(true);
    });
    return () => { alive = false; };
  }, [userId, enabled, tick]);
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<string>).detail; if (d === userId || d === '*') reload(); };
    window.addEventListener('member-badges-changed', h);
    return () => window.removeEventListener('member-badges-changed', h);
  }, [userId, reload]);
  return { stamps, ready, missing, reload };
}

// 도장 모음: 받은 날짜가 찍힌 도장을 달마다 모아 보여 줌 (운영자 2026-11-06 '스탬프 모으듯 몇 월 며칠 받았다')
export function StampBook({ userId, name, mine, onClose }: { userId: string; name?: string; mine: boolean; onClose: () => void }) {
  const { stamps, ready, missing } = useBadgeStamps(userId);
  const { rows } = useMemberBadges(userId);
  const holding = new Set(rows.map(r => r.badge_key));
  const [open, setOpen] = useState<BadgeStamp | null>(null);
  const who = mine ? '내' : `${name || '교우'}님의`;
  // 달마다 묶기 (최근 달 먼저)
  const months: { key: string; label: string; items: BadgeStamp[] }[] = [];
  stamps.forEach(st => {
    const d = new Date(st.earned_at); const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    let m = months.find(x => x.key === key);
    if (!m) { m = { key, label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, items: [] }; months.push(m); }
    m.items.push(st);
  });
  const kinds = new Set(stamps.map(s => s.badge_key)).size;
  return (
    <div onClick={e => e.stopPropagation()} className="contents">
    <BottomSheet bare label="도장 모음" onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-stone-100 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-bold text-[1.125rem] text-stone-900 truncate">📖 {who} 뱃지 도장{stamps.length > 0 ? ` ${stamps.length}개` : ''}</h2>
            <p className="text-[0.8125rem] text-stone-500 mt-0.5">뱃지를 받은 날마다 도장이 찍혀요 · 1등이 바뀌어 뱃지가 넘어가도 도장은 그대로 남아요{kinds > 0 ? ` · ${kinds}종류` : ''}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 text-2xl leading-none shrink-0" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {!ready ? <p className="p-6 text-center text-sm text-stone-400">불러오는 중…</p> : missing ? (
            <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[0.875rem] text-amber-900">아직 도장 표가 없어요. 관리자가 <b>supabase/member-badges.sql</b> 을 다시 실행하면 보여요.</div>
          ) : stamps.length === 0 ? (
            <p className="p-8 text-center text-[0.9375rem] text-stone-400 leading-relaxed">아직 찍힌 도장이 없어요.<br />{mine ? '활동 1등이 되거나 글 10편·출석 30일 같은 기준을 넘으면 그날 날짜로 도장이 찍혀요.' : ''}</p>
          ) : months.map(m => (
            <div key={m.key} className="mt-4">
              <p className="text-[0.8125rem] font-bold text-stone-500 mb-2 flex items-center gap-2">{m.label}<span className="font-normal text-stone-400">{m.items.length}개</span></p>
              <div className="grid grid-cols-4 gap-2">
                {m.items.map(st => { const def = badgeOf(st.badge_key)!; const d = new Date(st.earned_at); const held = holding.has(st.badge_key); return (
                  <button key={st.id} onClick={() => setOpen(st)} className="relative flex flex-col items-center gap-1 pt-2.5 pb-2 px-1 rounded-2xl border border-dashed border-amber-300/80 bg-[#fffaf0] text-center" aria-label={`${def.label} 도장 ${fmtDate(st.earned_at)}`}>
                    <BadgeIcon badge={def} size={46} />
                    <span className="text-[0.6875rem] font-bold text-stone-800 leading-tight line-clamp-1">{def.label}</span>
                    <span className="text-[0.625rem] font-bold text-amber-800 bg-amber-100 rounded-full px-1.5 leading-4" style={{ transform: 'rotate(-6deg)' }}>{d.getMonth() + 1}.{d.getDate()}</span>
                    {held && !def.permanent && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" title="지금 달고 있어요" aria-hidden />}
                  </button>
                ); })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {open && (() => { const def = badgeOf(open.badge_key)!; const held = holding.has(open.badge_key); return (
        <StampDetail def={def} stamp={open} held={held} onClose={() => setOpen(null)} />
      ); })()}
    </BottomSheet>
    </div>
  );
}

function StampDetail({ def, stamp, held, onClose }: { def: NonNullable<ReturnType<typeof badgeOf>>; stamp: BadgeStamp; held: boolean; onClose: () => void }) {
  useBackLayer(true, onClose);
  return (
    <div className="fixed inset-0 z-[96] bg-black/60 flex items-center justify-center p-6 animate-fade-in" onClick={onClose} role="dialog" aria-label={`${def.label} 도장`}>
      <div className="bg-white rounded-3xl w-full max-w-xs p-6 flex flex-col items-center text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <BadgeIcon badge={def} size={112} />
        <p className="mt-3 text-[0.75rem] font-bold text-amber-700 tracking-wide">{BADGE_GROUPS[def.group]}</p>
        <h3 className="mt-0.5 text-[1.25rem] font-bold text-stone-900">{def.label}</h3>
        <p className="mt-1.5 text-[0.9375rem] text-stone-600 leading-relaxed">{def.desc}</p>
        {stamp.note && <p className="mt-2 text-[0.875rem] text-stone-700 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">“{stamp.note}”</p>}
        <p className="mt-3 text-[0.8125rem] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">📅 {fmtDate(stamp.earned_at)} 받음</p>
        <p className="mt-2 text-[0.75rem] text-stone-400">{def.permanent ? '한 번 받으면 계속 남는 달성 도장이에요' : held ? '지금도 달고 있어요' : '지금은 다른 교우가 1등이지만 받은 기록은 남아요'}</p>
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl bg-stone-900 text-white text-[0.9375rem] font-bold">닫기</button>
      </div>
    </div>
  );
}

export function useMemberBadges(userId: string | null | undefined) {
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false); // 표가 아직 없음 (SQL 전)
  const [hidden, setHidden] = useState(false);   // 본인이 숨김 (profiles.hide_badges)
  const [featured, setFeatured] = useState<string | null>(null); // 고른 대표 뱃지 (profiles.featured_badge)
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [{ data, error }, prof] = await Promise.all([
        supabase.from('member_badges').select('id, user_id, badge_key, note, created_at, auto').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('profiles').select('hide_badges, featured_badge').eq('id', userId).maybeSingle()
          .then(r => (r.error ? supabase.from('profiles').select('hide_badges').eq('id', userId).maybeSingle() : r)),
      ]);
      if (!alive) return;
      const pd = prof.data as { hide_badges?: boolean; featured_badge?: string | null } | null;
      setHidden(!!pd?.hide_badges);
      setFeatured(pd?.featured_badge || null);
      if (error) {
        // 예전 판(auto 칸 없음)이면 auto 없이 한 번 더
        if (/auto/.test(error.message)) {
          const again = await supabase.from('member_badges').select('id, user_id, badge_key, note, created_at').eq('user_id', userId).order('created_at', { ascending: true });
          if (!alive) return;
          if (!again.error) { setMissing(false); setRows(((again.data || []) as Row[]).filter(r => badgeOf(r.badge_key))); setReady(true); return; }
        }
        setMissing(/member_badges/.test(error.message) || error.code === '42P01'); setRows([]); setReady(true); return;
      }
      setMissing(false);
      setRows(((data || []) as Row[]).filter(r => badgeOf(r.badge_key)));
      setReady(true);
    })();
    return () => { alive = false; };
  }, [userId, tick]);
  // 대표 뱃지를 맨 앞으로
  const ranked = [...rows].sort((x, y) => badgeRank(x.badge_key) - badgeRank(y.badge_key));
  const sorted = featured && ranked.some(r => r.badge_key === featured) ? [...ranked.filter(r => r.badge_key === featured), ...ranked.filter(r => r.badge_key !== featured)] : ranked;
  return { rows: sorted, ready, missing, hidden, setHidden, featured: sorted[0]?.badge_key || null, chosen: featured, setFeatured, reload };
}

// 뱃지 하나를 크게: 이름·뜻·받은 날 (관리자는 떼기)
function BadgeDetail({ row, admin, onClose, onRevoke }: { row: Row; admin: boolean; onClose: () => void; onRevoke?: (row: MemberBadgeRow) => void }) {
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
        <p className="mt-3 text-[0.75rem] text-stone-400">{fmtDate(row.created_at)} 받음{row.auto && autoNote(row.badge_key)}</p>
        <div className="mt-4 flex gap-2 w-full">
          {admin && onRevoke && !row.auto && <button onClick={() => onRevoke(row)} className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 text-[0.9375rem] font-bold">떼기</button>}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-[0.9375rem] font-bold">닫기</button>
        </div>
      </div>
    </div>
  );
}

// 한 교우의 뱃지 모두 보기 (뱃지를 누르면 — 인증 뱃지 + 활동 뱃지, 설명과 받은 날, 누른 것은 테두리) — 운영자 2026-11-06
export function BadgeListDialog({ userId, name, highlight, onClose, empty, showHidden, mine }: { userId: string; name?: string; highlight?: string; onClose: () => void; empty?: string; showHidden?: boolean; mine?: boolean }) {
  useBackLayer(true, onClose);
  const { rows, ready, hidden: hiddenRaw, featured, setFeatured } = useMemberBadges(userId);
  // 본인: 이름 옆에 보일 대표 뱃지 고르기 (운영자 2026-11-14)
  const [picking, setPicking] = useState<string | null>(null);
  const pick = async (key: string) => {
    setPicking(key);
    const { error } = await supabase.from('profiles').update({ featured_badge: key }).eq('id', userId);
    setPicking(null);
    if (error) { showAlert(`대표 뱃지를 저장하지 못했어요\n${/featured_badge/.test(error.message) ? '대표 뱃지 표(SQL)를 먼저 실행해야 해요.' : error.message}`); return; }
    setFeatured(key);
    window.dispatchEvent(new CustomEvent('member-badges-changed', { detail: userId }));
    toast(`'${badgeOf(key)!.label}' 뱃지가 이름 옆에 보여요`);
  };
  const hidden = hiddenRaw && !showHidden;
  const [prof, setProf] = useState<{ baptismal_name?: string; badge_type?: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from('profiles').select('baptismal_name, badge_type').eq('id', userId).maybeSingle().then(({ data }) => { if (alive) setProf((data as { baptismal_name?: string; badge_type?: string | null } | null) || {}); });
    return () => { alive = false; };
  }, [userId]);
  const who = name || prof?.baptismal_name || '교우';
  const [book, setBook] = useState(false);
  const clergy = roleOf(prof?.badge_type);
  const total = (clergy ? 1 : 0) + (hidden ? 0 : shownBadges(rows.map(r => r.badge_key)).length);
  const item = (key: string, icon: ReactNode, label: string, desc: string, sub?: string, badgeKey?: string) => (
    <div key={key} className={`flex items-start gap-3 px-3 py-3 ${highlight === key ? 'bg-amber-50' : ''}`}>
      <div className="shrink-0 w-14 flex justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[0.9375rem] font-bold text-stone-900">{label}
          {badgeKey && badgeKey === featured && <span className="ml-1.5 align-middle inline-block px-1.5 py-px rounded-full bg-amber-100 text-amber-800 text-[0.6875rem] font-bold">대표</span>}
          {highlight === key && badgeKey !== featured && <span className="ml-1.5 text-[0.6875rem] font-bold text-amber-700">눌렀어요</span>}</p>
        <p className="text-[0.875rem] text-stone-600 leading-snug mt-0.5">{desc}</p>
        {sub && <p className="text-[0.75rem] text-stone-400 mt-0.5">{sub}</p>}
      </div>
      {mine && badgeKey && badgeKey !== featured && (
        <button onClick={() => pick(badgeKey)} disabled={!!picking} className="shrink-0 self-center px-2.5 py-1.5 rounded-full border border-amber-300 text-amber-800 text-[0.75rem] font-bold disabled:opacity-50">
          {picking === badgeKey ? '저장 중' : '대표로'}
        </button>
      )}
    </div>
  );
  // 이름 옆 뱃지는 글쓴이 단추(프로필 카드 열기) 안에 있어, 이 창 안의 누름(×·바깥)이 그 단추로 올라가면 닫힌 뒤 프로필 카드가 떴음(운영자 2026-11-06) → 누름을 여기서 멈추고 body 에 그림
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[96] bg-black/60 flex items-end sm:items-center justify-center animate-fade-in" onClick={e => { e.stopPropagation(); onClose(); }} role="dialog" aria-label={`${who}님의 뱃지`}>
      <div className="bg-white w-full sm:w-96 max-h-[80dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-[1.0625rem] font-bold text-stone-900">🏅 {who}님의 뱃지{total > 0 ? ` ${total}` : ''}</h3>
          <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 text-2xl leading-none" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100 pb-[env(safe-area-inset-bottom)]">
          {mine && !hidden && rows.length > 1 && <p className="px-4 py-2.5 text-[0.8125rem] text-stone-600 bg-stone-50">이름 옆에는 <b>대표 뱃지 하나</b>만 보여요. 바꾸려면 &lsquo;대표로&rsquo;를 누르세요.</p>}
          {clergy && item(`role:${clergy}`, <RoleIcon type={clergy} size={48} />, `인증된 ${BADGES[clergy].label}`, BADGES[clergy].desc + (clergy === 'admin' ? '' : ' 관리자가 직접 확인하고 달아 드린 인증 뱃지예요.'))}
          {!hidden && shownBadges(rows.map(r => r.badge_key)).map(sb => {
            const r = rows.find(x => x.badge_key === sb.key)!; const def = badgeOf(sb.key)!;
            const title = def.tier ? `${def.label} · ${TIERS[def.tier - 1].name}${sb.champion ? ` · 1등 (${sb.label})` : ''}` : def.label;
            const sub = def.tier ? `활동 등급 · ${fmtDate(r.created_at)} 이 등급이 됨${sb.champion ? ' · 지금 이 활동 1등이라 금 월계관' : ''}` : `${BADGE_GROUPS[def.group]} · ${fmtDate(r.created_at)} 받음${r.auto ? autoNote(sb.key) : ''}${r.note ? ` · “${r.note}”` : ''}`;
            return item(sb.key, <BadgeIcon badge={def} size={48} champion={sb.champion} />, title, def.desc, sub, sb.key);
          })}
          {ready && prof && total === 0 && <p className="p-8 text-center text-sm text-stone-400 leading-relaxed">{empty || '아직 받은 뱃지가 없어요.'}</p>}
          {(!ready || !prof) && total === 0 && <p className="p-8 text-center text-sm text-stone-400">불러오는 중…</p>}
          {!hidden && ready && (
            <button onClick={() => setBook(true)} className="w-full px-4 py-3 text-left text-[0.9375rem] font-bold text-amber-800 bg-[#fffaf0] flex items-center gap-2">📖 받은 뱃지 도장 모두 보기<span className="text-[0.75rem] font-normal text-stone-500">받은 날짜 · 예전에 받았던 뱃지도</span></button>
          )}
        </div>
      </div>
      {book && <StampBook userId={userId} name={who} mine={false} onClose={() => setBook(false)} />}
    </div>,
    document.body
  );
}

// 공간 머리의 뱃지 선반
export function BadgeShelf({ userId, admin, mine, onGrant }: { userId: string; admin: boolean; mine: boolean; onGrant?: () => void }) {
  const { rows, missing, hidden, setHidden, reload } = useMemberBadges(userId);
  const { stamps } = useBadgeStamps(userId, !missing);
  const [open, setOpen] = useState<Row | null>(null);
  const [book, setBook] = useState(false);
  const [list, setList] = useState(false);
  const [saving, setSaving] = useState(false);
  // 본인: 다른 교우에게 보일지 (기본 보임). 끄면 다른 교우의 화면(공간·프로필 카드)에서 안 보임
  const toggleHidden = async (show: boolean) => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ hide_badges: !show }).eq('id', userId);
    setSaving(false);
    if (error) { showAlert(`저장하지 못했어요\n${/hide_badges/.test(error.message) ? '뱃지 표(SQL)를 먼저 실행해야 해요.' : error.message}`); return; }
    setHidden(!show); toast(show ? '뱃지를 다른 교우에게 보여요' : '뱃지를 숨겼어요 · 나만 볼 수 있어요');
  };
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<string>).detail; if (d === userId || d === '*') reload(); };
    window.addEventListener('member-badges-changed', h);
    return () => window.removeEventListener('member-badges-changed', h);
  }, [userId, reload]);
  const revoke = async (row: Row) => {
    const def = badgeOf(row.badge_key)!;
    if (!(await askConfirm(`'${def.label}' 뱃지를 뗄까요?\n이 교우의 공간에서 사라져요.`))) return;
    const { error } = await supabase.from('member_badges').delete().eq('id', row.id);
    if (error) { showAlert(`뱃지를 떼지 못했어요\n${error.message}`); return; }
    setOpen(null); reload();
  };
  if (hidden && !mine && !admin) return null;
  if (rows.length === 0 && stamps.length === 0 && !(admin && !missing) && !mine) return null;
  if (rows.length === 0 && mine && missing) return null;
  // 한 줄로 (운영자 시안 2026-11-11): '내 뱃지 N' · '도장 N ›' · 보이기 단추 — 뱃지·도장은 누르면 창으로
  const pill = 'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 h-8 text-[0.8125rem] font-bold';
  const count = (n: number, tone: string) => <span className={`min-w-[1.375rem] h-[1.375rem] px-1.5 rounded-full text-[0.75rem] inline-flex items-center justify-center ${tone}`}>{n}</span>;
  const sep = <span className="w-px h-5 bg-stone-200 shrink-0" aria-hidden="true" />;
  return (
    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
      <button onClick={() => setList(true)} className={`${pill} bg-stone-100 text-stone-800`} aria-label={`${mine ? '내 ' : ''}뱃지 ${rows.length}개 보기`}>
        {rows[0] && (() => { const f = shownBadges(rows.map(r => r.badge_key))[0]; return f ? <BadgeIcon badge={f.key} size={20} champion={f.champion} /> : null; })()}{mine ? '내 뱃지' : '뱃지'}{count(rows.length, 'bg-emerald-100 text-emerald-800')}
        {hidden && !mine && <span className="font-normal text-stone-400 text-[0.6875rem]">(숨김)</span>}
      </button>
      {!missing && (stamps.length > 0 || mine) && (<>
        {sep}
        <button onClick={() => setBook(true)} className={`${pill} bg-[#fffaf0] border border-amber-200 text-amber-900`} aria-label="받은 뱃지 도장 모음 보기">
          <span aria-hidden="true">📖</span>도장{count(stamps.length, 'bg-amber-100 text-amber-900')}<span className="text-amber-700 text-base leading-none" aria-hidden="true">›</span>
        </button>
      </>)}
      {admin && !missing && <button onClick={onGrant} className={`${pill} bg-amber-50 border border-amber-200 text-amber-800 h-8 px-2.5 text-[0.75rem]`}>{mine ? '뱃지 관리' : '＋ 달기'}</button>}
      {mine && rows.length > 0 && (<>
        <span className="ml-auto" />
        <span className="shrink-0 inline-flex items-center gap-1 text-[0.6875rem] text-stone-600">
          {hidden ? '나만 보기' : <><span className="hidden min-[400px]:inline">다른 교우에게&nbsp;</span>보이기</>}
          <Switch size="sm" on={!hidden} busy={saving} onChange={toggleHidden} label="뱃지를 다른 교우에게 보이기" />
        </span>
      </>)}
      {list && <BadgeListDialog userId={userId} mine={mine} showHidden={mine || admin} onClose={() => setList(false)} empty={mine ? `아직 받은 뱃지가 없어요 · 공감을 많이 받거나 댓글·기도지향·건의 등 활동 1등(${AUTO_BADGE_MIN} 이상)이 되거나, 글 10편·출석 30일 같은 기준을 넘으면 저절로 달려요` : undefined} />}
      {/* 내 공간 머리 칸은 isolate(성당 그림) → 그 안에 그리면 창이 그 칸에 갇혀 아래 가톨릭 앱·아래 탭이 창 위로 올라왔음(루비로사 2026-11-11) → body 에 */}
      {open && createPortal(<BadgeDetail row={open} admin={admin} onClose={() => setOpen(null)} onRevoke={revoke} />, document.body)}
      {book && createPortal(<StampBook userId={userId} mine={mine} onClose={() => setBook(false)} />, document.body)}
    </div>
  );
}


// 이름 옆: 대표 뱃지 메달(크게, 테두리 밖에 따로) + 그 옆 글('공감 300', 1등이면 '소통왕')만 둥근 테두리로 (운영자 2026-11-14)
function BadgePill({ keys, size, onOpen }: { keys: string[]; size: number; onOpen: () => void }) {
  const first = shownBadges(keys)[0];
  if (!first) return null;
  const def = badgeOf(first.key)!;
  const [bg, bd, fg] = first.champion ? ['#fff8e1', '#f3d27a', '#7a4b00'] : def.tier ? TIERS[def.tier - 1].pill : ['#f5f5f4', '#e7e5e4', '#44403c'];
  const medal = Math.round(size * 1.4);
  return (
    <button type="button" onClick={e => { e.stopPropagation(); e.preventDefault(); onOpen(); }}
      className="inline-flex items-center gap-1 min-w-0" aria-label={`대표 뱃지 ${first.label}${first.champion ? ' 1등' : ''} · 뱃지 모두 보기`}>
      <BadgeIcon badge={def} size={medal} champion={first.champion} />
      <span className="truncate font-bold leading-none rounded-full border px-2 py-[0.2rem] max-w-[7.5rem]"
        style={{ background: bg, borderColor: bd, color: fg, fontSize: Math.max(10.5, Math.min(12.5, size * 0.62)) }}>{first.label}</span>
    </button>
  );
}

// 프로필 카드·목록 줄 (누르면 그 교우의 뱃지 모두 — 누구나)
export function BadgeRow({ userId, size = 22, className = '' }: { userId: string; size?: number; max?: number; className?: string }) {
  const { rows, hidden } = useMemberBadges(userId);
  const [open, setOpen] = useState(false);
  if (rows.length === 0 || hidden) return null;
  return (
    <span className={`inline-flex items-center ${className}`}>
      <BadgePill keys={rows.map(r => r.badge_key)} size={size} onOpen={() => setOpen(true)} />
      {open && <BadgeListDialog userId={userId} highlight={rows[0].badge_key} onClose={() => setOpen(false)} />}
    </span>
  );
}

// 이름 옆 (글·댓글·대화·목록 어디서나, lib/badge-map 에서 한 번에 받아 둔 것) — 대표 뱃지 하나, 누르면 그 교우의 뱃지 모두
export function NameBadges({ userId, size = 18, className = '' }: { userId?: string | null; size?: number; max?: number; className?: string }) {
  const map = useBadgeMap();
  const [open, setOpen] = useState(false);
  const keys = userId ? map[userId] : undefined;
  if (!userId || !keys || keys.length === 0) return null;
  return (
    <span className={`inline-flex items-center shrink-0 min-w-0 ${className}`}>
      <BadgePill keys={keys} size={size} onOpen={() => setOpen(true)} />
      {open && <BadgeListDialog userId={userId} highlight={keys[0]} onClose={() => setOpen(false)} />}
    </span>
  );
}

// 관리자: 뱃지마다 지금 1등(받은 교우) 현황
export function BadgeLeaderboard({ onClose, onOpenProfile }: { onClose: () => void; onOpenProfile: (id: string) => void }) {
  type Holder = { id: string; baptismal_name: string; avatar_url?: string | null; handle?: string | null; created_at: string; auto: boolean };
  const [byBadge, setByBadge] = useState<Record<string, Holder[]> | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('member_badges').select('user_id, badge_key, created_at, auto').order('created_at', { ascending: true });
      if (!alive) return;
      if (error) { setMissing(true); setByBadge({}); return; }
      const rows = (data || []) as { user_id: string; badge_key: string; created_at: string; auto: boolean }[];
      const ids = Array.from(new Set(rows.map(r => r.user_id)));
      const { data: profiles } = ids.length > 0 ? await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle').in('id', ids) : { data: [] };
      if (!alive) return;
      const pmap = new Map(((profiles || []) as { id: string; baptismal_name: string; avatar_url?: string | null; handle?: string | null }[]).map(p => [p.id, p]));
      const map: Record<string, Holder[]> = {};
      rows.forEach(r => { const p = pmap.get(r.user_id); if (!p || !badgeOf(r.badge_key)) return; (map[r.badge_key] ||= []).push({ ...p, created_at: r.created_at, auto: !!r.auto }); });
      setByBadge(map);
    })();
    return () => { alive = false; };
  }, []);
  const groups: BadgeGroup[] = ['love', 'giving', 'activity', 'help', 'milestone', 'honor'];
  return (
    <BottomSheet bare label="뱃지 1등 현황" onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-stone-100 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-[1.125rem] text-stone-900">🏆 뱃지 1등 현황</h2>
            <p className="text-[0.8125rem] text-stone-500 mt-0.5">뱃지마다 지금 달고 있는 교우 · 매일 아침·앱을 열 때 다시 계산해요 (관리자는 1등에서 뺌, {AUTO_BADGE_MIN} 이상일 때만)</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 text-2xl leading-none shrink-0" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {byBadge === null ? <p className="p-6 text-center text-sm text-stone-400">불러오는 중…</p> : missing ? (
            <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[0.875rem] text-amber-900">아직 뱃지 표가 없어요. <b>supabase/member-badges.sql</b> 을 실행해 주세요.</div>
          ) : groups.map(g => (
            <div key={g} className="mt-4">
              <p className="text-[0.8125rem] font-bold text-stone-500 mb-1.5">{BADGE_GROUPS[g]}</p>
              <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white overflow-hidden">
                {MEMBER_BADGES.filter(b => b.group === g && !b.retired && !b.tier).map(b => { const holders = byBadge[b.key] || []; return (
                  <div key={b.key} className="flex items-center gap-3 px-3 py-2.5">
                    <BadgeIcon badge={b} size={40} className={holders.length ? '' : 'opacity-40 grayscale'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.9375rem] font-bold text-stone-900">{b.label}{b.stat && <span className="ml-1 text-[0.75rem] font-normal text-stone-400">{b.permanent ? `${STAT_LABELS[b.stat]} ${b.threshold} 이상 · 달성 ${holders.length}명` : `${STAT_LABELS[b.stat]} 1등`}</span>}</p>
                      {holders.length === 0 ? <p className="text-[0.8125rem] text-stone-400">아직 아무도 없어요</p> : (
                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                          {holders.map(h => (
                            <button key={h.id} onClick={() => onOpenProfile(h.id)} className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[0.8125rem] font-bold text-amber-900">
                              {h.avatar_url ? <img src={h.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" /> : <span className="w-5 h-5 rounded-full bg-stone-200 text-[0.625rem] flex items-center justify-center text-stone-600">{(h.baptismal_name || '교').slice(0, 1)}</span>}
                              {h.baptismal_name}{!h.auto && <span className="text-[0.6875rem] font-normal text-amber-700">직접</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ); })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
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
  // 뱃지마다 지금 1등(달고 있는 교우) 이름 — 운영자 2026-11-06: 관리자 뱃지 창에서 누가 1등인지 보이게
  const [holders, setHolders] = useState<Record<string, { id: string; name: string }[]>>({});
  const [holdersTick, setHoldersTick] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('member_badges').select('user_id, badge_key').eq('auto', true);
      if (!alive || !data) return;
      const ids = Array.from(new Set((data as { user_id: string }[]).map(r => r.user_id)));
      const { data: profiles } = ids.length > 0 ? await supabase.from('profiles').select('id, baptismal_name').in('id', ids) : { data: [] };
      if (!alive) return;
      const names = new Map(((profiles || []) as { id: string; baptismal_name: string }[]).map(p => [p.id, p.baptismal_name]));
      const map: Record<string, { id: string; name: string }[]> = {};
      (data as { user_id: string; badge_key: string }[]).forEach(r => { (map[r.badge_key] ||= []).push({ id: r.user_id, name: names.get(r.user_id) || '교우' }); });
      setHolders(map);
    })();
    return () => { alive = false; };
  }, [holdersTick]);
  const [refreshing, setRefreshing] = useState(false);
  const refreshAuto = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/refresh-badges', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showAlert(`다시 계산하지 못했어요\n${json.error || res.status}`); return; }
      const n = (json.awarded || []).length;
      toast(n > 0 ? `1등 뱃지 ${n}개를 새로 달았어요` : '바뀐 1등이 없어요');
      reload(); notify(); setHoldersTick(t => t + 1);
    } finally { setRefreshing(false); }
  };
  const toggle = async (key: string) => {
    if (busy) return;
    const def = badgeOf(key)!;
    if (def.permanent) { showAlert(`'${def.label}'은 달성 도장이에요\n${STAT_LABELS[def.stat!]}이(가) ${def.threshold} 이상인 교우 모두에게 저절로 달리고, 한 번 받으면 떼지 않아요. 아래 '지금 다시 계산'으로 바로 맞출 수 있어요.`); return; }
    if (def.auto) { showAlert(`'${def.label}'은 저절로 달리는 뱃지예요\n${STAT_LABELS[def.stat!]} 1등인 교우에게 매일 아침 저절로 달리고, 1등이 바뀌면 옮겨 가요. 아래 '지금 다시 계산'으로 바로 맞출 수 있어요.`); return; }
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
  const groups: BadgeGroup[] = ['love', 'giving', 'activity', 'help', 'milestone', 'honor'];
  return (
    <BottomSheet bare label="뱃지 달기" onClose={onClose} z="z-[94]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-stone-100">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-[1.125rem] text-stone-900 truncate">🏅 {user.name}님 뱃지</h2>
            <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-500 text-2xl leading-none" aria-label="닫기">×</button>
          </div>
          <p className="text-[0.8125rem] text-stone-500 mt-0.5">활동 뱃지(🏆)는 그 활동 1등에게 저절로 달려요(매일 아침·앱을 열 때, {AUTO_BADGE_MIN} 이상일 때만). 달성 도장(📖)은 기준을 넘은 교우 모두에게 저절로, 떼지 않아요. 기념 뱃지는 누르면 달고, 다시 누르면 떼요. 달리면 교우에게 휴대폰 알림이 가요.</p>
          <button onClick={refreshAuto} disabled={refreshing || missing} className="mt-2 px-3 py-1.5 rounded-full bg-stone-900 text-white text-[0.8125rem] font-bold disabled:opacity-50">{refreshing ? '계산하는 중…' : '🔄 1등 뱃지 지금 다시 계산'}</button>
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
                {MEMBER_BADGES.filter(b => b.group === g && !b.retired && !b.tier).map(b => { const on = have.has(b.key); return (
                  <button key={b.key} onClick={() => toggle(b.key)} disabled={busy !== null} aria-pressed={on}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-colors ${on ? 'bg-amber-50 border-amber-300' : 'bg-white border-stone-200'} ${busy === b.key ? 'opacity-60' : ''}`}>
                    <BadgeIcon badge={b} size={52} className={on ? '' : 'opacity-80'} />
                    <span className="text-[0.8125rem] font-bold text-stone-800 leading-tight">{b.label}</span>
                    <span className="text-[0.6875rem] text-stone-500 leading-snug">{b.desc}</span>
                    {b.stat && stats && <span className="text-[0.6875rem] font-bold text-amber-700">{STAT_LABELS[b.stat]} {stats[b.stat] ?? 0}</span>}
                    {b.permanent ? (holders[b.key]?.length
                      ? <span className="text-[0.6875rem] font-bold text-stone-700 bg-stone-100 rounded-xl px-1.5 py-px">📖 {holders[b.key].length}명 달성</span>
                      : <span className="text-[0.6875rem] text-stone-400">📖 아직 없음</span>)
                    : b.auto && (holders[b.key]?.length
                      ? <span className="text-[0.6875rem] font-bold text-stone-700 bg-stone-100 rounded-xl px-1.5 py-px max-w-full text-center leading-snug">🏆 {holders[b.key].map(h => h.name).join(', ')}</span>
                      : <span className="text-[0.6875rem] text-stone-400">🏆 아직 없음</span>)}
                    {b.auto && <span className="absolute top-1.5 left-1.5 text-[0.625rem] font-bold text-stone-500 bg-stone-100 rounded-full px-1.5 py-px">{b.permanent ? `📖 ${STAT_LABELS[b.stat!]} ${b.threshold}` : '🏆 1등 자동'}</span>}
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
