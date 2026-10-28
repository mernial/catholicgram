'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IconBadge } from '@/components/Icon';
import { TESTER_GOAL } from '@/lib/android-test';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm } from '@/components/ConfirmDialog';

// 관리자 전용: 안드로이드 테스터 신청 목록 → 이메일을 복사해 Play Console 테스터 목록에 붙여넣고, '등록함'으로 표시하면 신청자에게 알림
// play_first_at·play_opened_at: 그 교우가 Play 테스트 앱을 처음·마지막으로 연 때 (supabase/tester-installs.sql)
interface Signup { user_id: string; google_email: string; status: 'requested' | 'added'; created_at: string; play_first_at?: string | null; play_opened_at?: string | null }
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
interface Who { baptismal_name: string; handle?: string | null }

export default function AdminTesters({ onClose, sendPush }: {
  onClose: () => void;
  sendPush: (type: 'tester_added', id: string) => void;
}) {
  const [list, setList] = useState<Signup[] | null>(null);
  const [who, setWho] = useState<Record<string, Who>>({});
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [copied, setCopied] = useState<{ ids: string[]; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [installSetupNeeded, setInstallSetupNeeded] = useState(false);

  const fetchList = async () => {
    const first = await supabase.from('tester_signups').select('user_id, google_email, status, created_at, play_first_at, play_opened_at').order('created_at', { ascending: true });
    // 설치 확인 칸이 아직 없으면(tester-installs.sql 실행 전) 예전처럼
    const { data, error } = first.error
      ? await supabase.from('tester_signups').select('user_id, google_email, status, created_at').order('created_at', { ascending: true })
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
    setBusy(true);
    const { error } = await supabase.from('tester_signups').update({ status: 'added' }).in('user_id', ids);
    setBusy(false);
    if (error) { alert('표시하지 못했어요. 잠시 후 다시 해 주세요.'); return; }
    ids.forEach(id => sendPush('tester_added', id));
    setCopied(null);
    reload();
  };

  // 구글 검토가 끝나기 전에 '등록함'으로 알렸으면, 게시된 뒤 등록한 분들께 설치 안내를 한 번 더 보낸다
  const resend = async () => {
    if (added.length === 0 || resent) return;
    if (!(await askConfirm(`Play Console 게시 개요에서 비공개 테스트가 '게시됨'인가요?\n구글에 등록한 ${added.length}명에게 설치 안내 알림을 다시 보낼까요?`))) return;
    added.forEach(s => sendPush('tester_added', s.user_id));
    setResent(true);
  };

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

              <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                {list.length === 0 && <p className="p-6 text-center text-sm text-stone-400">아직 신청한 분이 없어요.<br /><span className="text-xs">안드로이드 폰 홈 화면에 모집 안내가 떠요. 공지로도 알려 보세요.</span></p>}
                {list.map(s => (
                  <div key={s.user_id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{who[s.user_id]?.baptismal_name || '교우'}{who[s.user_id]?.handle && <span className="font-normal text-stone-400"> @{who[s.user_id]?.handle}</span>}</p>
                      <p className="text-xs text-stone-600 break-all">{s.google_email}</p>
                      <p className="text-[0.6875rem] text-stone-400">
                        {md(s.created_at)} 신청
                        {s.play_first_at && <> · <span className="text-sky-700 font-bold">📱 {md(s.play_first_at)} 설치</span>{s.play_opened_at && md(s.play_opened_at) !== md(s.play_first_at) && <> · 마지막 {md(s.play_opened_at)}</>}</>}
                      </p>
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
