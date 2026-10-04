'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// 부적절한 콘텐츠/사용자 신고 (supabase/report-block.sql 의 reports 테이블)

export type ReportTargetType = 'post' | 'comment' | 'anon_post' | 'anon_reply' | 'user' | 'message';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  userId?: string;     // 작성자 (익명글은 없음)
  userName?: string;
  preview?: string;    // 운영자가 확인할 내용 일부
}

const REASONS = [
  { key: 'spam', label: '스팸 · 광고' },
  { key: 'abuse', label: '욕설 · 비방 · 괴롭힘' },
  { key: 'sexual', label: '음란물 · 성적인 내용' },
  { key: 'hate', label: '혐오 · 차별 표현' },
  { key: 'privacy', label: '개인정보 노출' },
  { key: 'other', label: '기타' },
];

const TYPE_LABEL: Record<ReportTargetType, string> = {
  post: '게시글', comment: '댓글', anon_post: '익명 고민글', anon_reply: '익명 답글', user: '사용자', message: '메시지',
};

export default function ReportDialog({ target, onClose, onBlock }: {
  target: ReportTarget;
  onClose: () => void;
  onBlock?: (userId: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sending, setSending] = useState(false);
  const canBlock = !!target.userId && !!onBlock;

  const submit = async () => {
    if (!reason) return;
    setSending(true);
    const { error } = await supabase.from('reports').insert({
      target_type: target.type,
      target_id: target.id,
      target_user_id: target.userId || null,
      target_preview: (target.preview || '').slice(0, 500) || null,
      reason,
      detail: detail.trim() || null,
    });
    if (!error && alsoBlock && target.userId && onBlock) await onBlock(target.userId);
    setSending(false);
    if (error) { alert(`신고하지 못했습니다.\n(${error.message})`); return; }
    alert('신고가 접수되었습니다. 운영자가 24시간 이내에 확인하겠습니다. 🙏');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[88] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4 pb-safe" onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="font-bold text-stone-900">🚨 {TYPE_LABEL[target.type]} 신고</h2>
          {target.preview && <p className="text-xs text-stone-500 mt-1 line-clamp-2">&ldquo;{target.preview}&rdquo;</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          {REASONS.map(r => (
            <button key={r.key} onClick={() => setReason(r.key)} className={`text-left text-sm px-3.5 py-2.5 rounded-xl border ${reason === r.key ? 'border-red-400 bg-red-50 text-red-700 font-bold' : 'border-stone-200 text-stone-700'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={2} maxLength={500} placeholder="자세한 내용 (선택)" className="w-full text-sm p-3 border border-stone-200 rounded-xl resize-none focus:outline-none" />
        {canBlock && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={alsoBlock} onChange={e => setAlsoBlock(e.target.checked)} className="w-4 h-4" />
            {target.userName ? `${target.userName}님을` : '이 사용자를'} 차단하기
          </label>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm text-stone-500 border border-stone-200">취소</button>
          <button onClick={submit} disabled={!reason || sending} className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40">
            {sending ? '보내는 중...' : '신고하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
