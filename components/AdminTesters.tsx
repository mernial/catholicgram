'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IconBadge } from '@/components/Icon';
import { TESTER_GOAL } from '@/lib/android-test';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm } from '@/components/ConfirmDialog';
import { AttendDots } from '@/components/TesterAttendance';
import { ATTEND_DAYS, attendDayNo, attendStreak, kstToday } from '@/lib/tester-attendance';

// 관리자 전용: 안드로이드 테스터 신청 목록(최근 신청이 맨 위) → 이메일을 복사해 Play Console 테스터 목록에 붙여넣고, '등록함'으로 표시하면 신청자에게 알림
// play_first_at·play_opened_at: 그 교우가 Play 테스트 앱을 처음·마지막으로 연 때 (supabase/tester-installs.sql)
// 테스트 다시 14일이 시작된 날(구글 검토일 2026-11-14) — 이날부터 하루하루 들어왔는지 봄
const ACTIVITY_SINCE = '2026-11-14T00:00:00+09:00';
interface Activity { lastSeen: string | null; days: number; playDays: number | null; playDayList?: string[]; lastPlay: string | null; posts: number; comments: number; reactions: number; messages: number }
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (iso: string) => Math.round((Date.parse(kstDay(new Date().toISOString())) - Date.parse(kstDay(iso))) / 86400e3);
const agoLabel = (iso: string | null) => { if (!iso) return '들어온 적 없음'; const d = daysAgo(iso); return d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`; };
interface Signup { user_id: string; google_email: string; status: 'requested' | 'added'; created_at: string; play_first_at?: string | null; play_opened_at?: string | null }
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
interface Who { baptismal_name: string; handle?: string | null }

export default function AdminTesters({ onClose, sendPush, onPreviewRestart, onPreviewAttend }: {
  onClose: () => void;
  sendPush: (type: 'tester_added', id: string) => void;
  onPreviewRestart?: () => void; // 테스트 다시 14일 안내 창 미리 보기 (components/TesterRestartNotice)
  onPreviewAttend?: () => void;  // 출석 도장 창 미리 보기 (components/TesterAttendance)
}) {
  const [list, setList] = useState<Signup[] | null>(null);
  const [who, setWho] = useState<Record<string, Who>>({});
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [copied, setCopied] = useState<{ ids: string[]; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [installSetupNeeded, setInstallSetupNeeded] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindResult, setRemindResult] = useState<{ people: number; missed: string[] } | null>(null);
  const [lastRemindAt, setLastRemindAt] = useState<string | null>(null); // 이 휴대폰에서 마지막으로 보낸 때
  useEffect(() => { try { setLastRemindAt(localStorage.getItem('testerRemindAt')); } catch { /* 기억 못 함 */ } }, []);

  const fetchList = async () => {
    const first = await supabase.from('tester_signups').select('user_id, google_email, status, created_at, play_first_at, play_opened_at').order('created_at', { ascending: false });
    // 설치 확인 칸이 아직 없으면(tester-installs.sql 실행 전) 예전처럼
    const { data, error } = first.error
      ? await supabase.from('tester_signups').select('user_id, google_email, status, created_at').order('created_at', { ascending: false })
      : first;
    setInstallSetupNeeded(!!first.error);
    if (error) return { setupNeeded: true, list: [] as Signup[], who: {} };
    const rows = (data || []) as Signup[];
    const { data: profiles } = rows.length
      ? await supabase.from('profiles').select('id, baptismal_name, handle').in('id', rows.map(r => r.user_id))
      : { data: [] };
    return { setupNeeded: false, list: rows, who: Object.fromEntries((profiles || []).map(p => [p.id, { baptismal_name: p.baptismal_name, handle: p.handle }])) };
  };
  const apply = (r: Awaited<ReturnType<typeof fetchList>>) => { setSetupNeeded(r.setupNeeded); setList(r.list); setWho(r.who); };
  const reload = () => fetchList().then(apply);
  useEffect(() => { fetchList().then(apply); }, []);

  // 테스터마다 접속·활동 (서버 /api/admin/tester-activity — 접속 기록은 서버만 읽음). 기본은 다시 시작한 테스트(11월 14일)부터
  const [range, setRange] = useState<'restart' | 'week'>('restart');
  const [act, setAct] = useState<{ since: string; kindTracked: boolean; testers: Record<string, Activity> } | null>(null);
  const [actError, setActError] = useState(false);
  useEffect(() => {
    let off = false;
    (async () => {
      setAct(null); setActError(false);
      const since = range === 'restart' ? ACTIVITY_SINCE : new Date(Date.now() - 7 * 86400e3).toISOString();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/tester-activity?since=${encodeURIComponent(since)}`, { headers: { Authorization: `Bearer ${session?.access_token}` } }).catch(() => null);
      const out = res && res.ok ? await res.json().catch(() => null) : null;
      if (off) return;
      if (out?.testers) setAct(out); else setActError(true);
    })();
    return () => { off = true; };
  }, [range]);

  const pending = (list || []).filter(s => s.status === 'requested');
  const added = (list || []).filter(s => s.status === 'added');

  // Play Console 이메일 목록 칸에는 쉼표로 이어 붙여넣으면 한 번에 들어간다
  const copy = async (rows: Signup[]) => {
    const text = rows.map(r => r.google_email).join(', ');
    setCopied({ ids: rows.map(r => r.user_id), text });
    try { await navigator.clipboard.writeText(text); } catch { /* 아래 글상자에서 직접 복사 */ }
  };

  const markAdded = async () => {
    if (!copied) return;
    const ids = copied.ids.filter(id => pending.some(p => p.user_id === id));
    if (ids.length === 0) return;
    if (!(await askConfirm(`Play Console 테스터 목록에 ${ids.length}명을 붙여넣고 저장하셨나요?\n비공개 테스트 검토도 끝나 '게시됨'인가요?\n'등록함'으로 표시하면 그분들께 설치 안내 알림이 가요.`))) return;
    await setAdded(ids);
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

  // 구글 Play Console 테스터 목록과 비교 (운영자 2026-11-14): 붙여넣은 이메일 목록은 이 기기에만 기억 — 구글 목록에 아직 없는 신청자를 맨 위로
  const [googleText, setGoogleText] = useState('');
  const [googleAt, setGoogleAt] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareDraft, setCompareDraft] = useState('');
  useEffect(() => { try { setGoogleText(localStorage.getItem('testerGoogleList') || ''); setGoogleAt(localStorage.getItem('testerGoogleListAt')); } catch { /* 기억 못 함 */ } }, []);
  // 지메일은 점(.)과 + 뒤를 무시하므로 비교할 때 같은 주소로 봄
  const normEmail = (e: string) => { const [u, d = ''] = e.trim().toLowerCase().split('@'); return /^(gmail|googlemail)\.com$/.test(d) ? `${u.split('+')[0].replace(/\./g, '')}@gmail.com` : `${u}@${d}`; };
  const googleEmails = [...new Set((googleText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(normEmail))];
  const googleSet = new Set(googleEmails);
  const hasGoogle = googleSet.size > 0;
  const inGoogle = (r: Signup) => googleSet.has(normEmail(r.google_email));
  const saveGoogle = (text: string) => {
    const at = new Date().toISOString();
    setGoogleText(text); setGoogleAt(text ? at : null); setCompareOpen(false);
    try { if (text) { localStorage.setItem('testerGoogleList', text); localStorage.setItem('testerGoogleListAt', at); } else { localStorage.removeItem('testerGoogleList'); localStorage.removeItem('testerGoogleListAt'); } } catch { /* 기억 못 함 */ }
  };
  // 목록 순서: 구글 목록을 붙여넣었으면 '구글 목록에 없음' 먼저, 아니면 '신청함' 먼저 — 그 안에서는 최근 신청 순(불러온 순서 그대로)
  const sorted = (list || []).map((r, i) => ({ r, i, k: hasGoogle ? (inGoogle(r) ? 1 : 0) : (r.status === 'requested' ? 0 : 1) })).sort((a, b) => a.k - b.k || a.i - b.i).map(x => x.r);
  const notInGoogle = hasGoogle ? (list || []).filter(r => !inGoogle(r)) : [];
  const inGoogleNotMarked = hasGoogle ? pending.filter(inGoogle) : [];
  const signupSet = new Set((list || []).map(r => normEmail(r.google_email)));
  const googleOnly = hasGoogle ? googleEmails.filter(e => !signupSet.has(e)) : [];
  const markInGoogle = async () => {
    const ids = inGoogleNotMarked.map(r => r.user_id);
    if (ids.length === 0 || busy) return;
    if (!(await askConfirm(`구글 목록에 이미 있는 ${ids.length}명을 '등록함'으로 표시할까요?\n그분들께 설치 안내 알림이 가요.`))) return;
    await setAdded(ids);
  };

  // 구글 검토가 끝나기 전에 '등록함'으로 알렸으면, 게시된 뒤 등록한 분들께 설치 안내를 한 번 더 보낸다
  const resend = async () => {
    if (added.length === 0 || resent) return;
    if (!(await askConfirm(`Play Console 게시 개요에서 비공개 테스트가 '게시됨'인가요?\n구글에 등록한 ${added.length}명에게 설치 안내 알림을 다시 보낼까요?`))) return;
    added.forEach(s => sendPush('tester_added', s.user_id));
    setResent(true);
  };

  // 구글에 등록했는데 아직 Play 테스트 앱을 한 번도 열지 않은 분들께만 설치 안내 (서버가 다시 골라서 보냄: /api/push/notify tester_remind)
  const notInstalled = added.filter(s => !s.play_first_at);
  const remind = async () => {
    if (reminding || notInstalled.length === 0) return;
    if (!(await askConfirm(`아직 설치 확인이 안 된 ${notInstalled.length}명에게 설치 안내 알림을 보낼까요?\nPlay 스토어 테스트 앱을 한 번도 열지 않은 분들이에요. 이미 설치한 ${installed.length}명에게는 가지 않아요.`))) return;
    setReminding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type: 'tester_remind', id: 'all' }),
      });
      const out = await res.json().catch(() => ({})) as { targets?: number; missed?: string[]; error?: string };
      if (!res.ok || !out.missed) { alert('보내지 못했어요. 잠시 후 다시 해 주세요.'); return; }
      const now = new Date().toISOString();
      try { localStorage.setItem('testerRemindAt', now); } catch { /* 기억 못 함 */ }
      setLastRemindAt(now);
      setRemindResult({ people: (out.targets ?? notInstalled.length) - out.missed.length, missed: out.missed });
    } finally { setReminding(false); }
  };
  // 테스트 다시 14일(2026-11-14): 구글 '등록함' 테스터 모두에게 알림 — 자세한 안내는 앱을 열면 어느 앱인지에 따라 다르게 뜸
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<{ people: number; missed: string[] } | null>(null);
  const restart = async () => {
    if (restarting || added.length === 0) return;
    if (!(await askConfirm(`구글에 등록한 ${added.length}명에게 '테스트가 14일 더 이어져요' 알림을 보낼까요?\n알림을 누르면 앱이 열리고, Play 테스트 앱인지 예전 아이콘인지에 따라 맞는 안내가 떠요. 잘 깔아 둔 분께는 '이 앱은 지우지 마세요'만 보여요.`))) return;
    setRestarting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type: 'tester_restart', id: 'all' }),
      });
      const out = await res.json().catch(() => ({})) as { targets?: number; missed?: string[] };
      if (!res.ok || !out.missed) { alert('보내지 못했어요. 잠시 후 다시 해 주세요.'); return; }
      setRestartResult({ people: (out.targets ?? added.length) - out.missed.length, missed: out.missed });
    } finally { setRestarting(false); }
  };
  // 출석 도장(lib/tester-attendance): 오늘 아직 Play 테스트 앱을 안 연 '등록함' 테스터에게 알림
  const [attending, setAttending] = useState(false);
  const [attendResult, setAttendResult] = useState<{ people: number; missed: string[] } | null>(null);
  const attendRemind = async (count: number) => {
    if (attending || count === 0) return;
    if (!(await askConfirm(`오늘 아직 도장을 안 찍은 ${count}명에게 '오늘 출석 도장 찍으러 오세요' 알림을 보낼까요?`))) return;
    setAttending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type: 'tester_attend', id: 'all' }),
      });
      const out = await res.json().catch(() => ({})) as { targets?: number; missed?: string[] };
      if (res.status === 409) { alert('설치 확인 SQL(tester-installs.sql)을 먼저 실행해야 보낼 수 있어요.'); return; }
      if (!res.ok || !out.missed) { alert('보내지 못했어요. 잠시 후 다시 해 주세요.'); return; }
      setAttendResult({ people: (out.targets ?? count) - out.missed.length, missed: out.missed });
    } finally { setAttending(false); }
  };
  const when = (iso: string) => { const d = new Date(iso); return `${md(iso)} ${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };

  const remove = async (s: Signup) => {
    if (!(await askConfirm(`${s.google_email} 신청을 지울까요?\nPlay Console 테스터 목록에서도 직접 빼 주세요.`))) return;
    const { error } = await supabase.from('tester_signups').delete().eq('user_id', s.user_id);
    if (error) { alert('지우지 못했어요.'); return; }
    reload();
  };

  const total = list?.length || 0;
  // Play 테스트 앱을 실제로 연 테스터 (구글은 '테스터 되기'를 누른 사람 12명 이상이 14일 동안 참여해야 정식 출시 신청을 받음)
  const installed = (list || []).filter(s => s.play_first_at).sort((a, b) => +new Date(a.play_first_at!) - +new Date(b.play_first_at!));
  const readyOn = installed.length >= TESTER_GOAL ? new Date(+new Date(installed[TESTER_GOAL - 1].play_first_at!) + 14 * 86400e3) : null;
  return (
    <BottomSheet bare label="안드로이드 테스터 신청 목록" onClose={onClose} z="z-[86]" tone="bg-stone-50">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 bg-white border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-stone-900 flex items-center gap-2"><IconBadge name="phone" tone="green" />안드로이드 테스터 신청</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-2" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {list === null && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
          {setupNeeded && (
            <p className="p-6 text-center text-sm text-stone-500 leading-relaxed">테스터 신청 기능을 준비 중이에요.<br /><span className="text-xs">(Supabase에서 <code>supabase/android-testers.sql</code> 실행 필요)</span></p>
          )}
          {list && !setupNeeded && (
            <>
              <div className="bg-white border border-stone-200 rounded-2xl p-3.5">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-bold text-stone-800">신청 {total}명 <span className="font-normal text-stone-500">· 구글 등록 {added.length}명</span></p>
                  <p className="text-xs text-stone-500">{total >= TESTER_GOAL ? '목표 달성 🎉' : `${TESTER_GOAL}명까지 ${TESTER_GOAL - total}명 남음`}</p>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (total / TESTER_GOAL) * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-stone-500">빠지는 분이 있을 수 있어 15~20명이면 안전해요.</p>
                <div className="mt-3 pt-3 border-t border-stone-100">
                  {installSetupNeeded ? (
                    <p className="text-xs text-stone-500 leading-relaxed">📱 앱 설치 확인은 Supabase 에서 <code>supabase/tester-installs.sql</code> 을 실행한 뒤부터 보여요.</p>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-bold text-stone-800">📱 앱 설치 확인 {installed.length}명 <span className="font-normal text-stone-500">· 구글 등록 {added.length}명 중</span></p>
                        <p className="text-xs text-stone-500">{installed.length >= TESTER_GOAL ? '12명 달성 🎉' : `${TESTER_GOAL}명까지 ${TESTER_GOAL - installed.length}명`}</p>
                      </div>
                      <div className="mt-2 h-2.5 rounded-full bg-stone-100 overflow-hidden">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (installed.length / TESTER_GOAL) * 100)}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs text-stone-500 leading-relaxed">
                        {readyOn
                          ? <>12번째 분이 {md(installed[TESTER_GOAL - 1].play_first_at!)}에 설치했어요 → <b>{md(readyOn.toISOString())}쯤</b>부터 정식 출시를 신청할 수 있어요 (그동안 지우지 않으면)</>
                          : <>Play 스토어 테스트 앱을 열면 저절로 표시돼요. 12명이 설치한 날부터 14일 뒤 정식 출시를 신청할 수 있어요.</>}
                      </p>
                      {notInstalled.length > 0 && !remindResult && (
                        <button onClick={remind} disabled={reminding} className="mt-2.5 w-full py-2.5 rounded-xl bg-sky-600 text-white text-sm font-bold disabled:bg-stone-300">
                          {reminding ? '보내는 중…' : `📣 설치 안 한 ${notInstalled.length}명에게만 설치 안내 보내기`}
                        </button>
                      )}
                      {remindResult && (
                        <div className="mt-2.5 rounded-xl bg-sky-50 border border-sky-200 p-2.5 text-xs text-sky-900 leading-relaxed">
                          <p className="font-bold">✅ {remindResult.people}명에게 설치 안내 알림을 보냈어요</p>
                          {remindResult.missed.length > 0 && (
                            <p className="mt-1 text-stone-700">알림을 꺼 두어 못 받은 분 {remindResult.missed.length}명: <b>{remindResult.missed.map(id => who[id]?.baptismal_name || '교우').join(', ')}</b><br />카카오톡이나 메시지로 따로 알려 주세요.</p>
                          )}
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-stone-100">
                        <p className="text-sm font-bold text-stone-800">🔁 테스트 14일 더 (11월 29일까지)</p>
                        <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">테스터가 앱을 열면 안내 창이 저절로 떠요. Play 테스트 앱으로 연 분께는 &lsquo;이 앱은 지우지 마세요&rsquo;, 예전 아이콘·인터넷 창으로 연 분께는 &lsquo;Play 테스트 앱 열기&rsquo;, 설치 전인 분께는 설치 방법만 보여요.</p>
                        <div className="mt-2 flex gap-2">
                          {onPreviewRestart && <button onClick={onPreviewRestart} className="flex-1 py-2.5 rounded-xl border border-emerald-300 bg-white text-emerald-900 text-sm font-bold">안내 창 미리 보기</button>}
                          {!restartResult && (
                            <button onClick={restart} disabled={restarting || added.length === 0} className="flex-1 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:bg-stone-300">
                              {restarting ? '보내는 중…' : `📣 ${added.length}명에게 알림`}
                            </button>
                          )}
                        </div>
                        {restartResult && (
                          <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-900 leading-relaxed">
                            <p className="font-bold">✅ {restartResult.people}명에게 알림을 보냈어요</p>
                            {restartResult.missed.length > 0 && (
                              <p className="mt-1 text-stone-700">알림을 꺼 두어 못 받은 분 {restartResult.missed.length}명: <b>{restartResult.missed.map(id => who[id]?.baptismal_name || '교우').join(', ')}</b><br />카카오톡으로 &lsquo;가톨릭그램 앱을 한 번 열어 안내를 봐 주세요&rsquo;라고 알려 주세요.</p>
                            )}
                          </div>
                        )}
                      </div>
                      {lastRemindAt && !remindResult && <p className="mt-1 text-[0.6875rem] text-stone-400 text-center">이 휴대폰에서 마지막으로 보낸 때: {when(lastRemindAt)}</p>}
                    </>
                  )}
                </div>
              </div>

              <div className="bg-white border border-stone-200 rounded-2xl p-3.5 flex flex-col gap-2">
                <p className="text-sm font-bold text-stone-800">새 신청 {pending.length}명 등록하기</p>
                <ol className="text-xs text-stone-600 leading-relaxed list-decimal pl-4">
                  <li>아래 <b>새 신청 이메일 복사</b>를 눌러요</li>
                  <li>Play Console → 비공개 테스트 → <b>테스터</b> → 이메일 목록에 <b>붙여넣고 저장</b>해요 (목록 앞 <b>☑ 체크</b>도 확인)</li>
                  <li>Play Console <b>게시 개요</b>에서 검토가 끝나 <b>게시됨</b>인지 확인해요 (검토 전에 알리면 신청자에게 &lsquo;App not available&rsquo;이 떠요)</li>
                  <li>여기서 <b>&lsquo;등록함&rsquo;으로 표시</b>를 누르면 신청자에게 설치 안내 알림이 가요</li>
                </ol>
                <div className="flex gap-2">
                  <button onClick={() => copy(pending)} disabled={pending.length === 0} className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:bg-stone-300">새 신청 이메일 복사</button>
                  <button onClick={markAdded} disabled={!copied || busy || !copied.ids.some(id => pending.some(p => p.user_id === id))} className="flex-1 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:bg-stone-300">&lsquo;등록함&rsquo;으로 표시</button>
                </div>
                {total > 0 && <button onClick={() => copy(list)} className="self-start text-xs text-stone-500 underline">전체 {total}명 이메일 복사</button>}
                {added.length > 0 && (
                  <button onClick={resend} disabled={resent} className="w-full py-2.5 rounded-xl border border-emerald-700 text-emerald-800 text-sm font-bold disabled:border-stone-200 disabled:text-stone-400">
                    {resent ? `${added.length}명에게 설치 안내를 다시 보냈어요` : `등록한 ${added.length}명에게 설치 안내 다시 보내기`}
                  </button>
                )}
                {copied && (
                  <>
                    <p className="text-xs text-emerald-700 font-bold">복사했어요 ({copied.ids.length}명). 복사가 안 됐으면 아래 글을 길게 눌러 직접 복사해요.</p>
                    <textarea readOnly value={copied.text} rows={3} onFocus={e => e.currentTarget.select()} className="w-full text-xs p-2 border border-stone-200 rounded-lg bg-stone-50 font-mono" />
                  </>
                )}
              </div>

              <div className="bg-white border border-stone-200 rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-stone-800">👀 테스터 접속·활동</p>
                  <div className="flex rounded-full bg-stone-100 p-0.5 text-[0.75rem] font-bold">
                    {([['restart', '11월 14일부터'], ['week', '최근 7일']] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setRange(k)} className={`px-2.5 py-1 rounded-full ${range === k ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                {!act && !actError && <p className="mt-2 text-xs text-stone-400">불러오는 중…</p>}
                {actError && <p className="mt-2 text-xs text-red-600">접속 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
                {act && (() => {
                  const rows = added.map(s => ({ s, a: act.testers[s.user_id] }));
                  const recentPlay = rows.filter(({ s, a }) => { const lp = a?.lastPlay || s.play_opened_at; return lp && daysAgo(lp) <= 1; }).length;
                  const recentAny = rows.filter(({ a }) => a?.lastSeen && daysAgo(a.lastSeen) <= 1).length;
                  const away = rows.filter(({ a }) => !a?.lastSeen || daysAgo(a.lastSeen) > 3);
                  return (
                    <div className="mt-2 text-xs text-stone-600 leading-relaxed">
                      <p>구글 등록 {added.length}명 중 <b className="text-emerald-800">오늘·어제 Play 앱으로 들어온 분 {recentPlay}명</b> · 어느 앱으로든 들어온 분 {recentAny}명</p>
                      {away.length > 0 && <p className="mt-1 text-red-700">3일 넘게 안 들어온 분 {away.length}명: <b>{away.map(({ s }) => who[s.user_id]?.baptismal_name || '교우').join(', ')}</b></p>}
                      <p className="mt-1 text-[0.6875rem] text-stone-400">줄 색깔: 초록 = 오늘·어제 들어옴 · 노랑 = 2~3일 전 · 빨강 = 3일 넘게 안 들어옴.{!act.kindTracked && ' Play 앱으로 들어온 날 수는 SQL(app-sessions-kind.sql)을 실행한 뒤부터 세요. 그 전에는 Play 앱을 마지막으로 연 때만 보여요.'} 구글은 Play 스토어로 깐 앱을 연 기록만 세요.</p>
                    </div>
                  );
                })()}
              </div>

              {added.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                  <div className="p-3.5 pb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-stone-800">📅 테스터 출석부 <span className="font-normal text-stone-400 text-xs">· {Math.min(ATTEND_DAYS, Math.max(1, attendDayNo()))}일째</span></p>
                    {onPreviewAttend && <button onClick={onPreviewAttend} className="text-[0.75rem] font-bold text-blue-700 underline">도장 창 미리 보기</button>}
                  </div>
                  {range !== 'restart' && <p className="px-3.5 pb-3 text-xs text-stone-500">위 &lsquo;접속·활동&rsquo;에서 <b>11월 14일부터</b>를 고르면 보여요.</p>}
                  {range === 'restart' && !act && <p className="px-3.5 pb-3 text-xs text-stone-400">불러오는 중…</p>}
                  {range === 'restart' && act && (() => {
                    const today = kstToday();
                    const rows = added.map(s => ({ s, days: act.testers[s.user_id]?.playDayList || [] }));
                    const stamped = rows.filter(r => r.days.includes(today)).length;
                    const absent = rows.filter(r => { const last = r.days[r.days.length - 1]; return !last || (Date.parse(today) - Date.parse(last)) / 86400e3 >= 2; });
                    const notToday = rows.length - stamped;
                    return (
                      <>
                        <div className="mx-3.5 mb-2 p-3 rounded-2xl bg-blue-50 border border-blue-100">
                          <div className="flex gap-2 text-center">
                            <div className="flex-1 bg-white rounded-xl py-2"><b className="block text-xl text-blue-700">{stamped}명</b><span className="text-[0.6875rem] text-stone-500 font-bold">오늘 도장</span></div>
                            <div className="flex-1 bg-white rounded-xl py-2"><b className="block text-xl text-blue-700">{rows.length}명</b><span className="text-[0.6875rem] text-stone-500 font-bold">등록한 테스터</span></div>
                            <div className="flex-1 bg-white rounded-xl py-2"><b className="block text-xl text-red-700">{absent.length}명</b><span className="text-[0.6875rem] text-stone-500 font-bold">2일 넘게 안 옴</span></div>
                          </div>
                          {absent.length > 0 && <p className="mt-2 text-xs text-stone-600 leading-relaxed">안 오신 분: <b>{absent.map(({ s, days }) => { const last = days[days.length - 1]; return `${who[s.user_id]?.baptismal_name || '교우'}${last ? `(${Math.round((Date.parse(today) - Date.parse(last)) / 86400e3)}일)` : '(아직 없음)'}`; }).join(', ')}</b></p>}
                          {notToday > 0 && (
                            <button onClick={() => attendRemind(notToday)} disabled={attending} className="mt-2 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                              {attending ? '보내는 중…' : `📣 오늘 아직 안 온 ${notToday}명에게 출석 알림`}
                            </button>
                          )}
                          {attendResult && (
                            <p className="mt-2 text-xs text-emerald-900 leading-relaxed"><b>✅ {attendResult.people}명에게 보냈어요</b>
                              {attendResult.missed.length > 0 && <> · 알림을 꺼 두어 못 받은 분: <b>{attendResult.missed.map(id => who[id]?.baptismal_name || '교우').join(', ')}</b></>}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 px-3.5 pb-1">
                          <span className="w-[5.5rem] shrink-0" />
                          <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-[2px] flex-1 min-w-0 text-center text-[0.5rem] font-bold text-stone-400">
                            {Array.from({ length: ATTEND_DAYS }, (_, i) => <span key={i} className={i + 1 === attendDayNo(today) ? 'text-amber-700' : ''}>{i + 1}</span>)}
                          </div>
                          <span className="w-10 shrink-0" />
                        </div>
                        {rows.map(({ s, days }) => {
                          const tone = days.includes(today) ? 'text-blue-700' : days.length && (Date.parse(today) - Date.parse(days[days.length - 1])) / 86400e3 < 2 ? 'text-amber-700' : 'text-red-700';
                          return (
                            <div key={s.user_id} className="flex items-center gap-2 px-3.5 py-2 border-t border-stone-100">
                              <p className="w-[5.5rem] shrink-0 text-[0.8125rem] font-bold text-stone-800 truncate">{who[s.user_id]?.baptismal_name || '교우'}</p>
                              <AttendDots days={days} today={today} />
                              <p className={`w-10 shrink-0 text-right text-[0.75rem] font-bold leading-tight ${tone}`}>{days.length}일<br /><span className="text-[0.625rem] text-stone-400">연속 {attendStreak(days, today)}</span></p>
                            </div>
                          );
                        })}
                        <p className="px-3.5 py-2.5 text-[0.6875rem] text-stone-400 leading-relaxed border-t border-stone-100">● 도장 = 그날(한국 날짜) Play 테스트 앱으로 들어옴 · 노란 테두리 = 오늘. 예전 아이콘·인터넷 창으로 들어온 날은 세지 않아요.{!act.kindTracked && ' 지금은 SQL(app-sessions-kind.sql) 전이라 Play 앱을 마지막으로 연 날만 찍혀요 — 실행하면 그날부터 하루하루 쌓여요.'}</p>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="bg-white border border-stone-200 rounded-2xl p-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-stone-800">🔍 구글 Play 목록과 비교</p>
                  <button onClick={() => { setCompareDraft(googleText); setCompareOpen(o => !o); }} className="text-[0.75rem] font-bold text-blue-700 underline">{hasGoogle ? '목록 다시 넣기' : '목록 넣기'}</button>
                </div>
                {!hasGoogle && !compareOpen && <p className="text-xs text-stone-500 leading-relaxed">Play Console 테스터 이메일 목록을 붙여넣으면, 아직 구글 목록에 올리지 않은 신청자를 맨 위로 올려 드려요. 지금은 &lsquo;신청함&rsquo;인 분이 맨 위예요.</p>}
                {compareOpen && (
                  <>
                    <p className="text-xs text-stone-500 leading-relaxed">Play Console → 비공개 테스트 → 테스터 → 이메일 목록의 주소들을 그대로 붙여넣어 주세요 (쉼표·줄바꿈 상관없어요). 이 휴대폰에만 기억해요.</p>
                    <textarea value={compareDraft} onChange={e => setCompareDraft(e.target.value)} rows={5} placeholder="maria1234@gmail.com, …" className="w-full text-xs p-2 border border-stone-200 rounded-lg bg-stone-50 font-mono shrink-0" />
                    <div className="flex gap-2">
                      <button onClick={() => saveGoogle(compareDraft.trim())} disabled={!/@/.test(compareDraft)} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">비교하기</button>
                      {hasGoogle && <button onClick={() => saveGoogle('')} className="px-3 py-2.5 rounded-xl border border-stone-300 text-stone-600 text-sm font-bold">지우기</button>}
                    </div>
                  </>
                )}
                {hasGoogle && !compareOpen && (
                  <div className="text-xs text-stone-600 leading-relaxed flex flex-col gap-1.5">
                    <p>구글 목록 {googleEmails.length}명{googleAt && <span className="text-stone-400"> · {when(googleAt)}에 넣음</span>}</p>
                    {notInGoogle.length > 0 ? (
                      <>
                        <p className="text-red-700 font-bold">⚠️ 구글 목록에 없는 신청자 {notInGoogle.length}명 (아래 맨 위에 있어요)</p>
                        <button onClick={() => copy(notInGoogle)} className="w-full py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold">구글 목록에 없는 {notInGoogle.length}명 이메일 복사</button>
                      </>
                    ) : <p className="text-emerald-800 font-bold">✅ 앱에 신청한 분은 모두 구글 목록에 있어요</p>}
                    {inGoogleNotMarked.length > 0 && (
                      <button onClick={markInGoogle} disabled={busy} className="w-full py-2.5 rounded-xl border border-emerald-700 text-emerald-800 text-sm font-bold disabled:opacity-50">구글 목록에 이미 있는 {inGoogleNotMarked.length}명을 &lsquo;등록함&rsquo;으로 표시</button>
                    )}
                    {googleOnly.length > 0 && (
                      <details className="text-stone-500">
                        <summary className="cursor-pointer">구글 목록에만 있고 앱 신청은 없는 주소 {googleOnly.length}개</summary>
                        <p className="mt-1 break-all font-mono text-[0.6875rem]">{googleOnly.join(', ')}</p>
                      </details>
                    )}
                    <p className="text-[0.6875rem] text-stone-400">지메일은 점(.)이 달라도 같은 주소로 봐요. 구글 목록을 바꾼 뒤에는 &lsquo;목록 다시 넣기&rsquo;로 새로 붙여넣어 주세요.</p>
                  </div>
                )}
              </div>

              <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                {list.length === 0 && <p className="p-6 text-center text-sm text-stone-400">아직 신청한 분이 없어요.<br /><span className="text-xs">안드로이드 폰 홈 화면에 모집 안내가 떠요. 공지로도 알려 보세요.</span></p>}
                {sorted.map(s => (
                  <div key={s.user_id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{who[s.user_id]?.baptismal_name || '교우'}{who[s.user_id]?.handle && <span className="font-normal text-stone-400"> @{who[s.user_id]?.handle}</span>}</p>
                      <p className="text-xs text-stone-600 break-all">{s.google_email}</p>
                      {hasGoogle && (inGoogle(s)
                        ? <p className="text-[0.6875rem] font-bold text-emerald-700">✓ 구글 목록에 있음</p>
                        : <p className="text-[0.6875rem] font-bold text-red-700">⚠️ 구글 목록에 없음</p>)}
                      <p className="text-[0.6875rem] text-stone-400">
                        {md(s.created_at)} 신청
                        {s.play_first_at && <> · <span className="text-sky-700 font-bold">📱 {md(s.play_first_at)} 설치</span>{s.play_opened_at && md(s.play_opened_at) !== md(s.play_first_at) && <> · 마지막 {md(s.play_opened_at)}</>}</>}
                      </p>
                      {act?.testers[s.user_id] && (() => {
                        const a = act.testers[s.user_id];
                        const lastPlay = a.lastPlay || s.play_opened_at || null; // Play 앱을 마지막으로 연 때 (접속 기록 또는 설치 확인 칸)
                        const seenDays = a.lastSeen ? daysAgo(a.lastSeen) : 99;
                        const tone = seenDays <= 1 ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : seenDays <= 3 ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-red-50 text-red-800 border-red-200';
                        return (
                          <div className={`mt-1.5 rounded-lg border px-2 py-1.5 text-[0.75rem] leading-relaxed ${tone}`}>
                            <p className="text-[0.6875rem] font-bold opacity-70">가톨릭그램 접속 기록 <span className="font-normal">(인터넷 창·예전 아이콘 포함)</span></p>
                            <p className="font-bold">
                              {a.lastSeen ? `마지막 접속 ${agoLabel(a.lastSeen)}` : '이 기간에 들어온 적 없음'} · 들어온 날 {a.days}일
                              {act.kindTracked && <> (Play 앱 {a.playDays ?? 0}일)</>}
                            </p>
                            <p>Play 앱: {lastPlay ? `마지막 ${agoLabel(lastPlay)}` : '연 적 없음'} · 글 {a.posts} · 댓글 {a.comments} · 공감·기도 {a.reactions} · 메시지 {a.messages}</p>
                          </div>
                        );
                      })()}
                    </div>
                    {s.play_first_at
                      ? <span className="text-[0.6875rem] font-bold rounded-full px-2 py-0.5 shrink-0 bg-sky-100 text-sky-800">설치함</span>
                      : <span className={`text-[0.6875rem] font-bold rounded-full px-2 py-0.5 shrink-0 ${s.status === 'added' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{s.status === 'added' ? (installSetupNeeded ? '등록함' : '등록함 · 설치 전') : '신청함'}</span>}
                    <button onClick={() => remove(s)} className="text-xs text-stone-400 hover:text-red-600 shrink-0 px-1" aria-label={`${s.google_email} 신청 지우기`}>지우기</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
