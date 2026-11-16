'use client';

// 뱃지 모음 (운영자 2026-11-14 시안 '뱃지 홈 + 성장 목록 + 상세' 확정, 대표 뱃지 1개)
// 칩 넷: 홈(요약·대표 뱃지·다음 목표·최근 받은 뱃지·내 뱃지) · 활동 등급(6활동 진행 막대, 못 받은 것은 흐리게) · 1등(지금 1등 교우·내 기록) · 기념
// 뱃지를 누르면 상세(큰 뱃지·등급·설명·이 등급이 된 날·7단계 줄·다음까지 남은 수·대표로 정하기)
// 활동 숫자는 본인 것만 /api/badges/stats (lib/member-stats). 1등 교우는 member_badges(로그인한 교우는 모두 읽기)
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { BadgeIcon } from '@/components/BadgeIcon';
import { StampBook, useBadgeStamps, useMemberBadges } from '@/components/MemberBadges';
import { showAlert } from '@/components/ConfirmDialog';
import { toast } from '@/lib/chat-actions';
import { supabase } from '@/lib/supabase';
import { useBackLayer } from '@/lib/back-layers';
import { ADMIN_EMAILS } from '@/lib/admin';
import { LADDERS, MEMBER_BADGES, STAT_LABELS, TIERS, badgeOf, shownBadges, type MemberBadgeDef, type StatKey } from '@/lib/badges';

type Tab = 'home' | 'tiers' | 'champ' | 'honor';
type Holder = { id: string; name: string };
const fmt = (n: number) => n.toLocaleString('en-US');
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}.${d.getDate()}`; };
const ymd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

function TierTag({ def, champion }: { def: MemberBadgeDef; champion?: boolean }) {
  return (<>
    {def.tier && <span className="text-[0.6875rem] font-bold rounded-full border px-1.5 py-px" style={{ color: TIERS[def.tier - 1].pill[2], background: TIERS[def.tier - 1].pill[0], borderColor: TIERS[def.tier - 1].pill[1] }}>{TIERS[def.tier - 1].name}</span>}
    {champion && <span className="text-[0.6875rem] font-bold rounded-full border px-1.5 py-px text-[#7a4b00] bg-[#fff8e1] border-[#f3d27a]">1등</span>}
  </>);
}
const Bar = ({ pct, color = '#c9a24a', h = 'h-1.5' }: { pct: number; color?: string; h?: string }) => (
  <div className={`${h} rounded-full bg-[#efe9dc] overflow-hidden`}><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>
);

const TIER_COLOR_WORD = ['회색', '초록', '파랑', '빨강', '노랑', '금색', '무지개'];

export default function BadgeCollection({ userId, initialTab = 'home', onClose, onOpenProfile }: { userId: string; initialTab?: Tab | 'mine'; onClose: () => void; onOpenProfile?: (id: string) => void }) {
  const { rows, featured, setFeatured, reload } = useMemberBadges(userId);
  const { stamps } = useBadgeStamps(userId);
  const [tab, setTab] = useState<Tab>(initialTab === 'mine' ? 'home' : initialTab);
  const [stats, setStats] = useState<Partial<Record<StatKey, number>> | null>(null);
  const [holders, setHolders] = useState<Record<string, Holder[]>>({});
  const [pick, setPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [book, setBook] = useState(false);
  const [adminSelf, setAdminSelf] = useState(false); // 관리자는 1등에서만 빠짐, 활동 등급(달성 기록)은 받음 (운영자 2026-11-16)
  useBackLayer(true, onClose);
  useBackLayer(!!pick, () => setPick(null));
  const keys = useMemo(() => rows.map(r => r.badge_key), [rows]);
  const have = useMemo(() => new Set(keys), [keys]);
  const shown = useMemo(() => shownBadges(keys), [keys]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (session.user.id === userId && ADMIN_EMAILS.includes(session.user.email || '')) { if (alive) setAdminSelf(true); return; }
      const res = await fetch('/api/badges/stats', { headers: { authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      if (!alive || !res?.ok) return;
      setStats(await res.json().catch(() => null));
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('member_badges').select('user_id, badge_key').eq('auto', true).eq('permanent', false);
      const list = (data || []) as { user_id: string; badge_key: string }[];
      const ids = Array.from(new Set(list.map(r => r.user_id)));
      const { data: ps } = ids.length ? await supabase.from('profiles').select('id, baptismal_name').in('id', ids) : { data: [] };
      if (!alive) return;
      const names = new Map(((ps || []) as { id: string; baptismal_name: string }[]).map(p => [p.id, p.baptismal_name]));
      const out: Record<string, Holder[]> = {};
      list.forEach(r => { (out[r.badge_key] ||= []).push({ id: r.user_id, name: names.get(r.user_id) || '교우' }); });
      setHolders(out);
    })();
    return () => { alive = false; };
  }, []);

  // 활동마다 지금 등급·다음 단계
  const ladder = useMemo(() => LADDERS.map(L => {
    const held = keys.map(k => badgeOf(k)).filter(d => d?.family === L.id).map(d => d!.tier || 0);
    const count = stats?.[L.stat];
    const byCount = count === undefined ? 0 : L.steps.filter(n => count >= n).length;
    const cur = Math.max(held.length ? Math.max(...held) : 0, byCount);
    const next = cur < 7 ? L.steps[cur] : null;
    const prev = cur > 0 ? L.steps[cur - 1] : 0;
    const ratio = count === undefined || next === null ? 0 : (count - prev) / (next - prev);
    return { L, count, cur, next, prev, ratio, champ: have.has(L.champion) };
  }), [keys, stats, have]);
  const goals = ladder.filter(x => x.next !== null && x.count !== undefined).sort((a, b) => b.ratio - a.ratio).slice(0, 3);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return [...stamps].sort((a, b) => b.earned_at.localeCompare(a.earned_at)).filter(s => { if (seen.has(s.badge_key) || !badgeOf(s.badge_key)) return false; seen.add(s.badge_key); return true; }).slice(0, 4);
  }, [stamps]);
  const champs = MEMBER_BADGES.filter(b => b.auto && !b.permanent && !b.retired);
  const honors = MEMBER_BADGES.filter(b => (!b.auto && !b.tier && !b.retired) || b.key === 'm_year1');
  const total = LADDERS.length * 7 + champs.length + honors.length;
  const featuredShown = shown.find(s => s.key === featured) || shown[0];

  const choose = async (key: string) => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ featured_badge: key }).eq('id', userId);
    setSaving(false);
    if (error) { showAlert(`대표 뱃지를 저장하지 못했어요\n${/featured_badge/.test(error.message) ? '대표 뱃지 표(SQL)를 먼저 실행해야 해요.' : error.message}`); return; }
    setFeatured(key); reload();
    window.dispatchEvent(new CustomEvent('member-badges-changed', { detail: userId }));
    toast(`'${badgeOf(key)?.label}' 뱃지가 이름 옆에 보여요`);
  };

  const chip = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[0.8125rem] font-bold ${tab === t ? 'bg-[#1f2a44] text-white border-[#1f2a44]' : 'bg-white text-stone-700 border-[#e3dccb]'}`}>{label}</button>
  );
  const sec = (title: string, right?: ReactNode) => <div className="flex items-baseline justify-between mt-4 mb-2"><b className="text-[0.9375rem] text-[#1f2a44]">{title}</b>{right}</div>;
  const ladderRow = (x: typeof ladder[number]) => {
    const def = badgeOf(`t_${x.L.id}_${Math.max(1, x.cur)}`)!;
    const label = x.cur ? (x.champ ? badgeOf(x.L.champion)?.label || def.label : def.label) : `${x.L.short} ${fmt(x.L.steps[0])}${x.L.unit}`;
    return (
      <button key={x.L.id} onClick={() => setPick(def.key)} className={`w-full text-left flex items-center gap-2.5 rounded-2xl border p-2.5 ${x.cur ? 'bg-white border-[#eee5d2]' : 'bg-[#faf8f3] border-[#eee5d2]'}`}>
        <span className={x.cur ? '' : 'opacity-40 grayscale'}><BadgeIcon badge={def} size={54} champion={x.champ && x.cur > 0} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1 font-bold text-[0.9375rem] text-[#1f2a44]">{label} {x.cur > 0 && <TierTag def={def} champion={x.champ} />}</span>
          <span className="block text-[0.75rem] text-stone-500 mt-0.5">{STAT_LABELS[x.L.stat]} {x.count === undefined ? '…' : `${fmt(x.count)}${x.L.unit}`}{x.next !== null && x.count !== undefined ? ` · 다음 ${TIERS[x.cur].name}까지 ${fmt(Math.max(0, x.next - x.count))}${x.L.unit || '번'}` : x.next === null ? ' · 가장 높은 생명의 나무 등급 ✨' : ''}</span>
          <span className="block mt-1.5"><Bar pct={x.next === null ? 100 : x.ratio * 100} color={x.next === null ? '#9b6cf0' : '#c9a24a'} /></span>
        </span>
        <span className="w-14 text-right text-[0.75rem] font-bold text-stone-500">{x.cur === 0 ? '🔒' : x.next === null ? '✓' : x.count === undefined ? '' : `${fmt(x.count)}/${fmt(x.next)}`}</span>
      </button>
    );
  };

  // 상세
  const pickDef = pick ? badgeOf(pick) : null;
  const pickLadder = pickDef?.family ? ladder.find(x => x.L.id === pickDef.family) : undefined;
  const pickHave = pick ? have.has(pick) : false;
  const pickChampion = pickHave && (pickDef?.tier ? !!pickLadder?.champ : !!(pickDef?.auto && !pickDef.permanent));
  const pickRow = pick ? rows.find(r => r.badge_key === pick) : undefined;
  const pickLabel = pickDef ? (pickDef.tier && pickChampion ? badgeOf(pickLadder!.L.champion)?.label || pickDef.label : pickDef.label) : '';

  return createPortal(
    <BottomSheet bare label="뱃지 모음" onClose={onClose} z="z-[86]" tone="bg-[#fdfaf3]">
      <div className="shrink-0 px-5 pb-1 flex items-center gap-2">
        <h2 className="text-[1.25rem] font-bold text-[#1f2a44]">🏅 나의 뱃지</h2>
        <button onClick={() => setBook(true)} className="ml-auto text-[0.75rem] font-bold text-amber-800 bg-[#fffaf0] border border-amber-200 rounded-full px-3 py-1">📖 받은 기록</button>
        <button onClick={onClose} className="w-9 h-9 -mr-2 text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>
      </div>
      <div className="shrink-0 mx-4 mt-1 bg-white rounded-2xl shadow-[0_4px_16px_rgba(31,42,68,0.08)] flex divide-x divide-stone-100">
        {([['⭐ 받은 뱃지', shown.length], ['🏆 1등', shown.filter(s => s.champion).length], ['📖 전체', total]] as const).map(([t, n]) => (
          <div key={t} className="flex-1 text-center py-2"><small className="block text-[0.6875rem] text-stone-500">{t}</small><b className="text-[1.125rem] text-[#1f2a44]">{n}개</b></div>
        ))}
      </div>
      <div className="shrink-0 flex gap-1.5 px-4 pt-3 pb-1 overflow-x-auto [scrollbar-width:none]">{chip('home', '홈')}{chip('tiers', '활동 등급')}{chip('champ', '1등')}{chip('honor', '기념')}</div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {tab === 'home' && (<>
          {sec('대표 뱃지', <small className="text-[0.6875rem] text-stone-400">이름 옆에 보이는 하나</small>)}
          {featuredShown ? (() => { const d = badgeOf(featuredShown.key)!; return (
            <button onClick={() => setPick(featuredShown.key)} className="w-full text-left flex items-center gap-3 rounded-2xl border-[1.5px] border-[#ecd38a] bg-gradient-to-br from-[#fff8e1] to-white p-2.5">
              <BadgeIcon badge={d} size={78} champion={featuredShown.champion} />
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-bold text-[1.0625rem] text-[#1f2a44]">{featuredShown.label} <TierTag def={d} champion={featuredShown.champion} /></span>
                <span className="block text-[0.75rem] text-stone-500 mt-0.5">{d.desc}</span>
                <span className="block text-[0.6875rem] text-amber-800 font-bold mt-1">다른 뱃지로 바꾸려면 아래 내 뱃지를 누르세요</span>
              </span>
            </button>
          ); })() : <p className="text-sm text-stone-400 py-4 text-center">아직 받은 뱃지가 없어요 · 아래 다음 목표부터 시작해 보세요</p>}

          {goals.length > 0 && (<>
            {sec('🎯 다음 목표 · 거의 다 왔어요')}
            <div className="grid grid-cols-3 gap-2">
              {goals.map(x => { const d = badgeOf(`t_${x.L.id}_${x.cur + 1}`)!; return (
                <button key={x.L.id} onClick={() => setPick(d.key)} className="rounded-2xl border border-[#eee5d2] bg-white p-2 flex flex-col items-center">
                  <span className="opacity-45 grayscale"><BadgeIcon badge={d} size={46} /></span>
                  <b className="text-[0.75rem] text-[#1f2a44] mt-1 text-center leading-tight">{d.label}</b>
                  <small className="text-[0.6875rem] font-bold text-[#b07d10]">{fmt(Math.max(0, x.next! - x.count!))} 남음</small>
                  <span className="w-full mt-1"><Bar pct={x.ratio * 100} /></span>
                </button>
              ); })}
            </div>
          </>)}

          {recent.length > 0 && (<>
            {sec('최근 받은 뱃지', <button onClick={() => setBook(true)} className="text-[0.6875rem] text-stone-400">전체 보기 ›</button>)}
            <div className="grid grid-cols-4 gap-1">
              {recent.map(s => { const d = badgeOf(s.badge_key)!; return (
                <button key={s.id} onClick={() => setPick(s.badge_key)} className="flex flex-col items-center">
                  <BadgeIcon badge={d} size={50} />
                  <b className="text-[0.6875rem] text-[#1f2a44] mt-1 text-center leading-tight">{d.label}</b>
                  <small className="text-[0.625rem] text-stone-400">{md(s.earned_at)}</small>
                </button>
              ); })}
            </div>
          </>)}

          {sec(`내 뱃지 ${shown.length}`, <small className="text-[0.6875rem] text-stone-400">눌러서 대표로 정하기</small>)}
          <div className="grid grid-cols-3 gap-2">
            {shown.map(s => { const d = badgeOf(s.key)!; const isF = s.key === featured; return (
              <button key={s.key} onClick={() => setPick(s.key)} className={`relative rounded-2xl border p-2 pt-3 flex flex-col items-center gap-1 ${isF ? 'border-[#ecd38a] bg-[#fff8e1]' : 'border-[#eee5d2] bg-white'}`}>
                {isF && <span className="absolute top-1 left-1 text-[0.625rem] font-bold text-amber-800 bg-amber-100 rounded-full px-1.5">대표</span>}
                <BadgeIcon badge={d} size={56} champion={s.champion} />
                <span className="text-[0.75rem] font-bold text-[#1f2a44] text-center leading-tight">{s.label}</span>
              </button>
            ); })}
          </div>
        </>)}

        {adminSelf && <p className="mt-3 rounded-2xl bg-stone-100 px-3 py-2 text-[0.75rem] text-stone-600">관리자 계정은 활동 등급(달성 기록)은 받지만, 1등 순위에서는 빠져요 — 교우들의 1등에 영향을 주지 않아요.</p>}
        {tab === 'tiers' && (<div className="flex flex-col gap-2 mt-2">
          {/* 맨 위: 등급 색 일곱 가지를 차례로 — 어떤 색이 어떤 등급인지 (운영자 2026-11-16) */}
          <div className="rounded-2xl border-[1.5px] border-[#ecd38a] bg-gradient-to-br from-[#fff8e1] to-white p-3">
            <b className="text-[0.9375rem] text-[#1f2a44]">🌱 등급 색 · 겨자씨의 성장</b>
            <div className="mt-2 grid grid-cols-7 gap-0.5">
              {TIERS.map((t, i) => (
                <div key={t.name} className="flex flex-col items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/badges/3d/tier-${i + 1}.webp`} alt="" className="w-11 h-11 object-contain" draggable={false} />
                  <b className="mt-0.5 text-[0.6875rem] text-[#1f2a44] leading-tight text-center">{t.name}</b>
                  <small className="text-[0.5625rem] text-stone-500 leading-tight">{TIER_COLOR_WORD[i]}</small>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[0.6875rem] text-stone-500 leading-relaxed">왼쪽에서 오른쪽으로 갈수록 높은 등급이에요. 어느 활동이든 메달 색이 곧 등급이에요 (큰 나무·생명의 나무는 반짝여요).</p>
          </div>
          <p className="text-[0.75rem] text-stone-500">겨자씨 → 새싹 → 줄기 → 꽃 → 열매 → 큰 나무 → 생명의 나무 (겨자씨의 비유, 마태 13,31). 그 활동 1등이면 금 월계관이 둘러져요. 못 받은 활동은 흐리게 보여요.</p>
          {ladder.map(ladderRow)}
        </div>)}

        {tab === 'champ' && (<div className="flex flex-col gap-2 mt-2">
          <p className="text-[0.75rem] text-stone-500">그 활동을 가장 많이 한 교우에게 저절로(5 이상) 달리고, 1등이 바뀌면 옮겨 가요. 관리자는 빠져요.</p>
          {champs.map(b => { const hs = holders[b.key] || []; const mine = have.has(b.key); const my = b.stat ? stats?.[b.stat] : undefined; return (
            <div key={b.key} className={`rounded-2xl border p-2.5 flex items-center gap-2.5 ${mine ? 'border-[#ecd38a] bg-[#fff8e1]' : 'border-[#eee5d2] bg-white'}`}>
              <button onClick={() => setPick(b.key)} className={mine ? '' : 'opacity-40 grayscale'}><BadgeIcon badge={b} size={52} /></button>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#1f2a44] text-[0.9375rem]">{b.label}{mine ? <span className="ml-1.5 text-[0.6875rem] font-bold text-amber-800 bg-amber-100 rounded-full px-1.5 py-px">내가 1등</span> : <span className="ml-1 text-[0.75rem]">🔒</span>}</p>
                <p className="text-[0.75rem] text-stone-500 leading-snug">{b.desc}</p>
                <p className="text-[0.75rem] mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-stone-400">지금 1등</span>
                  {hs.length ? hs.map(h => <button key={h.id} onClick={() => onOpenProfile?.(h.id)} className="font-bold text-stone-800 bg-stone-100 rounded-full px-2 py-px">{h.name}</button>) : <span className="text-stone-400">아직 없어요</span>}
                  {b.stat && my !== undefined && <span className="ml-auto text-stone-500">내 기록 <b>{fmt(my)}</b></span>}
                </p>
              </div>
            </div>
          ); })}
        </div>)}

        {tab === 'honor' && (<div className="flex flex-col gap-2 mt-2">
          <p className="text-[0.75rem] text-stone-500">특별한 때에 받아 오래 간직하는 뱃지예요.</p>
          {honors.map(b => { const mine = have.has(b.key); return (
            <button key={b.key} onClick={() => setPick(b.key)} className={`text-left rounded-2xl border p-2.5 flex items-center gap-2.5 ${mine ? 'border-emerald-300 bg-emerald-50' : 'border-[#eee5d2] bg-[#faf8f3]'}`}>
              <span className={mine ? '' : 'opacity-40 grayscale'}><BadgeIcon badge={b} size={52} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[#1f2a44] text-[0.9375rem]">{b.label}{mine ? <span className="ml-1.5 text-[0.6875rem] font-bold text-emerald-800 bg-emerald-100 rounded-full px-1.5 py-px">받음</span> : <span className="ml-1 text-[0.75rem]">🔒</span>}</span>
                <span className="block text-[0.75rem] text-stone-500 leading-snug">{b.desc}</span>
                <span className="block text-[0.6875rem] text-stone-400 mt-0.5">{b.key === 'tester14' ? 'Play 테스트 앱으로 14일 출석을 모두 마치면 저절로' : b.key === 'm_year1' ? '가입한 지 1년이 되면 저절로' : '관리자가 달아 드려요'}</span>
              </span>
            </button>
          ); })}
        </div>)}
      </div>

      {pickDef && (
        <div className="fixed inset-0 z-[96] bg-black/55 flex items-end sm:items-center justify-center" onClick={() => setPick(null)} role="dialog" aria-label={`${pickLabel} 뱃지`}>
          <div className="relative bg-white w-full sm:w-96 max-h-[88dvh] overflow-y-auto rounded-t-[1.75rem] sm:rounded-3xl px-6 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPick(null)} className="absolute right-4 top-3 w-9 h-9 text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>
            <div className={`flex justify-center ${pickHave ? '' : 'opacity-45 grayscale'}`}><BadgeIcon badge={pickDef} size={124} champion={pickChampion} /></div>
            <h3 className="mt-2 text-[1.375rem] font-bold text-[#1f2a44]">{pickLabel}</h3>
            <div className="mt-1 flex justify-center gap-1"><TierTag def={pickDef} champion={pickChampion} /><span className="text-[0.6875rem] font-bold rounded-full border border-[#e3dccb] px-1.5 py-px text-stone-600">{pickDef.tier ? '활동 등급' : pickDef.auto && !pickDef.permanent ? '1등 뱃지' : '기념'}</span>{!pickHave && <span className="text-[0.6875rem] font-bold rounded-full border border-[#e3dccb] px-1.5 py-px text-stone-500">🔒 아직</span>}</div>
            <p className="mt-2 text-[0.875rem] text-stone-600 leading-relaxed">{pickDef.desc}</p>
            {pickRow && <div className="mt-3 flex justify-between rounded-2xl bg-[#fbf6ea] px-4 py-2.5 text-[0.875rem]"><span>📅 {pickDef.tier ? '이 등급이 된 날' : '받은 날'}</span><b>{ymd(pickRow.created_at)}</b></div>}
            {pickLadder && (
              <div className="mt-3 text-left">
                <b className="text-[0.875rem] text-[#1f2a44]">등급 단계</b>
                <div className="flex justify-between my-1.5">
                  {pickLadder.L.steps.map((n, i) => <span key={n} className={`flex flex-col items-center ${i < pickLadder.cur ? '' : 'opacity-30 grayscale'}`}><BadgeIcon badge={`t_${pickLadder.L.id}_${i + 1}`} size={32} /><span className="text-[0.5625rem] text-stone-500 mt-0.5">{fmt(n)}</span></span>)}
                </div>
                <Bar pct={pickLadder.next === null ? 100 : pickLadder.ratio * 100} h="h-2" color={pickLadder.next === null ? '#9b6cf0' : '#c9a24a'} />
                <p className="text-[0.75rem] text-stone-500 mt-1">{STAT_LABELS[pickLadder.L.stat]} {pickLadder.count === undefined ? '…' : `${fmt(pickLadder.count)}${pickLadder.L.unit}`}{pickLadder.next !== null && pickLadder.count !== undefined && <> · 다음 <b style={{ color: TIERS[pickLadder.cur].pill[2] }}>{TIERS[pickLadder.cur].name}</b>까지 {fmt(Math.max(0, pickLadder.next - pickLadder.count))}{pickLadder.L.unit || '번'}</>}</p>
              </div>
            )}
            {pickHave && (pick === featured
              ? <p className="mt-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-[0.9375rem] font-bold">★ 대표 뱃지예요</p>
              : <button disabled={saving} onClick={async () => { await choose(pick!); setPick(null); }} className="mt-4 w-full py-3 rounded-2xl bg-[#1f2a44] text-white text-[0.9375rem] font-bold disabled:opacity-50">{saving ? '저장 중' : '★ 대표 뱃지로 정하기'}</button>)}
          </div>
        </div>
      )}
      {book && <StampBook userId={userId} mine onClose={() => setBook(false)} />}
    </BottomSheet>,
    document.body,
  );
}
