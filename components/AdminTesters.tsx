'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IconBadge } from '@/components/Icon';
import { TESTER_GOAL } from '@/lib/android-test';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm } from '@/components/ConfirmDialog';
import { AttendDots } from '@/components/TesterAttendance';
import { ATTEND_DAYS, attendDates, attendDayNo, attendStreak, kstToday } from '@/lib/tester-attendance';

// 관리자 전용: 안드로이드 테스터 (운영자 2026-11-14 정리: '출석 잘 하는 분 / 설치했는데 안 들어오는 분 / 설치 안 된 분 / 새 신청'만)
// 출석 = 그날(한국 날짜) Play 테스트 앱으로 들어옴 — /api/admin/tester-activity 의 playDayList(접속 기록 app_kind='play') + tester_signups.play_opened_at
// 설치 = tester_signups.play_first_at(Play 테스트 앱을 처음 연 때, supabase/tester-installs.sql)
const ACTIVITY_SINCE = '2026-11-14T00:00:00+09:00';
interface Activity { lastSeen: string | null; days: number; playDays: number | null; playDayList?: string[]; lastPlay: string | null }
interface Signup { user_id: string; google_email: string; status: 'requested' | 'added'; created_at: string; play_first_at?: string | null; play_opened_at?: string | null }
interface Who { baptismal_name: string; handle?: string | null }
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (iso: string) => Math.round((Date.parse(kstDay(new Date().toISOString())) - Date.parse(kstDay(iso))) / 86400e3);
const agoLabel = (iso: string | null | undefined) => { if (!iso) return '없음'; const d = daysAgo(iso); return d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`; };
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const later = (a?: string | null, b?: string | null) => (!a ? b || null : !b ? a : a > b ? a : b);
// 지메일은 점(.)과 + 뒤를 무시하므로 비교할 때 같은 주소로 봄
const normEmail = (e: string) => { const [u, d = ''] = e.trim().toLowerCase().split('@'); return /^(gmail|googlemail)\.com$/.test(d) ? `${u.split('+')[0].replace(/\./g, '')}@gmail.com` : `${u}@${d}`; };

type Row = { s: Signup; days: string[]; lastPlay: string | null; lastSeen: string | null };

export default function AdminTesters({ onClose, sendPush, onPreviewAttend }: {
  onClose: () => void;
  sendPush: (type: 'tester_added', id: string) => void;
  onPreviewRestart?: () => void; // (예전) 테스트 다시 14일 안내 창 미리 보기 — 지금 화면에서는 안 씀
  onPreviewAttend?: () => void;  // 출석 도장 창 미리 보기 (components/TesterAttendance)
}) {
  const [list, setList] = useState<Signup[] | null>(null);
  const [who, setWho] = useState<Record<string, Who>>({});
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [installSetupNeeded, setInstallSetupNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<{ ids: string[]; text: string } | null>(null);

  const fetchList = async () => {
    const first = await supabase.from('tester_signups').select('user_id, google_email, status, created_at, play_first_at, play_opened_at').order('created_at', { ascending: false });
    const { data, error } = first.error // 설치 확인 칸 전(tester-installs.sql)
      ? await supabase.from('tester_signups').select('user_id, google_email, status, created_at').order('created_at', { ascending: false })
      : first;
    if (error) return { setupNeeded: true, installMissing: false, list: [] as Signup[], who: {} as Record<string, Who> };
    const rows = (data || []) as Signup[];
    const { data: profiles } = rows.length ? await supabase.from('profiles').select('id, baptismal_name, handle').in('id', rows.map(r => r.user_id)) : { data: [] };
    return { setupNeeded: false, installMissing: !!first.error, list: rows, who: Object.fromEntries((profiles || []).map(p => [p.id, { baptismal_name: p.baptismal_name, handle: p.handle }])) as Record<string, Who> };
  };
  const apply = (r: Awaited<ReturnType<typeof fetchList>>) => { setSetupNeeded(r.setupNeeded); setInstallSetupNeeded(r.installMissing); setList(r.list); setWho(r.who); };
  const reload = () => fetchList().then(apply);
  useEffect(() => { fetchList().then(apply); }, []);

  // 출석·접속 (접속 기록은 서버만 읽음)
  const [act, setAct] = useState<{ kindTracked: boolean; testers: Record<string, Activity> } | null>(null);
  const [actError, setActError] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/tester-activity?since=${encodeURIComponent(ACTIVITY_SINCE)}`, { headers: { Authorization: `Bearer ${session?.access_token}` } }).catch(() => null);
      const out = res && res.ok ? await res.json().catch(() => null) : null;
      if (out?.testers) setAct(out); else setActError(true);
    })();
  }, []);

  const today = kstToday();
  const dayNo = Math.min(ATTEND_DAYS, Math.max(1, attendDayNo(today)));
  const name = (s: Signup) => who[s.user_id]?.baptismal_name || '교우';

  // 네 무리로 나누기
  const rows: Row[] = (list || []).map(s => {
    const a = act?.testers[s.user_id];
    const days = [...new Set([...(a?.playDayList || []), ...(s.play_opened_at && kstDay(s.play_opened_at) >= attendDates()[0] ? [kstDay(s.play_opened_at)] : [])])].sort();
    return { s, days, lastPlay: later(a?.lastPlay, s.play_opened_at), lastSeen: a?.lastSeen || null };
  });
  const installed = (r: Row) => !!r.s.play_first_at || r.days.length > 0;
  const requested = rows.filter(r => r.s.status === 'requested');
  const added = rows.filter(r => r.s.status === 'added');
  const good = added.filter(r => installed(r) && r.lastPlay && daysAgo(r.lastPlay) <= 1)
    .sort((a, b) => b.days.length - a.days.length || attendStreak(b.days, today) - attendStreak(a.days, today));
  const absent = added.filter(r => installed(r) && !(r.lastPlay && daysAgo(r.lastPlay) <= 1))
    .sort((a, b) => (a.lastPlay || '').localeCompare(b.lastPlay || ''));
  const notInstalled = added.filter(r => !installed(r));
  // 설치는 했는데 예전 아이콘·인터넷 창으로만 들어오는 분 (가톨릭그램 접속이 Play 앱을 연 때보다 나중)
  const switchers = absent.filter(r => r.lastSeen && (!r.lastPlay || Date.parse(r.lastSeen) > Date.parse(r.lastPlay) + 2 * 3600e3));
  const stampedToday = added.filter(r => r.days.includes(today)).length;

  // ── 알림 보내기 (서버가 다시 골라 보냄) ──
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, { people: number; missed: string[] }>>({});
  const notify = async (type: 'tester_attend' | 'tester_remind' | 'tester_switch', count: number, question: string) => {
    if (sending || count === 0) return;
    if (!(await askConfirm(question))) return;
    setSending(type);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type, id: 'all' }),
      });
      const out = await res.json().catch(() => ({})) as { targets?: number; missed?: string[] };
      if (res.status === 409) { alert('설치 확인 SQL(tester-installs.sql)을 먼저 실행해야 보낼 수 있어요.'); return; }
      if (!res.ok || !out.missed) { alert('보내지 못했어요. 잠시 후 다시 해 주세요.'); return; }
      const missed = out.missed;
      setSent(p => ({ ...p, [type]: { people: (out.targets ?? count) - missed.length, missed } }));
    } finally { setSending(null); }
  };

  // ── 새 신청 → 구글 Play Console 에 올리고 '등록함' ──
  const copy = async (rs: Row[]) => {
    const text = rs.map(r => r.s.google_email).join(', ');
    setCopied({ ids: rs.map(r => r.s.user_id), text });
    try { await navigator.clipboard.writeText(text); } catch { /* 아래 글상자에서 직접 복사 */ }
  };
  const setAdded = async (ids: string[]) => {
    setBusy(true);
    const { error } = await supabase.from('tester_signups').update({ status: 'added' }).in('user_id', ids);
    setBusy(false);
    if (error) { alert('표시하지 못했어요. 잠시 후 다시 해 주세요.'); return; }
    ids.forEach(id => sendPush('tester_added', id));
    setCopied(null);
    reload();
  };
  const markCopied = async () => {
    const ids = (copied?.ids || []).filter(id => requested.some(r => r.s.user_id === id));
    if (ids.length === 0) return;
    if (!(await askConfirm(`Play Console 테스터 목록에 ${ids.length}명을 붙여넣고 저장하셨나요?\n'등록함'으로 표시하면 그분들께 설치 안내 알림이 가요.`))) return;
    await setAdded(ids);
  };
  const remove = async (s: Signup) => {
    if (!(await askConfirm(`${s.google_email} 신청을 지울까요?\nPlay Console 테스터 목록에서도 직접 빼 주세요.`))) return;
    const { error } = await supabase.from('tester_signups').delete().eq('user_id', s.user_id);
    if (error) { alert('지우지 못했어요.'); return; }
    reload();
  };

  // 구글 목록과 비교 (붙여넣은 목록은 이 기기에만)
  const [googleText, setGoogleText] = useState(() => { try { return localStorage.getItem('testerGoogleList') || ''; } catch { return ''; } }); // 창은 누른 뒤에만 열리므로 처음부터 읽어도 됨
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareDraft, setCompareDraft] = useState('');
  const googleSet = new Set((googleText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(normEmail));
  const hasGoogle = googleSet.size > 0;
  const inGoogle = (r: Row) => googleSet.has(normEmail(r.s.google_email));
  const saveGoogle = (text: string) => {
    setGoogleText(text); setCompareOpen(false);
    try { if (text) localStorage.setItem('testerGoogleList', text); else localStorage.removeItem('testerGoogleList'); } catch { /* 기억 못 함 */ }
  };
  const reqSorted = hasGoogle ? [...requested].sort((a, b) => Number(inGoogle(a)) - Number(inGoogle(b))) : requested;
  const notInGoogle = hasGoogle ? requested.filter(r => !inGoogle(r)) : requested;
  const inGoogleNotMarked = hasGoogle ? requested.filter(inGoogle) : [];

  // ── 그리기 도구 ──
  const person = (r: Row, body: React.ReactNode, right?: React.ReactNode) => (
    <div key={r.s.user_id} className="px-3.5 py-2.5 border-t border-stone-100 flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[0.875rem] font-bold text-stone-800 truncate">{name(r.s)}{who[r.s.user_id]?.handle && <span className="font-normal text-stone-400 text-[0.75rem]"> @{who[r.s.user_id]?.handle}</span>}</p>
        {body}
      </div>
      {right}
    </div>
  );
  const dots = (r: Row) => (
    <div className="mt-1 flex items-center gap-2">
      <AttendDots days={r.days} today={today} />
      <span className="w-12 shrink-0 text-right text-[0.6875rem] font-bold text-stone-500 tabular-nums">{r.days.length}/{dayNo}일</span>
    </div>
  );
  const section = (tone: string, title: string, desc: string, count: number, body: React.ReactNode, action?: React.ReactNode) => (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className={`px-3.5 py-3 ${tone}`}>
        <p className="text-[0.9375rem] font-bold">{title} <span className="tabular-nums">{count}명</span></p>
        <p className="text-[0.75rem] opacity-80 mt-0.5 leading-relaxed">{desc}</p>
        {action}
      </div>
      {count === 0 ? <p className="px-3.5 py-3 text-[0.8125rem] text-stone-400 border-t border-stone-100">없어요</p> : body}
    </div>
  );
  const sentLine = (k: string) => sent[k] ? (
    <p className="mt-1.5 text-[0.75rem] leading-relaxed"><b>✅ {sent[k].people}명에게 보냈어요</b>{sent[k].missed.length > 0 && <> · 알림을 꺼 두어 못 받은 분: <b>{sent[k].missed.map(id => who[id]?.baptismal_name || '교우').join(', ')}</b> (카카오톡으로 따로 알려 주세요)</>}</p>
  ) : null;
  const delBtn = (s: Signup) => <button onClick={() => remove(s)} className="text-[0.6875rem] text-stone-400 shrink-0 px-1 mt-0.5">지우기</button>;

  return (
    <BottomSheet bare label="안드로이드 테스터" onClose={onClose} z="z-[86]" tone="bg-stone-50">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 bg-white border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-stone-900 flex items-center gap-2"><IconBadge name="phone" tone="green" />안드로이드 테스터</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-2" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {list === null && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
          {setupNeeded && <p className="p-6 text-center text-sm text-stone-500">테스터 신청 기능을 준비 중이에요. (supabase/android-testers.sql 실행 필요)</p>}
          {list && !setupNeeded && (
            <>
              {/* 한눈에 */}
              <div className="bg-white border border-stone-200 rounded-2xl p-3.5">
                <p className="text-[0.75rem] font-bold text-stone-500">테스트 {dayNo}일째 / {ATTEND_DAYS}일 · 11월 14일~27일</p>
                <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                  {([['✅', '출석 잘 함', good.length, 'text-emerald-800 bg-emerald-50'], ['⚠️', '안 들어옴', absent.length, 'text-amber-800 bg-amber-50'], ['📱', '설치 안 됨', notInstalled.length, 'text-red-800 bg-red-50'], ['📝', '새 신청', requested.length, 'text-sky-800 bg-sky-50']] as const).map(([e, l, n, c]) => (
                    <div key={l} className={`rounded-xl py-2 ${c}`}><p className="text-lg font-bold tabular-nums leading-tight">{n}</p><p className="text-[0.6875rem] font-bold whitespace-nowrap">{e} {l}</p></div>
                  ))}
                </div>
                <p className="mt-2 text-[0.75rem] text-stone-600 leading-relaxed">오늘 도장 <b className="text-emerald-800">{stampedToday}명</b> · 구글 등록 {added.length}명 · 정식 출시는 {TESTER_GOAL}명 이상이 14일 동안{good.length < TESTER_GOAL && <> · 출석 잘 하는 분이 <b>{TESTER_GOAL - good.length}명</b> 더 필요해요</>}</p>
                {actError && <p className="mt-1 text-[0.75rem] text-red-600">출석 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
                {(installSetupNeeded || (act && !act.kindTracked)) && <p className="mt-1 text-[0.6875rem] text-stone-400">{installSetupNeeded ? '설치 확인 SQL(tester-installs.sql) 전이라 설치 여부를 알 수 없어요.' : '접속 기록 SQL(app-sessions-kind.sql) 전이라 출석은 마지막으로 Play 앱을 연 날만 보여요.'}</p>}
              </div>

              {section('bg-emerald-50 text-emerald-900', '✅ 출석 잘 하는 분', 'Play 테스트 앱으로 오늘이나 어제 들어온 분 (출석 많은 순)', good.length,
                good.map(r => person(r, <>{dots(r)}<p className="text-[0.6875rem] text-stone-400 mt-0.5">연속 {attendStreak(r.days, today)}일</p></>,
                  <span className="text-[0.6875rem] font-bold text-emerald-800 shrink-0 mt-0.5">{r.days.includes(today) ? '오늘 출석' : '어제 출석'}</span>)))}

              {section('bg-amber-50 text-amber-900', '⚠️ 설치했는데 안 들어오는 분', 'Play 테스트 앱은 깔았는데 이틀 이상 열지 않은 분 (오래된 순)', absent.length,
                absent.map(r => person(r, <>
                  {dots(r)}
                  <p className="text-[0.6875rem] text-stone-500 mt-0.5 leading-relaxed">
                    Play 앱 마지막 {agoLabel(r.lastPlay)}
                    {r.lastSeen && (!r.lastPlay || r.lastSeen > r.lastPlay) && <> · <b className="text-amber-800">가톨릭그램은 {agoLabel(r.lastSeen)} 접속 (예전 아이콘·인터넷 창으로 보는 중)</b></>}
                  </p>
                </>, <span className="text-[0.6875rem] font-bold text-red-700 shrink-0 mt-0.5">{agoLabel(r.lastPlay)}</span>)),
                absent.length > 0 && (
                  <>
                    <button onClick={() => notify('tester_attend', absent.length, `오늘 아직 Play 테스트 앱을 열지 않은 테스터에게 '오늘 출석 도장 찍으러 오세요' 알림을 보낼까요?\n이 칸 ${absent.length}명과 설치 안 된 분도 함께 받고, 오늘 이미 들어온 분께는 안 가요.`)}
                      disabled={!!sending} className="mt-2 w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-60">{sending === 'tester_attend' ? '보내는 중…' : '📣 출석 알림 보내기'}</button>
                    {sentLine('tester_attend')}
                    {switchers.length > 0 && (
                      <>
                        <button onClick={() => notify('tester_switch', switchers.length, `예전 아이콘·인터넷 창으로만 들어오는 ${switchers.length}명(${switchers.map(r => name(r.s)).join(', ')})에게만 'Play 테스트 앱으로 들어와 주세요' 안내를 보낼까요?\n알림을 누르면 앱에서 Play 테스트 앱 열기 단추가 있는 안내가 떠요.`)}
                          disabled={!!sending} className="mt-1.5 w-full py-2.5 rounded-xl border-2 border-amber-600 bg-white text-amber-800 text-sm font-bold disabled:opacity-60">{sending === 'tester_switch' ? '보내는 중…' : `📱 예전 아이콘으로 보는 ${switchers.length}명에게만 Play 앱 안내`}</button>
                        {sentLine('tester_switch')}
                      </>
                    )}
                  </>
                ))}

              {section('bg-red-50 text-red-900', '📱 앱 설치가 안 된 분', '구글에는 등록했는데 Play 테스트 앱을 한 번도 열지 않은 분', notInstalled.length,
                notInstalled.map(r => person(r, <>
                  <p className="text-[0.75rem] text-stone-600 break-all">{r.s.google_email}</p>
                  <p className="text-[0.6875rem] text-stone-400">{md(r.s.created_at)} 신청 · 가톨릭그램 접속 {agoLabel(r.lastSeen)}</p>
                </>, delBtn(r.s))),
                notInstalled.length > 0 && !installSetupNeeded && (
                  <>
                    <button onClick={() => notify('tester_remind', notInstalled.length, `설치가 안 된 ${notInstalled.length}명에게 설치 안내 알림을 보낼까요?`)}
                      disabled={!!sending} className="mt-2 w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60">{sending === 'tester_remind' ? '보내는 중…' : '📣 설치 안내 보내기'}</button>
                    {sentLine('tester_remind')}
                  </>
                ))}

              {section('bg-sky-50 text-sky-900', '📝 새 신청 (구글 등록 전)', "Play Console 테스터 목록에 이메일을 올리고 '등록함'으로 표시하면 설치 안내가 가요", requested.length,
                reqSorted.map(r => person(r, <>
                  <p className="text-[0.75rem] text-stone-600 break-all">{r.s.google_email}{!/@(gmail|googlemail)\.com$/i.test(r.s.google_email) && <span className="text-red-700 font-bold"> · 지메일 아님</span>}</p>
                  <p className="text-[0.6875rem] text-stone-400">{md(r.s.created_at)} 신청{hasGoogle && (inGoogle(r) ? <span className="text-emerald-700 font-bold"> · ✓ 구글 목록에 있음</span> : <span className="text-red-700 font-bold"> · 구글 목록에 없음</span>)}</p>
                </>, delBtn(r.s))),
                requested.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="flex gap-1.5">
                      <button onClick={() => copy(notInGoogle)} disabled={notInGoogle.length === 0} className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-[0.8125rem] font-bold disabled:opacity-40">{hasGoogle ? `구글에 없는 ${notInGoogle.length}명 이메일 복사` : `${requested.length}명 이메일 복사`}</button>
                      <button onClick={markCopied} disabled={!copied || busy} className="flex-1 py-2.5 rounded-xl bg-emerald-700 text-white text-[0.8125rem] font-bold disabled:opacity-40">&lsquo;등록함&rsquo;으로 표시</button>
                    </div>
                    {copied && <textarea readOnly value={copied.text} rows={2} onFocus={e => e.currentTarget.select()} className="w-full text-xs p-2 border border-stone-200 rounded-lg bg-white font-mono shrink-0" />}
                    {inGoogleNotMarked.length > 0 && (
                      <button onClick={async () => { if (await askConfirm(`구글 목록에 이미 있는 ${inGoogleNotMarked.length}명을 '등록함'으로 표시할까요?\n그분들께 설치 안내 알림이 가요.`)) await setAdded(inGoogleNotMarked.map(r => r.s.user_id)); }}
                        disabled={busy} className="w-full py-2 rounded-xl border border-emerald-700 bg-white text-emerald-800 text-[0.8125rem] font-bold">구글 목록에 이미 있는 {inGoogleNotMarked.length}명 &lsquo;등록함&rsquo;으로</button>
                    )}
                    <button onClick={() => { setCompareDraft(googleText); setCompareOpen(o => !o); }} className="self-start text-[0.75rem] font-bold text-sky-800 underline">🔍 {hasGoogle ? '구글 목록 다시 넣기' : '구글 Play 목록과 비교하기'}</button>
                    {compareOpen && (
                      <>
                        <textarea value={compareDraft} onChange={e => setCompareDraft(e.target.value)} rows={4} placeholder="Play Console 테스터 이메일 목록을 붙여넣어 주세요" className="w-full text-xs p-2 border border-stone-200 rounded-lg bg-white font-mono shrink-0" />
                        <div className="flex gap-1.5">
                          <button onClick={() => saveGoogle(compareDraft.trim())} disabled={!/@/.test(compareDraft)} className="flex-1 py-2 rounded-xl bg-sky-700 text-white text-[0.8125rem] font-bold disabled:opacity-40">비교하기</button>
                          {hasGoogle && <button onClick={() => saveGoogle('')} className="px-3 py-2 rounded-xl border border-stone-300 bg-white text-stone-600 text-[0.8125rem] font-bold">지우기</button>}
                        </div>
                      </>
                    )}
                  </div>
                ))}

              {onPreviewAttend && <button onClick={onPreviewAttend} className="self-center text-[0.75rem] text-stone-400 underline py-1">테스터가 보는 출석 도장 창 미리 보기</button>}
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
