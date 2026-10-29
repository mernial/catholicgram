'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { deleteMyAccount, signOutAndClear } from '@/lib/account';
import { TEXT_SIZES, getTextSize, applyTextSize } from '@/lib/text-size';
import { THEMES, AUTO_THEME, AUTO_OPTION, getThemeChoice, applyTheme, resolveTheme, prefersDark, isSamsungBrowser } from '@/lib/theme';
import { formatFeastDay } from '@/lib/feast';
import FeastDayPicker from '@/components/FeastDayPicker';
import { IconBadge } from '@/components/Icon';
import { initial } from '@/lib/fancy-name';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm } from '@/components/ConfirmDialog';
import { appKind, appKindLabel, browserName } from '@/lib/app-kind';
import { ALERT_SOUNDS, ALERT_SOUND_EVENT, alertSoundName, getAlertSoundChoice, previewAlertSound, setAlertSoundChoice } from '@/lib/alert-sound';

interface BlockedProfile { id: string; baptismal_name: string; handle?: string; avatar_url?: string }

// 설정: 약관/개인정보, 차단 목록, 로그아웃, 회원 탈퇴
export default function SettingsModal({ user, onClose, onUnblock, feastDay, onFeastDayChange, initialView = 'main', onOpenMembers, onOpenBgm, onOpenVault, onOpenStats, onEditProfile, onOpenNotices, onOpenTester, onShareApp }: {
  user: User;
  onClose: () => void;
  onUnblock: (userId: string) => Promise<void> | void;
  feastDay: string;
  onFeastDayChange: (value: string | null) => Promise<boolean>;
  initialView?: 'main' | 'feast' | 'sound';
  onOpenMembers?: () => void; // 관리자에게만 전달
  onOpenBgm?: () => void;     // 관리자에게만 전달
  onOpenVault?: () => void;   // 관리자: 🔒 보관 음악 (비공개·선물용)
  onOpenTester?: () => void;  // 안드로이드 앱 테스터 신청 (신청 표가 준비된 경우)
  onOpenStats?: () => void;   // 관리자에게만 전달
  onEditProfile?: () => void;
  onOpenNotices?: () => void;
  onShareApp?: () => void;    // 가톨릭그램 알리기 (components/ShareApp)
}) {
  const [view, setView] = useState<'main' | 'blocks' | 'feast' | 'sound'>(initialView);
  // 알림 소리: 지금 고른 것('off' = 소리 없음), 휴대폰 알림 소리 바꾸는 법은 기기에 맞게
  const [sound, setSound] = useState('praise');
  const [device, setDevice] = useState<{ ios: boolean; android: boolean; kind: string; browser: string }>({ ios: false, android: false, kind: 'browser', browser: '' });
  useEffect(() => {
    setSound(getAlertSoundChoice());
    const ua = navigator.userAgent;
    setDevice({ ios: /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), android: /Android/i.test(ua), kind: appKind(), browser: browserName() });
    const sync = () => setSound(getAlertSoundChoice());
    window.addEventListener(ALERT_SOUND_EVENT, sync);
    return () => window.removeEventListener(ALERT_SOUND_EVENT, sync);
  }, []);
  const chooseSound = (key: string) => {
    setAlertSoundChoice(key);
    setSound(key);
    if (key !== 'off') previewAlertSound(key);
  };
  const [appInfo, setAppInfo] = useState<{ title: string; detail: string } | null>(null);
  useEffect(() => { setAppInfo(appKindLabel()); }, []);
  const [feastInput, setFeastInput] = useState(feastDay);
  const [savingFeast, setSavingFeast] = useState(false);

  const saveFeastDay = async (value: string | null) => {
    setSavingFeast(true);
    const ok = await onFeastDayChange(value);
    setSavingFeast(false);
    if (!ok) { alert('축일을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.'); return; }
    setView('main');
  };
  const [blocked, setBlocked] = useState<BlockedProfile[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [textSize, setTextSize] = useState('100%');
  const [theme, setTheme] = useState(AUTO_THEME);
  const [phoneDark, setPhoneDark] = useState(false);
  const [samsung, setSamsung] = useState(false);
  // 휴대폰 알림 상태 (설정 맨 아래 '지금 쓰는 앱'에 — 알림이 자꾸 꺼진다는 교우 휴대폰을 살펴볼 때)
  const [pushInfo, setPushInfo] = useState('');

  useEffect(() => {
    setTextSize(getTextSize()); setTheme(getThemeChoice()); setPhoneDark(prefersDark()); setSamsung(isSamsungBrowser());
    (async () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) { setPushInfo('이 브라우저는 휴대폰 알림을 쓸 수 없어요'); return; }
      const word = (p: string) => (p === 'granted' ? '허용됨' : p === 'denied' ? '막힘' : '아직 안 물어봄');
      const reg = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => undefined);
      const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
      const pushPerm = reg ? await reg.pushManager.permissionState?.({ userVisibleOnly: true }).catch(() => null) : null;
      const pp = pushPerm === 'prompt' ? 'default' : pushPerm;
      setPushInfo(`휴대폰 알림: ${word(Notification.permission)}${pp && pp !== Notification.permission ? ` (알림 받기 ${word(pp)})` : ''} · 이 앱 알림 받기 ${sub ? '켜짐' : '꺼짐'}`);
    })();
    // 설정을 연 채로 휴대폰 다크 모드가 켜지고 꺼져도(다크 모드 예약 등) '지금 어두운/밝은 화면'이 맞게
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => setPhoneDark(prefersDark());
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  const changeTheme = (key: string) => {
    applyTheme(key);
    setTheme(key);
  };

  const changeTextSize = (size: string) => {
    applyTextSize(size);
    setTextSize(size);
  };

  const loadBlocked = async () => {
    const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', user.id);
    const ids = (data || []).map(b => b.blocked_id);
    if (ids.length === 0) { setBlocked([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url').in('id', ids);
    setBlocked((profiles || []) as BlockedProfile[]);
  };

  useEffect(() => { if (view === 'blocks') loadBlocked(); }, [view]);

  const handleDelete = async () => {
    if (!(await askConfirm('정말 탈퇴하시겠습니까?\n작성한 게시글, 사진, 댓글, 메시지 등 모든 데이터가 삭제되며 되돌릴 수 없습니다.'))) return;
    if (!(await askConfirm('마지막 확인입니다. 계정을 영구 삭제할까요?'))) return;
    setDeleting(true);
    const result = await deleteMyAccount();
    setDeleting(false);
    if (!result.ok) { alert(result.message); return; }
    alert('탈퇴가 완료되었습니다. 그동안 함께해주셔서 감사합니다. 🙏');
    window.location.replace('/');
  };

  const row = 'w-full px-4 py-3 text-sm text-left hover:bg-stone-50 border-b border-stone-100 flex items-center justify-between';
  const label = 'flex items-center gap-3';

  return (
    <BottomSheet bare label="설정" onClose={onClose} z="z-[85]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          {view === 'blocks' && <button onClick={() => setView('main')} className="text-sm font-bold text-stone-900">← 차단 목록</button>}
          {view === 'feast' && <button onClick={() => setView('main')} className="text-sm font-bold text-stone-900">← 나의 축일</button>}
          {view === 'sound' && <button onClick={() => setView('main')} className="text-sm font-bold text-stone-900">← 알림 소리</button>}
          {view === 'main' && <h2 className="font-bold text-stone-900">설정</h2>}
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>

        {view === 'main' ? (
          <div className="overflow-y-auto">
            <div className="p-4 border-b border-stone-100">
              <p className="text-sm mb-2.5 flex items-center gap-3"><IconBadge name="text" />글씨 크기</p>
              <div className="grid grid-cols-3 gap-1.5">
                {TEXT_SIZES.map((t, i) => (
                  <button
                    key={t.key}
                    onClick={() => changeTextSize(t.key)}
                    className={`py-2.5 rounded-xl border font-bold ${textSize === t.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200'}`}
                    style={{ fontSize: `${14 + i * 3}px` }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {/* 화면 색: 휴대폰 설정 따라가기 + 다섯 가지 중 고르기 (칸마다 그 색으로 미리 보여 줌, 이 휴대폰에만 저장) */}
            <div className="p-4 border-b border-stone-100">
              <p className="text-sm mb-2.5 flex items-center gap-3"><IconBadge name="sparkle" tone="gold" />화면 색</p>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="화면 색">
                {(() => {
                  // 휴대폰 설정 따라가기: 밝은(세이지)·어두운(차콜) 칸을 반씩
                  const on = theme === AUTO_THEME;
                  const light = THEMES.find(t => t.key === 'sage')!, dark = THEMES.find(t => t.key === 'charcoal')!;
                  const now = THEMES.find(t => t.key === resolveTheme(AUTO_THEME))!;
                  return (
                    <button type="button" role="radio" aria-checked={on} onClick={() => changeTheme(AUTO_THEME)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left border-2 transition-shadow ${on ? 'shadow-md' : 'border-transparent'}`}
                      style={{ background: `linear-gradient(110deg, ${light.preview[0]} 0 50%, ${dark.preview[0]} 50% 100%)`, borderColor: on ? now.preview[1] : 'rgba(0,0,0,0.08)' }}>
                      <span className="w-6 h-6 rounded-full shrink-0 overflow-hidden flex" aria-hidden="true" style={{ boxShadow: '0 0 0 1.5px rgba(127,127,127,0.35)' }}>
                        <span className="w-1/2 h-full" style={{ backgroundColor: light.swatches[1] }} /><span className="w-1/2 h-full" style={{ backgroundColor: dark.swatches[1] }} />
                      </span>
                      <span className="flex-1 min-w-0 rounded-xl px-2 py-1" style={{ backgroundColor: `${now.preview[0]}e6`, color: now.preview[2] }}>
                        <span className="block font-bold text-[1rem]">📱 {AUTO_OPTION.name}</span>
                        <span className="block text-[0.8125rem] opacity-75">{AUTO_OPTION.desc}{on ? ` · 지금 ${phoneDark ? '어두운 화면' : '밝은 화면'}` : ''}</span>
                      </span>
                      <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[0.875rem] font-bold" style={on ? { backgroundColor: now.preview[1], color: now.preview[0] } : { boxShadow: `inset 0 0 0 2px ${now.preview[1]}55` }} aria-hidden="true">{on ? '✓' : ''}</span>
                    </button>
                  );
                })()}
                {THEMES.map(t => {
                  const [bg, accent, ink] = t.preview;
                  const on = theme === t.key;
                  return (
                    <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => changeTheme(t.key)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left border-2 transition-shadow ${on ? 'shadow-md' : 'border-transparent'}`}
                      style={{ backgroundColor: bg, color: ink, borderColor: on ? accent : 'rgba(0,0,0,0.08)' }}>
                      <span className="flex -space-x-1.5 shrink-0" aria-hidden="true">
                        {t.swatches.map(c => <span key={c} className="w-6 h-6 rounded-full" style={{ backgroundColor: c, boxShadow: '0 0 0 1.5px rgba(127,127,127,0.35)' }} />)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-[1rem]">{t.name}</span>
                        <span className="block text-[0.8125rem] opacity-70">{t.desc}</span>
                      </span>
                      <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[0.875rem] font-bold" style={on ? { backgroundColor: accent, color: bg } : { boxShadow: `inset 0 0 0 2px ${accent}55` }} aria-hidden="true">{on ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
              {/* 삼성 인터넷 + 휴대폰 다크 모드 + 밝은 색: 브라우저가 화면을 억지로 어둡게 바꿀 수 있어 안내 */}
              {samsung && phoneDark && resolveTheme(theme) !== 'charcoal' && (
                <p className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[0.8125rem] text-amber-900 leading-relaxed">
                  📱 휴대폰이 다크 모드예요. 화면이 이상하게 어둡게 보이면 위의 <b>휴대폰 설정 따라가기</b>나 <b>차콜 &amp; 샴페인</b>을 골라 주세요.
                  밝은 색으로 보고 싶으면 <b>삼성 인터넷</b> 앱 → ≡ → 설정 → <b>실험실(Labs)</b> → <b>웹사이트 다크 테마 사용</b>을 켜 주세요.
                </p>
              )}
            </div>
            <button onClick={() => setView('sound')} className={row}>
              <span className={label}><IconBadge name={sound === 'off' ? 'mute' : 'speaker'} tone="violet" />알림 소리</span>
              <span className="text-stone-400 text-xs">{alertSoundName(sound)} <span className="text-stone-300">›</span></span>
            </button>
            {onOpenNotices && (
              <button onClick={onOpenNotices} className={row}><span className={label}><IconBadge name="megaphone" tone="gold" />공지사항{onOpenMembers && <span className="text-xs text-stone-400"> (관리자: 공지 쓰기·알림 보내기)</span>}</span><span className="text-stone-300">›</span></button>
            )}
            {onEditProfile && (
              <button onClick={onEditProfile} className={row}><span className={label}><IconBadge name="pencil" />닉네임·핸들·실명 수정</span><span className="text-stone-300">›</span></button>
            )}
            {onOpenTester && (
              <button onClick={onOpenTester} className={row}><span className={label}><IconBadge name="phone" tone="green" />안드로이드 앱 테스터 신청</span><span className="text-stone-300">›</span></button>
            )}
            <button onClick={() => { setFeastInput(feastDay); setView('feast'); }} className={row}>
              <span className={label}><IconBadge name="calendar" tone="gold" />나의 축일</span>
              <span className="text-stone-400 text-xs">{feastDay ? formatFeastDay(feastDay) : '등록하기'} <span className="text-stone-300">›</span></span>
            </button>
            {onOpenStats && (
              <button onClick={onOpenStats} className={`${row} bg-stone-50`}><span className={label}><IconBadge name="users" tone="gold" />접속 통계 <span className="text-xs text-stone-400">(관리자)</span></span><span className="text-stone-300">›</span></button>
            )}
            {onOpenMembers && (
              <button onClick={onOpenMembers} className={`${row} bg-stone-50`}><span className={label}><IconBadge name="users" tone="sky" />회원 관리 <span className="text-xs text-stone-400">(관리자)</span></span><span className="text-stone-300">›</span></button>
            )}
            {onOpenBgm && (
              <button onClick={onOpenBgm} className={`${row} bg-stone-50`}><span className={label}><IconBadge name="music" tone="violet" />게시글 음악 추가·관리 <span className="text-xs text-stone-400">(공개 · 관리자)</span></span><span className="text-stone-300">›</span></button>
            )}
            {onOpenVault && (
              <button onClick={onOpenVault} className={`${row} bg-stone-50`}><span className={label}><IconBadge name="lock" tone="gold" />보관 음악 <span className="text-xs text-stone-400">(비공개 · 선물용 · 관리자)</span></span><span className="text-stone-300">›</span></button>
            )}
            {onShareApp && (
              <button onClick={onShareApp} className={row}><span className={label}><IconBadge name="megaphone" tone="gold" />가톨릭그램 알리기</span><span className="text-stone-300">›</span></button>
            )}
            <button onClick={() => setView('blocks')} className={row}><span className={label}><IconBadge name="prohibit" />차단 목록</span><span className="text-stone-300">›</span></button>
            <a href="/terms" className={row}><span className={label}><IconBadge name="scroll" />이용약관 및 커뮤니티 규칙</span><span className="text-stone-300">›</span></a>
            <a href="/privacy" className={row}><span className={label}><IconBadge name="lock" />개인정보처리방침</span><span className="text-stone-300">›</span></a>
            <button onClick={() => signOutAndClear().then(onClose)} className={row}><span className={label}><IconBadge name="signout" />로그아웃</span></button>
            <button onClick={handleDelete} disabled={deleting} className={`${row} text-red-600`}>
              <span>{deleting ? '탈퇴 처리 중...' : '회원 탈퇴'}</span>
            </button>
            {/* 지금 쓰는 앱: 한 휴대폰에 앱이 둘이면(아이콘이 같음) 어느 쪽인지 여기서 확인 (lib/app-kind) */}
            {appInfo && (
              <div className="p-4 flex items-start gap-3">
                <IconBadge name="phone" tone="sky" />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] text-stone-500">지금 쓰는 앱</p>
                  <p className="text-[0.9375rem] font-bold text-stone-800">{appInfo.title}</p>
                  <p className="text-[0.8125rem] text-stone-500 leading-snug">{appInfo.detail}</p>
                  {pushInfo && <p className="mt-1 text-[0.8125rem] text-stone-500 leading-snug">{pushInfo}</p>}
                </div>
              </div>
            )}
            <p className="p-4 text-[0.8125rem] text-stone-400">로그인 계정: {user.app_metadata?.naver_id ? '네이버 계정' : user.email || (user.app_metadata?.provider === 'google' ? '구글 계정' : '카카오 계정')}</p>
            {/* 기기마다 새 버전을 받았는지 비교할 때 보는 번호 */}
            <p className="px-4 pb-4 -mt-3 text-[0.75rem] text-stone-300">앱 버전 {(process.env.NEXT_PUBLIC_APP_VERSION || 'dev').slice(0, 7)}</p>
          </div>
        ) : view === 'sound' ? (
          <div className="overflow-y-auto p-4 flex flex-col gap-3">
            <p className="text-[0.9375rem] text-stone-600 leading-relaxed">앱을 <b>열어 둔 동안</b> 새 알림(댓글·메시지 등)이 오면 울리는 소리예요. 누르면 들어 볼 수 있어요.</p>
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="알림 소리">
              {[...ALERT_SOUNDS, { key: 'off', name: '소리 없음', desc: '알림이 와도 소리를 내지 않아요', emoji: '🔇' }].map(o => {
                const on = sound === o.key;
                return (
                  <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => chooseSound(o.key)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left border-2 ${on ? 'border-violet-500 bg-violet-50' : 'border-stone-100 bg-white'}`}>
                    <span className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-[1.25rem] shrink-0" aria-hidden="true">{o.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-[1rem] text-stone-900">{o.name}</span>
                      <span className="block text-[0.8125rem] text-stone-500">{o.desc}</span>
                    </span>
                    {o.key !== 'off' && <span className="shrink-0 text-[0.75rem] text-stone-400" aria-hidden="true">▶ 듣기</span>}
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[0.875rem] font-bold ${on ? 'bg-violet-600 text-white' : 'ring-2 ring-inset ring-stone-200'}`} aria-hidden="true">{on ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
            {sound === 'praise' && <p className="text-[0.8125rem] text-stone-400 leading-snug -mt-1">휴대폰에 한국어 목소리가 없으면 '띵동'으로 울려요.</p>}
            {/* 앱을 닫아 두었을 때 휴대폰 위쪽에 뜨는 알림의 소리는 휴대폰이 정함 (웹 알림은 소리를 고를 수 없음) */}
            <div className="mt-1 p-3.5 rounded-2xl bg-sky-50 border border-sky-100 text-[0.875rem] text-sky-950 leading-relaxed">
              <p className="font-bold mb-1">📱 앱을 닫아 두었을 때의 알림 소리</p>
              {device.ios ? (
                <p>아이폰·아이패드는 휴대폰 위쪽에 뜨는 알림의 소리를 고를 수 없어요(애플이 기본 소리만 쓰게 해 두었어요). 휴대폰 <b>설정 → 알림 → 가톨릭그램</b>에서 <b>사운드</b>를 켜고 끌 수만 있어요.</p>
              ) : device.android ? (
                <>
                  <p className="mb-1.5">휴대폰 위쪽에 뜨는 알림의 소리는 <b>휴대폰 설정</b>에서 휴대폰에 들어 있는 소리 중에 골라요.</p>
                  {device.kind === 'browser' ? (
                    <ol className="list-decimal pl-5 space-y-0.5">
                      <li>휴대폰 <b>설정 → 애플리케이션 → {device.browser}</b></li>
                      <li><b>알림</b> → 알림 종류에서 <b>사이트</b>(또는 catholicgram) 누르기</li>
                      <li><b>소리</b> → 원하는 소리 고르기</li>
                    </ol>
                  ) : (
                    <>
                      <ol className="list-decimal pl-5 space-y-0.5">
                        <li>바탕화면의 <b>가톨릭그램 아이콘을 꾹</b> 누르기</li>
                        <li><b>ⓘ (앱 정보)</b> 누르기</li>
                        <li><b>알림</b> → 알림 종류(카테고리)를 하나 누르기</li>
                        <li><b>소리</b> → 원하는 소리 고르기</li>
                      </ol>
                      <p className="mt-1.5 text-[0.8125rem] text-sky-800">앱 정보에 알림 종류가 없으면 <b>설정 → 애플리케이션 → {device.browser} → 알림</b>에서 catholicgram 사이트의 소리를 바꿔 주세요.</p>
                    </>
                  )}
                </>
              ) : (
                <p>컴퓨터에서는 컴퓨터의 알림 설정(윈도우 설정 → 시스템 → 알림, 맥 시스템 설정 → 알림)에서 브라우저 알림 소리를 켜고 끌 수 있어요.</p>
              )}
            </div>
          </div>
        ) : view === 'feast' ? (
          <div className="overflow-y-auto p-4 flex flex-col gap-3">
            <p className="text-sm text-stone-600 leading-relaxed">축일 아침에 축하 인사를 보내드리고, 나를 팔로우하는 교우들에게도 축일 소식을 알려드려요.</p>
            <FeastDayPicker value={feastInput} onChange={setFeastInput} />
            <button
              onClick={() => saveFeastDay(feastInput || null)}
              disabled={savingFeast || !feastInput || feastInput === feastDay}
              className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {savingFeast ? '저장 중...' : '저장'}
            </button>
            {feastDay && (
              <button onClick={() => saveFeastDay(null)} disabled={savingFeast} className="text-xs text-stone-400 underline self-center">축일 지우기</button>
            )}
          </div>
        ) : (
          <div className="overflow-y-auto divide-y divide-stone-100">
            {blocked.length === 0 ? (
              <div className="p-10 text-center text-stone-400 text-sm">차단한 사용자가 없습니다.</div>
            ) : blocked.map(p => (
              <div key={p.id} className="p-4 flex items-center gap-3">
                {p.avatar_url
                  ? <img loading="lazy" src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-stone-200" />
                  : <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{initial(p.baptismal_name)}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-800 truncate">{p.baptismal_name}</p>
                  {p.handle && <p className="text-xs text-stone-400">@{p.handle}</p>}
                </div>
                <button onClick={async () => { await onUnblock(p.id); setBlocked(prev => prev.filter(b => b.id !== p.id)); }} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">차단 해제</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
