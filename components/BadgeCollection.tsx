'use client';

// 뱃지 모음 (운영자 2026-11-14: '내 뱃지 고르기·가진 뱃지·1등 보기를 한곳에, 없는 뱃지도, 다음 등급까지 얼마나 남았는지도')
// 탭 넷: 내 뱃지(가진 것 + 대표 고르기) · 활동 등급(6가지 활동의 지금 등급과 다음 등급까지 남은 수) · 1등(누가 1등인지, 없는 것은 흐리게) · 기념
// 활동 숫자는 본인 것만 /api/badges/stats 에서 (lib/member-stats). 1등 교우는 member_badges(로그인한 교우는 모두 읽기)
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { BadgeIcon } from '@/components/BadgeIcon';
import { StampBook, useMemberBadges } from '@/components/MemberBadges';
import { showAlert } from '@/components/ConfirmDialog';
import { toast } from '@/lib/chat-actions';
import { supabase } from '@/lib/supabase';
import { useBackLayer } from '@/lib/back-layers';
import { LADDERS, MEMBER_BADGES, STAT_LABELS, TIERS, badgeOf, shownBadges, type StatKey } from '@/lib/badges';

type Tab = 'mine' | 'tiers' | 'champ' | 'honor';
type Holder = { id: string; name: string };
const fmt = (n: number) => n.toLocaleString('en-US');

export default function BadgeCollection({ userId, initialTab = 'mine', onClose, onOpenProfile }: { userId: string; initialTab?: Tab; onClose: () => void; onOpenProfile?: (id: string) => void }) {
  const { rows, featured, setFeatured, reload } = useMemberBadges(userId);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [stats, setStats] = useState<Partial<Record<StatKey, number>> | null>(null);
  const [holders, setHolders] = useState<Record<string, Holder[]>>({});
  const [pick, setPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [book, setBook] = useState(false);
  useBackLayer(true, onClose);
  useBackLayer(!!pick, () => setPick(null));
  const keys = useMemo(() => rows.map(r => r.badge_key), [rows]);
  const have = useMemo(() => new Set(keys), [keys]);
  const shown = useMemo(() => shownBadges(keys), [keys]);

  // 내 활동 숫자
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/badges/stats', { headers: { authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      if (!alive || !res?.ok) return;
      setStats(await res.json().catch(() => null));
    })();
    return () => { alive = false; };
  }, []);
  // 1등 교우
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

  const choose = async (key: string) => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ featured_badge: key }).eq('id', userId);
    setSaving(false);
    if (error) { showAlert(`대표 뱃지를 저장하지 못했어요\n${/featured_badge/.test(error.message) ? '대표 뱃지 표(SQL)를 먼저 실행해야 해요.' : error.message}`); return; }
    setFeatured(key); reload();
    window.dispatchEvent(new CustomEvent('member-badges-changed', { detail: userId }));
    toast(`'${badgeOf(key)?.label}' 뱃지가 이름 옆에 보여요`);
  };

  const champs = MEMBER_BADGES.filter(b => b.auto && !b.permanent && !b.retired);
  const honors = MEMBER_BADGES.filter(b => !b.auto && !b.tier && !b.retired || b.key === 'm_year1');
  const tabBtn = (t: Tab, label: string, n?: string) => (
    <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-xl text-[0.875rem] font-bold ${tab === t ? 'bg-stone-900 text-white' : 'text-stone-600'}`}>
      {label}{n && <span className={`ml-1 text-[0.75rem] ${tab === t ? 'text-white/70' : 'text-stone-400'}`}>{n}</span>}
    </button>
  );
  const pickDef = pick ? badgeOf(pick) : null;
  const pickChampion = pick ? shown.find(s => s.key === pick)?.champion : false;

  return createPortal(
    <BottomSheet bare label="뱃지 모음" onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="shrink-0 px-5 pb-2 flex items-center gap-2">
        <h2 className="text-[1.125rem] font-bold text-stone-900">🏅 뱃지 모음</h2>
        <span className="text-[0.8125rem] text-stone-500">받은 뱃지 {shown.length}</span>
        <button onClick={() => setBook(true)} className="ml-auto text-[0.8125rem] font-bold text-amber-800 bg-[#fffaf0] border border-amber-200 rounded-full px-3 py-1">📖 받은 기록</button>
        <button onClick={onClose} className="w-9 h-9 -mr-2 text-stone-400 text-2xl leading-none" aria-label="닫기">×</button>
      </div>
      <div className="shrink-0 mx-4 mb-2 p-1 rounded-2xl bg-stone-100 flex gap-1">
        {tabBtn('mine', '내 뱃지', String(shown.length))}{tabBtn('tiers', '활동 등급')}{tabBtn('champ', '1등')}{tabBtn('honor', '기념')}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {tab === 'mine' && (<>
          <p className="text-[0.8125rem] text-stone-500 mb-3">뱃지를 누르면 자세히 보고 <b>대표 뱃지</b>(이름 옆에 보이는 하나)로 정할 수 있어요.</p>
          {shown.length === 0 && <p className="py-10 text-center text-sm text-stone-400 leading-relaxed">아직 받은 뱃지가 없어요<br />&lsquo;활동 등급&rsquo; 탭에서 받는 법을 볼 수 있어요</p>}
          <div className="grid grid-cols-3 gap-2">
            {shown.map(s => { const d = badgeOf(s.key)!; const isF = s.key === featured; return (
              <button key={s.key} onClick={() => setPick(s.key)} className={`relative rounded-2xl border p-2 pt-3 flex flex-col items-center gap-1 ${isF ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
                {isF && <span className="absolute top-1 left-1 text-[0.625rem] font-bold text-amber-800 bg-amber-100 rounded-full px-1.5">대표</span>}
                <BadgeIcon badge={d} size={60} champion={s.champion} />
                <span className="text-[0.8125rem] font-bold text-stone-800 text-center leading-tight">{s.label}</span>
                {d.tier && <span className="text-[0.6875rem]" style={{ color: TIERS[d.tier - 1].pill[2] }}>{TIERS[d.tier - 1].name}{s.champion ? ' · 1등' : ''}</span>}
              </button>
            ); })}
          </div>
        </>)}

        {tab === 'tiers' && (<div className="flex flex-col gap-2.5">
          <p className="text-[0.8125rem] text-stone-500">활동이 쌓이면 일반 → 고급 → 희귀 → 영웅 → 전설 → 신화 → 유일 순서로 올라가요. 그 활동 1등이면 금 월계관이 둘러져요.</p>
          {LADDERS.map(L => {
            const held = keys.map(k => badgeOf(k)).filter(d => d?.family === L.id).map(d => d!.tier || 0);
            const count = stats?.[L.stat];
            const byCount = count === undefined ? 0 : L.steps.filter(n => count >= n).length;
            const cur = Math.max(held.length ? Math.max(...held) : 0, byCount);
            const next = cur < 7 ? L.steps[cur] : null;
            const prev = cur > 0 ? L.steps[cur - 1] : 0;
            const pct = count === undefined || next === null ? 100 : Math.max(0, Math.min(100, ((count - prev) / (next - prev)) * 100));
            const curDef = cur > 0 ? badgeOf(`t_${L.id}_${cur}`) : badgeOf(`t_${L.id}_1`);
            const champ = have.has(L.champion);
            return (
              <div key={L.id} className="rounded-2xl border border-stone-200 p-3">
                <div className="flex items-center gap-3">
                  <span className={cur === 0 ? 'opacity-35 grayscale' : ''}><BadgeIcon badge={curDef!} size={56} champion={champ && cur > 0} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-stone-900 text-[0.9375rem]">{L.short} <span className="text-[0.8125rem]" style={{ color: cur ? TIERS[cur - 1].pill[2] : '#a8a29e' }}>{cur ? TIERS[cur - 1].name : '아직 없음'}{champ ? ' · 1등' : ''}</span></p>
                    <p className="text-[0.8125rem] text-stone-600">{STAT_LABELS[L.stat]} <b>{count === undefined ? '…' : `${fmt(count)}${L.unit}`}</b></p>
                    {next !== null
                      ? <p className="text-[0.75rem] text-stone-500 mt-0.5">다음 <b style={{ color: TIERS[cur].pill[2] }}>{TIERS[cur].name}</b>까지 {count === undefined ? '…' : <b>{fmt(Math.max(0, next - count))}{L.unit || '번'} 남음</b>} ({fmt(next)}{L.unit})</p>
                      : <p className="text-[0.75rem] font-bold text-violet-700 mt-0.5">가장 높은 유일 등급이에요 ✨</p>}
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-stone-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: next !== null ? TIERS[cur].colors[1] : '#9b6cf0' }} /></div>
                <div className="mt-2 flex justify-between">
                  {L.steps.map((n, i) => (
                    <span key={n} className={`flex flex-col items-center ${i < cur ? '' : 'opacity-30 grayscale'}`} title={`${TIERS[i].name} ${fmt(n)}${L.unit}`}>
                      <BadgeIcon badge={`t_${L.id}_${i + 1}`} size={30} />
                      <span className="text-[0.625rem] text-stone-500 mt-0.5">{fmt(n)}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>)}

        {tab === 'champ' && (<div className="flex flex-col gap-2">
          <p className="text-[0.8125rem] text-stone-500">그 활동에서 가장 많이 한 교우에게 저절로 달리고(5 이상), 1등이 바뀌면 옮겨 가요. 관리자는 빠져요.</p>
          {champs.map(b => { const hs = holders[b.key] || []; const mine = have.has(b.key); const my = b.stat ? stats?.[b.stat] : undefined; return (
            <div key={b.key} className={`rounded-2xl border p-3 flex items-center gap-3 ${mine ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
              <span className={mine ? '' : 'opacity-40 grayscale'}><BadgeIcon badge={b} size={52} /></span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-stone-900 text-[0.9375rem]">{b.label}{mine && <span className="ml-1.5 text-[0.6875rem] font-bold text-amber-800 bg-amber-100 rounded-full px-1.5 py-px">내가 1등</span>}</p>
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

        {tab === 'honor' && (<div className="flex flex-col gap-2">
          <p className="text-[0.8125rem] text-stone-500">특별한 때에 받는 뱃지예요.</p>
          {honors.map(b => { const mine = have.has(b.key); return (
            <div key={b.key} className={`rounded-2xl border p-3 flex items-center gap-3 ${mine ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200'}`}>
              <span className={mine ? '' : 'opacity-40 grayscale'}><BadgeIcon badge={b} size={52} /></span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-stone-900 text-[0.9375rem]">{b.label}{mine && <span className="ml-1.5 text-[0.6875rem] font-bold text-emerald-800 bg-emerald-100 rounded-full px-1.5 py-px">받음</span>}</p>
                <p className="text-[0.75rem] text-stone-500 leading-snug">{b.desc}</p>
                <p className="text-[0.6875rem] text-stone-400 mt-0.5">{b.key === 'tester14' ? 'Play 테스트 앱으로 14일 출석을 모두 마치면 저절로' : b.key === 'm_year1' ? '가입한 지 1년이 되면 저절로' : '관리자가 달아 드려요'}</p>
              </div>
            </div>
          ); })}
        </div>)}
      </div>

      {pickDef && (
        <div className="fixed inset-0 z-[96] bg-black/60 flex items-center justify-center p-6" onClick={() => setPick(null)} role="dialog" aria-label={`${pickDef.label} 뱃지`}>
          <div className="bg-white rounded-3xl w-full max-w-xs p-6 flex flex-col items-center text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <BadgeIcon badge={pickDef} size={112} champion={!!pickChampion} />
            {pickDef.tier && <p className="mt-2 text-[0.8125rem] font-bold" style={{ color: TIERS[pickDef.tier - 1].pill[2] }}>{TIERS[pickDef.tier - 1].name} 등급{pickChampion ? ' · 1등' : ''}</p>}
            <h3 className="mt-1 text-[1.25rem] font-bold text-stone-900">{shown.find(s => s.key === pick)?.label || pickDef.label}</h3>
            <p className="mt-1.5 text-[0.9375rem] text-stone-600 leading-relaxed">{pickDef.desc}</p>
            <div className="mt-4 flex gap-2 w-full">
              {pick === featured
                ? <span className="flex-1 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[0.9375rem] font-bold">대표 뱃지예요</span>
                : <button disabled={saving} onClick={async () => { await choose(pick!); setPick(null); }} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-[0.9375rem] font-bold disabled:opacity-50">{saving ? '저장 중' : '대표로 정하기'}</button>}
              <button onClick={() => setPick(null)} className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-[0.9375rem] font-bold">닫기</button>
            </div>
          </div>
        </div>
      )}
      {book && <StampBook userId={userId} mine onClose={() => setBook(false)} />}
    </BottomSheet>,
    document.body,
  );
}
