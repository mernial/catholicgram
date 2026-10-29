'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { IconBadge } from '@/components/Icon';
import { PLAY_STORE_URL, TESTER_JOIN_URL, TesterStatus, isAndroidDevice, isValidEmail } from '@/lib/android-test';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm } from '@/components/ConfirmDialog';
import { type AppKind, appKind } from '@/lib/app-kind';

// 안드로이드 앱 테스터 신청: 회원이 동의하고 플레이 스토어 구글 계정을 적어 낸다 (supabase/android-testers.sql)
// 관리자가 구글에 등록하면('등록함') 설치 방법을 보여 준다: 참여 → 설치 → 같은 방법으로 로그인 → 예전 앱 지우기 → 14일.
// 이 화면은 보통 예전 앱(홈 화면에 추가한 앱)에서 알림을 눌러 열리므로, 예전 앱 지우기는 새 앱에 로그인한 뒤 맨 나중에
// 아이콘이 똑같아 어느 쪽이 예전 앱인지 모를 때 (components/AppKindNotice 의 맨 위 표시로 구별)
const WHICH_ICON = (
  <span className="mt-1.5 block rounded-lg bg-stone-50 border border-stone-200 p-2 text-[0.8125rem] text-stone-700">
    🔍 <b>어느 아이콘인지 모르겠으면</b> 하나씩 눌러 열어 보세요. 맨 위 이름 아래에 <b className="text-emerald-800">✓ Play 테스트 앱</b>이 보이면 새 앱,
    <b className="text-amber-800"> 예전 앱</b>이 보이면 예전 앱이에요. 예전 앱이면 홈 화면으로 나가 <b>방금 누른 그 아이콘</b>을 꾹 눌러 삭제해요.
  </span>
);

export default function TesterSignup({ user, onClose, onStatusChange }: {
  user: User;
  onClose: () => void;
  onStatusChange?: (status: TesterStatus) => void;
}) {
  const [status, setStatus] = useState<TesterStatus | null>(null);
  const [savedEmail, setSavedEmail] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [isAndroid, setIsAndroid] = useState(true);
  const [kind, setKind] = useState<AppKind | null>(null); // 지금 이 화면을 연 앱 (Play 앱이면 설치가 끝난 것)
  // 새 앱에서도 지금과 같은 방법으로 로그인해야 같은 계정 (다른 방법이면 내 글이 없는 새 계정이 생길 수 있음)
  const loginWay = user.app_metadata?.naver_id ? '네이버' : user.app_metadata?.provider === 'google' ? '구글' : user.app_metadata?.provider === 'kakao' ? '카카오' : null;

  useEffect(() => {
    supabase.from('tester_signups').select('google_email, status').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      setIsAndroid(isAndroidDevice());
      setKind(appKind());
      if (error) { setSetupNeeded(true); setStatus('none'); return; }
      const s = (data?.status as TesterStatus) || 'none';
      setStatus(s);
      setSavedEmail(data?.google_email || '');
      // 구글 로그인으로 가입한 분은 그 Gmail 을 미리 채워 둔다 (다를 수 있으니 확인하게)
      setEmail(data?.google_email || (/@gmail\.com$/i.test(user.email || '') ? user.email! : ''));
    });
  }, [user.id, user.email]);

  const apply = (s: TesterStatus) => { setStatus(s); onStatusChange?.(s); };

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (!isValidEmail(value) || !consent) return;
    setSaving(true);
    const { error } = await supabase.from('tester_signups').upsert(
      { user_id: user.id, google_email: value, status: 'requested', consent_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setSaving(false);
    if (error) { alert('신청하지 못했어요. 잠시 후 다시 해 주세요.'); return; }
    setSavedEmail(value);
    setEditing(false);
    apply('requested');
  };

  const cancel = async () => {
    if (!(await askConfirm({ title: '테스터 신청을 취소할까요?', message: '적어 주신 이메일도 함께 지워져요.', ok: '신청 취소', cancel: '아니요', danger: true, icon: 'trash' }))) return;
    const { error } = await supabase.from('tester_signups').delete().eq('user_id', user.id);
    if (error) { alert('취소하지 못했어요. 잠시 후 다시 해 주세요.'); return; }
    setSavedEmail(''); setConsent(false); setEditing(false);
    apply('none');
  };

  const step = (n: number, text: React.ReactNode) => (
    <li className="flex gap-2.5"><span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0">{n}</span><span className="text-sm text-stone-700 leading-relaxed">{text}</span></li>
  );
  const showForm = status === 'none' || editing;
  const valid = isValidEmail(email.trim());

  return (
    <BottomSheet bare label="안드로이드 테스터 신청" onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="flex-1 min-h-0 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-4" onClick={e => e.stopPropagation()} role="dialog" aria-label="안드로이드 앱 테스터 신청">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-stone-900 flex items-center gap-2"><IconBadge name="phone" tone="green" />안드로이드 앱 테스터</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-2" aria-label="닫기">×</button>
        </div>

        {status === null && <p className="py-10 text-center text-sm text-stone-400">불러오는 중...</p>}
        {status !== null && setupNeeded && <p className="py-8 text-center text-sm text-stone-500 leading-relaxed">테스터 신청을 준비하고 있어요.<br />조금 뒤에 다시 열어 주세요.</p>}

        {status !== null && !setupNeeded && showForm && (
          <>
            <p className="text-sm text-stone-700 leading-relaxed">
              가톨릭그램이 <b>구글 플레이 스토어</b>에 정식으로 올라가려면, 안드로이드 휴대폰을 쓰는 교우 <b>12명 이상</b>이 <b>2주 동안</b> 앱을 시험해 주셔야 해요. 도와주시면 큰 힘이 돼요 🙏
            </p>
            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-3.5 flex flex-col gap-2">
              <p className="text-xs font-bold text-stone-500">이렇게 진행돼요</p>
              <ol className="flex flex-col gap-2">
                {step(1, <>아래에 <b>플레이 스토어에 쓰는 구글 계정</b>을 적어 주세요</>)}
                {step(2, <>관리자가 구글에 등록하면 <b>알림</b>이 가요</>)}
                {step(3, <>알림을 눌러 안내대로 <b>앱을 설치</b>해요</>)}
                {step(4, <><b>14일 동안 지우지 말고</b> 가끔 열어 주세요</>)}
              </ol>
              <p className="text-xs text-stone-500">갤럭시 등 <b>안드로이드 휴대폰</b>만 참여할 수 있어요. 아이폰은 참여할 수 없어요.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tester-email" className="text-[0.8125rem] font-bold text-stone-600">플레이 스토어에 쓰는 구글 계정 (Gmail)</label>
              <input id="tester-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="예: maria1234@gmail.com"
                className="w-full p-3 text-sm border border-stone-300 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <p className="text-xs text-stone-500 leading-snug">모르시면: 플레이 스토어 앱 → 오른쪽 위 <b>동그란 프로필 사진</b>을 누르면 이메일이 보여요.</p>
              {email.trim() && !valid && <p className="text-xs text-red-600">이메일 주소를 다시 확인해 주세요.</p>}
            </div>
            <label className="flex items-start gap-2.5 text-sm text-stone-700 leading-snug cursor-pointer">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-5 h-5 accent-emerald-700 shrink-0" />
              <span>이 이메일을 <b>구글 플레이 테스터 목록</b>에 등록하는 데 동의해요. <span className="text-stone-500">(테스트에만 쓰고, 신청을 취소하거나 테스트가 끝나면 지워요)</span></span>
            </label>
            <div className="flex gap-2">
              {editing && <button onClick={() => { setEditing(false); setEmail(savedEmail); }} className="flex-1 py-3 rounded-xl border border-stone-300 text-sm font-bold text-stone-600">그만두기</button>}
              <button onClick={submit} disabled={!valid || !consent || saving} className="flex-1 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:bg-stone-300">{saving ? '보내는 중...' : editing ? '고친 이메일로 다시 신청' : '테스터 신청하기'}</button>
            </div>
          </>
        )}

        {status === 'requested' && !editing && (
          <>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <p className="text-2xl">✅</p>
              <p className="font-bold text-stone-900 mt-1">신청했어요. 감사해요!</p>
              <p className="text-sm text-stone-700 mt-1 break-all">{savedEmail}</p>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">관리자가 구글에 등록하면 <b>알림</b>으로 알려 드릴게요.<br />그때 알림을 눌러 앱을 설치해 주세요.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setConsent(false); setEditing(true); }} className="flex-1 py-3 rounded-xl border border-stone-300 text-sm font-bold text-stone-700">이메일 고치기</button>
              <button onClick={cancel} className="flex-1 py-3 rounded-xl border border-red-200 text-sm font-bold text-red-600">신청 취소</button>
            </div>
          </>
        )}

        {status === 'added' && !editing && kind === 'play' && (
          <>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <p className="text-2xl">✅</p>
              <p className="font-bold text-stone-900 mt-1">Play 스토어 앱으로 잘 열렸어요!</p>
              <p className="text-sm text-stone-700 mt-1">설치가 끝났어요. 함께해 주셔서 감사해요 🙏</p>
            </div>
            <ol className="flex flex-col gap-3">
              {step(1, <>홈 화면에 <b>예전 가톨릭그램 아이콘</b>이 남아 있으면 꾹 눌러 <b>[삭제]</b>해 주세요. 둘 다 두면 알림이 두 번 와요. <span className="text-stone-500">(글·사진·메시지는 그대로예요)</span>{WHICH_ICON}</>)}
              {step(2, <><b>14일 동안 지우지 말고</b> 하루 한 번쯤 열어 주세요. 그래야 정식 출시를 신청할 수 있어요 🙏</>)}
            </ol>
          </>
        )}

        {status === 'added' && !editing && kind !== 'play' && (
          <>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="font-bold text-stone-900">🎉 등록이 끝났어요! 이제 앱을 설치해 주세요</p>
              <p className="text-xs text-stone-600 mt-1 break-all">플레이 스토어가 <b>{savedEmail}</b> 계정으로 로그인되어 있어야 해요.</p>
            </div>
            {!isAndroid && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">아래 단계는 <b>안드로이드 휴대폰</b>의 가톨릭그램에서 이 화면을 다시 열어서 해 주세요.</p>}
            <ol className="flex flex-col gap-3">
              {step(1, <>
                아래 단추를 눌러 열린 화면에서 <b>&lsquo;테스터 되기&rsquo;</b>를 눌러요.
                <a href={TESTER_JOIN_URL} target="_blank" rel="noopener noreferrer" className="mt-2 block w-full py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold text-center">① 테스트 참여하기</a>
              </>)}
              {step(2, <>
                그다음 플레이 스토어에서 <b>설치</b>를 눌러요.
                <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 block w-full py-3 rounded-xl border border-emerald-700 text-emerald-800 text-sm font-bold text-center">② 플레이 스토어에서 설치</a>
              </>)}
              {step(3, loginWay
                ? <>새로 설치한 가톨릭그램을 열어요. <b>보통은 이미 로그인되어 있어요</b>(휴대폰 인터넷 창의 로그인이 이어져요). 로그인 화면이 나오면 <b>지금처럼 {loginWay}로 로그인</b>해요. 플레이 스토어의 구글 계정과는 상관없어요. 알림을 허용할지 물으면 <b>[허용]</b>을 눌러요.</>
                : <>새로 설치한 가톨릭그램을 열어요. <b>보통은 이미 로그인되어 있어요</b>(휴대폰 인터넷 창의 로그인이 이어져요). 로그인 화면이 나오면 <b>처음 가입할 때 쓴 방법 그대로</b> 로그인해요. 플레이 스토어의 구글 계정과는 상관없어요. 알림을 허용할지 물으면 <b>[허용]</b>을 눌러요.</>)}
              {step(4, kind === 'home'
                ? <>새 앱에 로그인이 되면, <b>지금 보고 계신 이 앱(예전 앱)</b>의 아이콘을 홈 화면에서 꾹 눌러 <b>[삭제]</b>해요. 둘 다 두면 알림이 두 번 와요. <span className="text-stone-500">(글·사진·메시지는 그대로예요)</span></>
                : <>홈 화면에 <b>예전에 추가한 가톨릭그램 아이콘</b>이 있으면 꾹 눌러 <b>[삭제]</b>해요. 둘 다 두면 알림이 두 번 와요. <span className="text-stone-500">(글·사진·메시지는 그대로예요)</span>{WHICH_ICON}</>)}
              {step(5, <><b>14일 동안 지우지 말고</b> 하루 한 번쯤 열어 주세요. 그래야 정식 출시를 신청할 수 있어요 🙏</>)}
            </ol>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-stone-700 leading-relaxed flex flex-col gap-2">
              <div>
                <p className="font-bold text-amber-900">&lsquo;App not available&rsquo;(앱을 사용할 수 없음)이 나오면</p>
                <p className="mt-1">· 그 화면 <b>오른쪽 위 동그란 사진</b>을 눌러 <b className="break-all">{savedEmail}</b> 계정으로 바꾼 뒤 다시 ①을 눌러요.</p>
                <p>· 그래도 안 되면 <b>하루쯤 뒤</b>에 다시 ①을 눌러 주세요.</p>
              </div>
              <div>
                <p className="font-bold text-amber-900">새 앱에서 &lsquo;환영합니다!&rsquo; 가입 화면이 나오면</p>
                <p className="mt-1">· 다른 방법으로 들어간 거예요. 창을 닫고 <b>내 공간 → 로그아웃</b> 후 {loginWay ? <b>{loginWay}로</b> : <b>처음 가입한 방법으로</b>} 다시 로그인해요.</p>
              </div>
            </div>
            <button onClick={() => { setConsent(false); setEditing(true); }} className="self-center text-xs text-stone-500 underline">구글 계정 이메일이 달라요 (고치기)</button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
