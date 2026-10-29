'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BgmTrack } from '@/lib/music';
import BottomSheet from '@/components/BottomSheet';
import Icon from '@/components/Icon';
import { askConfirm, showAlert } from '@/components/ConfirmDialog';

// 관리자: 보관 음악 한 곡을 교우에게 선물하기·거두기 ('🔒 보관 음악' → 곡의 '🎁 선물')
//  - 선물은 music_grants 표 (supabase/profile-music.sql). 받은 교우는 그 노래를 내 공간 음악·게시글 음악으로 쓸 수 있다
//    (예: 보이는 라디오 사연에 뽑힌 교우에게 그 사연으로 만든 노래). 선물받은 교우에게는 선물 상자 + 휴대폰 알림
interface Member { id: string; baptismal_name: string; handle: string | null; avatar_url: string | null }
interface Grant { id: string; user_id: string; note: string | null; member?: Member }
const SETUP = { title: '노래 선물을 준비 중이에요', message: '먼저 supabase/profile-music.sql 을 Supabase SQL Editor 에서 한 번 실행해 주세요.', icon: 'gift' as const };
const isMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));

export default function MusicGift({ track, onClose, onGifted }: {
  track: BgmTrack;
  onClose: () => void;
  onGifted?: (grantId: string) => void; // 받은 교우에게 휴대폰 알림
}) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('music_grants').select('id, user_id, note').eq('track_id', track.id).order('created_at');
    if (error) { setGrants([]); if (isMissing(error)) showAlert(SETUP); return; }
    const rows = (data || []) as Grant[];
    const ids = rows.map(r => r.user_id);
    const { data: people } = ids.length ? await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url').in('id', ids) : { data: [] };
    setGrants(rows.map(r => ({ ...r, member: (people || []).find(p => p.id === r.user_id) as Member | undefined })));
  }, [track.id]);
  useEffect(() => { load(); }, [load]);

  // 교우 찾기 (이름·@아이디, 잠깐 멈추면)
  useEffect(() => {
    const text = q.replace(/^@/, '').replace(/[,()%*]/g, '').trim();
    if (!text) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, baptismal_name, handle, avatar_url')
        .or(`handle.ilike.%${text}%,baptismal_name.ilike.%${text}%`).limit(20);
      setResults((data || []) as Member[]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const give = async (m: Member) => {
    if (!(await askConfirm({ title: `${m.baptismal_name}님께 노래를 선물할까요?`, message: `'${track.title}'\n받은 교우는 내 공간 배경음악·게시글 음악으로 쓸 수 있고, 선물 상자와 알림이 가요.`, ok: '선물하기', icon: 'gift' }))) return;
    setBusy(m.id);
    const { data, error } = await supabase.from('music_grants').insert({ user_id: m.id, track_id: track.id, note: note.trim() || null }).select('id').single();
    setBusy(null);
    if (error) { await showAlert(isMissing(error) ? SETUP : { title: '선물하지 못했어요', message: error.code === '23505' ? '이미 이 노래를 선물한 교우예요.' : error.message }); return; }
    if (data?.id) onGifted?.(data.id as string);
    setQ(''); setResults([]);
    load();
  };
  const take = async (g: Grant) => {
    const name = g.member?.baptismal_name || '교우';
    if (!(await askConfirm({ title: `${name}님께 준 노래를 거둘까요?`, message: '그 교우의 공간·게시글에서 이 노래가 더 이상 나오지 않아요.', ok: '거두기', danger: true }))) return;
    setBusy(g.id);
    const { error } = await supabase.from('music_grants').delete().eq('id', g.id);
    setBusy(null);
    if (error) { await showAlert({ title: '거두지 못했어요', message: error.message }); return; }
    load();
  };

  const giftedIds = new Set((grants || []).map(g => g.user_id));
  const avatar = (m?: Member) => m?.avatar_url
    ? <img src={m.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200 shrink-0" />
    : <span className="w-10 h-10 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold shrink-0">{(m?.baptismal_name || '교').slice(0, 1)}</span>;

  return (
    <BottomSheet bare label="노래 선물" onClose={onClose} z="z-[88]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-stone-900">🎁 노래 선물하기</h2>
            <p className="mt-0.5 text-sm text-violet-800 font-bold truncate">🎵 {track.title}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1 shrink-0" aria-label="닫기">×</button>
        </div>
        <div className="overflow-y-auto flex flex-col">
          <div className="p-4 flex flex-col gap-2.5 bg-stone-50 border-b border-stone-100">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-stone-600">선물하며 남길 말 (선택 · 받는 분 화면에 보여요)</span>
              <input value={note} onChange={e => setNote(e.target.value.slice(0, 100))} placeholder="예: 보이는 라디오 사연 선물 🎵" className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-stone-600">받을 교우</span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름이나 @아이디로 찾기" type="search" autoComplete="off" className="w-full px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400" />
            </label>
            {q.trim() && (
              <div className="rounded-xl bg-white border border-stone-200 divide-y divide-stone-100">
                {results.length === 0 ? (
                  <p className="p-4 text-center text-sm text-stone-400">{searching ? '찾는 중…' : '찾는 교우가 없어요'}</p>
                ) : results.map(m => (
                  <div key={m.id} className="p-2.5 flex items-center gap-2.5">
                    {avatar(m)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{m.baptismal_name}</p>
                      {m.handle && <p className="text-xs text-stone-400 truncate">@{m.handle}</p>}
                    </div>
                    {giftedIds.has(m.id)
                      ? <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold shrink-0">✓ 선물함</span>
                      : <button onClick={() => give(m)} disabled={!!busy} className="text-xs px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold shrink-0 disabled:opacity-40">{busy === m.id ? '보내는 중…' : '🎁 선물하기'}</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="px-4 pt-4 pb-1 text-xs font-bold text-stone-500">이 노래를 받은 교우 {grants?.length ? `${grants.length}명` : ''}</p>
          {!grants ? (
            <p className="p-6 text-center text-sm text-stone-400">불러오는 중...</p>
          ) : grants.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">아직 아무에게도 선물하지 않았어요</p>
          ) : (
            <div className="divide-y divide-stone-100 pb-4">
              {grants.map(g => (
                <div key={g.id} className="px-4 py-3 flex items-center gap-2.5">
                  {avatar(g.member)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-800 truncate">{g.member?.baptismal_name || '교우'}{g.member?.handle && <span className="ml-1 text-xs font-normal text-stone-400">@{g.member.handle}</span>}</p>
                    {g.note && <p className="text-xs text-amber-700 truncate"><Icon name="gift" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-0.5" />{g.note}</p>}
                  </div>
                  <button onClick={() => take(g)} disabled={!!busy} className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 shrink-0 disabled:opacity-40">거두기</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
