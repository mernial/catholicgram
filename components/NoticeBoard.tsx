'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Notice { id: string; title: string; content: string; pinned: boolean; pushed_at: string | null; created_at: string }

// 공지사항: 모두 읽기, 관리자는 쓰기·고치기·지우기·홈 고정·휴대폰 알림 보내기
export default function NoticeBoard({ notices, isAdmin, initialOpenId, hiddenIds = [], onHide, onClose, onChanged }: {
  notices: Notice[];
  isAdmin: boolean;
  initialOpenId?: string | null;
  hiddenIds?: string[];
  onHide?: (id: string) => void; // 다시 안 보기: 홈 화면 맨 위 공지 줄에서 없앤다
  onClose: () => void;
  onChanged: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId || null);
  const [editing, setEditing] = useState<Notice | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(true);
  const [sendPush, setSendPush] = useState(true);
  const [saving, setSaving] = useState(false);

  const startWrite = (n?: Notice) => {
    setEditing(n || 'new');
    setTitle(n?.title || '');
    setContent(n?.content || '');
    setPinned(n ? n.pinned : true);
    setSendPush(!n);
  };

  const pushNotice = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/announce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { alert(json.error || '알림을 보내지 못했어요.'); return; }
    alert(`📲 ${json.sent}대의 휴대폰에 알림을 보냈어요.`);
    onChanged();
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const row = { title: title.trim().slice(0, 60), content: content.trim().slice(0, 2000), pinned };
    const { data, error } = editing === 'new'
      ? await supabase.from('announcements').insert(row).select('id').single()
      : await supabase.from('announcements').update(row).eq('id', (editing as Notice).id).select('id').single();
    setSaving(false);
    if (error || !data) {
      alert(error?.code === '42P01' || error?.code === 'PGRST205'
        ? '공지 기능을 준비 중이에요. (supabase/announcements.sql 실행 필요)'
        : '공지를 저장하지 못했어요.');
      return;
    }
    setEditing(null);
    onChanged();
    if (sendPush) await pushNotice(data.id);
  };

  const remove = async (n: Notice) => {
    if (!window.confirm(`'${n.title}' 공지를 지울까요?`)) return;
    await supabase.from('announcements').delete().eq('id', n.id);
    setOpenId(null);
    onChanged();
  };

  const togglePin = async (n: Notice) => {
    await supabase.from('announcements').update({ pinned: !n.pinned }).eq('id', n.id);
    onChanged();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[28rem] h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-stone-900">📢 공지사항</h2>
          <div className="flex items-center gap-2">
            {isAdmin && !editing && <button onClick={() => startWrite()} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold">✏️ 공지 쓰기</button>}
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
          </div>
        </div>

        {editing ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
            <input value={title} onChange={e => setTitle(e.target.value.slice(0, 60))} placeholder="공지 제목 (예: 10월 성지순례 안내)" className="w-full px-3.5 py-3 text-sm font-bold border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
            <textarea value={content} onChange={e => setContent(e.target.value.slice(0, 2000))} rows={10} placeholder="공지 내용" className="w-full p-3.5 text-sm border border-stone-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
            <p className="text-right text-xs text-stone-400 -mt-2">{content.length}/2000</p>
            <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="w-5 h-5" /> 홈 화면 맨 위에 보이기</label>
            {(editing === 'new' || !(editing as Notice).pushed_at) && (
              <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={sendPush} onChange={e => setSendPush(e.target.checked)} className="w-5 h-5" /> 📲 모든 회원에게 휴대폰 알림 보내기</label>
            )}
            <div className="flex gap-2 mt-1">
              <button onClick={() => setEditing(null)} className="flex-1 py-3 rounded-xl border border-stone-300 text-sm text-stone-600">취소</button>
              <button onClick={save} disabled={saving || !title.trim() || !content.trim()} className="flex-1 py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40">{saving ? '올리는 중...' : editing === 'new' ? '공지 올리기' : '고치기'}</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
            {notices.length === 0 && <div className="p-10 text-center text-sm text-stone-400">아직 공지가 없어요.</div>}
            {notices.map(n => openId === n.id ? (
              <div key={n.id} className="p-4 flex flex-col gap-2 bg-amber-50/40">
                <button onClick={() => setOpenId(null)} className="self-start text-xs text-stone-400">▲ 접기</button>
                <p className="font-bold text-stone-900 text-base">{n.pinned && '📌 '}{n.title}</p>
                <p className="text-xs text-stone-400">{new Date(n.created_at).toLocaleString('ko-KR')}</p>
                <p className="text-[0.9375rem] text-stone-800 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                {n.pinned && onHide && !hiddenIds.includes(n.id) && (
                  <button onClick={() => onHide(n.id)} className="self-start mt-2 text-sm px-4 py-2.5 rounded-xl bg-stone-900 text-white font-bold">✓ 확인했어요 · 다시 안 보기</button>
                )}
                {isAdmin && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <button onClick={() => startWrite(n)} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">고치기</button>
                    <button onClick={() => togglePin(n)} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">{n.pinned ? '홈에서 내리기' : '홈에 올리기'}</button>
                    {!n.pushed_at && <button onClick={() => pushNotice(n.id)} className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 font-bold">📲 알림 보내기</button>}
                    <button onClick={() => remove(n)} className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600">지우기</button>
                  </div>
                )}
              </div>
            ) : (
              <button key={n.id} onClick={() => setOpenId(n.id)} className="w-full px-4 py-3.5 text-left hover:bg-stone-50 flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-stone-900 truncate">{n.pinned && '📌 '}{n.title}</span>
                  <span className="block text-xs text-stone-500 truncate mt-0.5">{n.content}</span>
                </span>
                <span className="text-[0.75rem] text-stone-400 shrink-0">{new Date(n.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
