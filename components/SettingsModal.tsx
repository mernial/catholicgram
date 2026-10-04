'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { deleteMyAccount } from '@/lib/account';

interface BlockedProfile { id: string; baptismal_name: string; handle?: string; avatar_url?: string }

// 설정: 약관/개인정보, 차단 목록, 로그아웃, 회원 탈퇴
export default function SettingsModal({ user, onClose, onUnblock }: {
  user: User;
  onClose: () => void;
  onUnblock: (userId: string) => Promise<void> | void;
}) {
  const [view, setView] = useState<'main' | 'blocks'>('main');
  const [blocked, setBlocked] = useState<BlockedProfile[]>([]);
  const [deleting, setDeleting] = useState(false);

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
      <div className="bg-white w-full sm:w-96 max-h-[85vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          {view === 'blocks'
            ? <button onClick={() => setView('main')} className="text-sm font-bold text-stone-900">← 차단 목록</button>
            : <h2 className="font-bold text-stone-900">⚙️ 설정</h2>}
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>

        {view === 'main' ? (
          <div className="overflow-y-auto">
            <button onClick={() => setView('blocks')} className={row}><span>🚫 차단 목록</span><span className="text-stone-300">›</span></button>
            <a href="/terms" className={row}><span>📜 이용약관 및 커뮤니티 규칙</span><span className="text-stone-300">›</span></a>
            <a href="/privacy" className={row}><span>🔒 개인정보처리방침</span><span className="text-stone-300">›</span></a>
            <button onClick={() => supabase.auth.signOut().then(onClose)} className={row}><span>로그아웃</span></button>
            <button onClick={handleDelete} disabled={deleting} className={`${row} text-red-600`}>
              <span>{deleting ? '탈퇴 처리 중...' : '회원 탈퇴'}</span>
            </button>
            <p className="p-4 text-[11px] text-stone-400">로그인 계정: {user.email || '카카오 계정'}</p>
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
