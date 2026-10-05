'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { deleteMyAccount } from '@/lib/account';
import { TEXT_SIZES, getTextSize, applyTextSize } from '@/lib/text-size';
import { formatFeastDay } from '@/lib/feast';
import FeastDayPicker from '@/components/FeastDayPicker';

interface BlockedProfile { id: string; baptismal_name: string; handle?: string; avatar_url?: string }

// 설정: 약관/개인정보, 차단 목록, 로그아웃, 회원 탈퇴
export default function SettingsModal({ user, onClose, onUnblock, feastDay, baptismalName, onFeastDayChange, initialView = 'main' }: {
  user: User;
  onClose: () => void;
  onUnblock: (userId: string) => Promise<void> | void;
  feastDay: string;
  baptismalName: string;
  onFeastDayChange: (value: string | null) => Promise<boolean>;
  initialView?: 'main' | 'feast';
}) {
  const [view, setView] = useState<'main' | 'blocks' | 'feast'>(initialView);
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

  useEffect(() => { setTextSize(getTextSize()); }, []);

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
    if (!window.confirm('정말 탈퇴하시겠습니까?\n작성한 게시글, 사진, 댓글, 메시지 등 모든 데이터가 삭제되며 되돌릴 수 없습니다.')) return;
    if (!window.confirm('마지막 확인입니다. 계정을 영구 삭제할까요?')) return;
    setDeleting(true);
    const result = await deleteMyAccount();
    setDeleting(false);
    if (!result.ok) { alert(result.message); return; }
    alert('탈퇴가 완료되었습니다. 그동안 함께해주셔서 감사합니다. 🙏');
    window.location.replace('/');
  };

  const row = 'w-full p-4 text-sm text-left hover:bg-stone-50 border-b border-stone-100 flex items-center justify-between';

  return (
    <div className="fixed inset-0 bg-black/60 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-96 max-h-[85dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          {view === 'blocks' && <button onClick={() => setView('main')} className="text-sm font-bold text-stone-900">← 차단 목록</button>}
          {view === 'feast' && <button onClick={() => setView('main')} className="text-sm font-bold text-stone-900">← 나의 축일</button>}
          {view === 'main' && <h2 className="font-bold text-stone-900">⚙️ 설정</h2>}
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>

        {view === 'main' ? (
          <div className="overflow-y-auto">
            <div className="p-4 border-b border-stone-100">
              <p className="text-sm mb-2.5">🔠 글씨 크기</p>
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
            <button onClick={() => { setFeastInput(feastDay); setView('feast'); }} className={row}>
              <span>🕯️ 나의 축일</span>
              <span className="text-stone-400 text-xs">{feastDay ? formatFeastDay(feastDay) : '등록하기'} <span className="text-stone-300">›</span></span>
            </button>
            <button onClick={() => setView('blocks')} className={row}><span>🚫 차단 목록</span><span className="text-stone-300">›</span></button>
            <a href="/terms" className={row}><span>📜 이용약관 및 커뮤니티 규칙</span><span className="text-stone-300">›</span></a>
            <a href="/privacy" className={row}><span>🔒 개인정보처리방침</span><span className="text-stone-300">›</span></a>
            <button onClick={() => supabase.auth.signOut().then(onClose)} className={row}><span>로그아웃</span></button>
            <button onClick={handleDelete} disabled={deleting} className={`${row} text-red-600`}>
              <span>{deleting ? '탈퇴 처리 중...' : '회원 탈퇴'}</span>
            </button>
            <p className="p-4 text-[0.8125rem] text-stone-400">로그인 계정: {user.email || (user.app_metadata?.provider === 'google' ? '구글 계정' : '카카오 계정')}</p>
          </div>
        ) : view === 'feast' ? (
          <div className="overflow-y-auto p-4 flex flex-col gap-3">
            <p className="text-sm text-stone-600 leading-relaxed">축일 아침에 축하 인사를 보내드리고, 나를 팔로우하는 교우들에게도 축일 소식을 알려드려요.</p>
            <FeastDayPicker value={feastInput} onChange={setFeastInput} name={baptismalName} />
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
                  ? <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-stone-200" />
                  : <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{p.baptismal_name?.[0]}</div>}
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
    </div>
  );
}
