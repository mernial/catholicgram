'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import { uploadPhoto } from '@/lib/upload';

// 사연 보내기 (supabase/letters.sql)
// 교우: 사연 쓰기 + 내가 보낸 사연과 상태 보기 — 사연은 관리자에게만 전달됨
// 관리자: 받은 사연함(새 사연/읽음/소개함), 방송용 크게 읽기

interface Letter {
  id: string;
  user_id: string;
  author_name: string | null;
  content: string;
  image_url: string | null;
  name_display: 'name' | 'anonymous';
  broadcast_ok: boolean;
  status: 'new' | 'read' | 'aired';
  created_at: string;
}

const STATUS: Record<Letter['status'], { label: string; mine: string; className: string }> = {
  new: { label: '새 사연', mine: '전달됨', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  read: { label: '읽음', mine: '운영자가 읽었어요', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  aired: { label: '방송에서 소개함', mine: '방송에서 소개됐어요 🎉', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const SETUP_HINT = '사연 보내기를 준비 중이에요. (관리자: supabase/letters.sql 실행 필요)';
const isSetupError = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));

export default function LettersModal({ user, authorName, isAdmin, onClose, onSent, onChanged }: {
  user: User;
  authorName: string;
  isAdmin: boolean;
  onClose: () => void;
  onSent: (id: string) => void;    // 관리자에게 알림 보내기
  onChanged?: () => void;          // 관리자: 새 사연 수 다시 세기
}) {
  const [view, setView] = useState<'write' | 'mine' | 'inbox'>(isAdmin ? 'inbox' : 'write');
  const [items, setItems] = useState<Letter[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'new' | 'read' | 'aired' | 'all'>('new');
  const [reading, setReading] = useState<Letter | null>(null); // 방송용 크게 읽기
  const [zoom, setZoom] = useState<string | null>(null);
  // 쓰기
  const [content, setContent] = useState('');
  const [nameDisplay, setNameDisplay] = useState<Letter['name_display']>('anonymous');
  const [broadcastOk, setBroadcastOk] = useState(true);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [sending, setSending] = useState(false);

  const load = async (v = view) => {
    if (v === 'write') return;
    setItems(null); setError('');
    let q = supabase.from('letters').select('*').order('created_at', { ascending: false }).limit(300);
    if (v === 'mine') q = q.eq('user_id', user.id);
    const { data, error: e } = await q;
    if (e) { setError(isSetupError(e) ? SETUP_HINT : '불러오지 못했어요.'); setItems([]); return; }
    setItems((data || []) as Letter[]);
  };
  useEffect(() => { load(view); }, [view]);

  const send = async () => {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    let image_url: string | null = null;
    if (photo) {
      try { image_url = await uploadPhoto(photo.file, 'letters'); }
      catch { setSending(false); alert('사진을 올리지 못했어요. 사진을 빼고 다시 보내 주세요.'); return; }
    }
    const id = crypto.randomUUID();
    const { error: e } = await supabase.from('letters').insert({ id, user_id: user.id, author_name: authorName, content: text.slice(0, 5000), image_url, name_display: nameDisplay, broadcast_ok: broadcastOk });
    setSending(false);
    if (e) { alert(isSetupError(e) ? SETUP_HINT : `사연을 보내지 못했어요.\n(${e.message})`); return; }
    onSent(id);
    setContent(''); setPhoto(null);
    alert('사연을 보냈어요. 운영자에게만 전달됩니다 💌');
    setView('mine');
  };

  const setStatus = async (l: Letter, status: Letter['status']) => {
    const { error: e } = await supabase.from('letters').update({ status }).eq('id', l.id);
    if (e) { alert('바꾸지 못했어요.'); return; }
    setItems(prev => prev?.map(x => x.id === l.id ? { ...x, status } : x) || prev);
    if (reading?.id === l.id) setReading({ ...l, status });
    onChanged?.();
  };
  const remove = async (l: Letter) => {
    if (!window.confirm('이 사연을 지울까요?')) return;
    const { error: e } = await supabase.from('letters').delete().eq('id', l.id);
    if (e) { alert('지우지 못했어요.'); return; }
    setItems(prev => prev?.filter(x => x.id !== l.id) || prev);
    onChanged?.();
  };
  // 관리자: 열어 보면 '읽음'으로
  const openReading = (l: Letter) => {
    if (l.status === 'new') { setReading({ ...l, status: 'read' }); setStatus(l, 'read'); }
    else setReading(l);
  };

  const shown = (items || []).filter(l => view !== 'inbox' || filter === 'all' || l.status === filter);
  const count = (s: Letter['status']) => (items || []).filter(l => l.status === s).length;
  const displayName = (l: Letter) => (l.name_display === 'name' ? `${l.author_name || '교우'}님` : '익명');

  return (
    <div className="fixed inset-0 bg-black/60 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      {zoom && (
        <div className="fixed inset-0 z-[92] bg-black/90 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setZoom(null); }}>
          <img src={zoom} alt="사연 사진" className="max-w-full max-h-[90dvh] object-contain rounded-lg" />
        </div>
      )}
      {/* 관리자: 방송에서 읽기 좋게 크게 */}
      {reading && (
        <div className="fixed inset-0 z-[91] bg-[#fdfaf5] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="shrink-0 flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-stone-200">
            <button onClick={() => setReading(null)} className="text-[1rem] text-stone-600 px-1">← 목록</button>
            <span className={`text-[0.8125rem] font-bold px-2.5 py-1 rounded-full border ${STATUS[reading.status].className}`}>{STATUS[reading.status].label}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6">
            <p className="text-[1.125rem] font-bold text-stone-500 mb-1">{displayName(reading)}의 사연</p>
            <p className="text-[0.875rem] text-stone-400 mb-5">{when(reading.created_at)}{reading.name_display === 'anonymous' && ` · 보낸 분: ${reading.author_name || '교우'} (관리자만 보임)`}</p>
            {!reading.broadcast_ok && <p className="mb-4 text-[0.9375rem] font-bold text-red-600">⚠️ 방송에서 소개하지 말아 달라고 하셨어요</p>}
            <p className="text-[1.5rem] leading-[1.8] text-stone-900 whitespace-pre-wrap break-words">{reading.content}</p>
            {reading.image_url && <img src={reading.image_url} alt="사연 사진" onClick={() => setZoom(reading.image_url)} className="mt-6 max-w-full rounded-2xl" />}
          </div>
          <div className="shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-stone-200 flex gap-2">
            {reading.status !== 'aired'
              ? <button onClick={() => setStatus(reading, 'aired')} className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-bold">방송에서 소개했어요</button>
              : <button onClick={() => setStatus(reading, 'read')} className="flex-1 py-3 rounded-2xl border border-stone-300 text-stone-700 font-bold">소개 표시 취소</button>}
          </div>
        </div>
      )}

      <div className="bg-white w-full sm:w-[28rem] h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-stone-900 text-lg">💌 {isAdmin ? '사연함' : '사연 보내기'}</h2>
            <p className="text-xs text-stone-400 mt-0.5">{isAdmin ? '교우들이 보낸 사연 · 관리자만 보여요' : '운영자에게만 전달돼요 · 유튜브 방송에서 소개될 수 있어요'}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-2xl px-1" aria-label="닫기">×</button>
        </div>

        {!isAdmin && (
          <div className="flex border-b border-stone-100 shrink-0">
            {([['write', '사연 쓰기'], ['mine', '보낸 사연']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} className={`flex-1 py-3 text-[0.9375rem] font-bold border-b-2 ${view === k ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400'}`}>{label}</button>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-1.5 px-3 py-2.5 border-b border-stone-100 shrink-0 overflow-x-auto">
            {([['new', `새 사연 ${count('new')}`], ['read', `읽음 ${count('read')}`], ['aired', `소개함 ${count('aired')}`], ['all', '전체']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`shrink-0 px-3 py-1.5 rounded-full text-[0.8125rem] font-bold border ${filter === k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>{label}</button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {view === 'write' && (
            <div className="p-4 flex flex-col gap-4">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value.slice(0, 5000))}
                placeholder={'나누고 싶은 이야기, 감사한 일, 기도 부탁, 신앙 고민 등\n무엇이든 편하게 적어 주세요.'}
                rows={9}
                className="w-full px-4 py-3 rounded-2xl border border-stone-200 bg-stone-50 text-[1rem] leading-relaxed focus:outline-none focus:border-stone-400 resize-none"
              />
              <p className="-mt-3 text-right text-[0.75rem] text-stone-400">{content.length} / 5000</p>

              <div>
                <p className="text-[0.875rem] font-bold text-stone-700 mb-2">방송에서 이름은</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['anonymous', '익명으로'], ['name', `${authorName || '내 이름'}(으)로`]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setNameDisplay(k)} className={`py-3 rounded-xl border text-[0.9375rem] font-bold ${nameDisplay === k ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>{label}</button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200">
                <input type="checkbox" checked={broadcastOk} onChange={e => setBroadcastOk(e.target.checked)} className="w-5 h-5 accent-stone-900" />
                <span className="text-[0.9375rem] text-stone-800">유튜브 방송에서 소개해도 좋아요</span>
              </label>

              {photo ? (
                <div className="relative self-start">
                  <img src={photo.url} alt="" className="max-h-40 rounded-xl border border-stone-200" />
                  <button onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-black/70 text-white" aria-label="사진 빼기">×</button>
                </div>
              ) : (
                <label className="self-start inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 text-stone-700 text-[0.875rem] font-bold cursor-pointer">
                  <Icon name="camera" className="w-4 h-4" />사진 첨부 (선택)
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); }} />
                </label>
              )}

              <button onClick={send} disabled={!content.trim() || sending} className="w-full py-3.5 rounded-2xl bg-rose-600 disabled:bg-stone-300 text-white font-bold text-[1rem]">
                {sending ? '보내는 중...' : '💌 사연 보내기'}
              </button>
              <p className="text-[0.75rem] text-stone-400 leading-relaxed">보내신 사연은 운영자에게만 전달됩니다. 다른 교우에게는 보이지 않아요. 운영자가 읽기 전에는 &lsquo;보낸 사연&rsquo;에서 지울 수 있어요.</p>
            </div>
          )}

          {view !== 'write' && (
            <div className="divide-y divide-stone-100">
              {error && <p className="p-10 text-center text-sm text-stone-500">{error}</p>}
              {!error && !items && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
              {!error && items && shown.length === 0 && <p className="p-10 text-center text-sm text-stone-400">{view === 'mine' ? '아직 보낸 사연이 없어요.' : '사연이 없어요.'}</p>}
              {shown.map(l => (
                <div key={l.id} className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[0.75rem] font-bold px-2 py-0.5 rounded-full border ${STATUS[l.status].className}`}>{view === 'mine' ? STATUS[l.status].mine : STATUS[l.status].label}</span>
                    {view === 'inbox' && <span className="text-[0.8125rem] font-bold text-stone-800">{displayName(l)}</span>}
                    {view === 'inbox' && l.name_display === 'anonymous' && <span className="text-[0.75rem] text-stone-400">({l.author_name || '교우'})</span>}
                    {!l.broadcast_ok && <span className="text-[0.75rem] font-bold text-red-600">방송 소개 안 함</span>}
                    <span className="ml-auto text-[0.75rem] text-stone-400">{when(l.created_at)}</span>
                  </div>
                  <p className={`text-[0.9375rem] text-stone-800 whitespace-pre-wrap break-words ${view === 'inbox' ? 'line-clamp-4' : ''}`}>{l.content}</p>
                  {l.image_url && <button onClick={() => setZoom(l.image_url)} className="self-start"><img loading="lazy" src={l.image_url} alt="사연 사진" className="max-h-32 rounded-xl border border-stone-200 object-cover" /></button>}
                  <div className="flex gap-2">
                    {view === 'inbox' && <button onClick={() => openReading(l)} className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-[0.8125rem] font-bold">크게 읽기</button>}
                    {view === 'inbox' && l.status === 'new' && <button onClick={() => setStatus(l, 'read')} className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 text-[0.8125rem] font-bold">읽음으로</button>}
                    {view === 'inbox' && l.status !== 'aired' && <button onClick={() => setStatus(l, 'aired')} className="px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-[0.8125rem] font-bold">소개함</button>}
                    {(view === 'inbox' || l.status === 'new') && <button onClick={() => remove(l)} className="ml-auto px-2 py-1.5 text-stone-400 text-[0.8125rem]">지우기</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
