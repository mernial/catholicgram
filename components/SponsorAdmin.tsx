'use client';

import { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';
import type { SponsorBannerData } from '@/lib/sponsor';
import SponsorBanner from '@/components/SponsorBanner';

// 관리자 전용: 후원 배너 등록 / 수정 / 중지 / 삭제 + 노출·클릭 통계

type Draft = {
  id?: string;
  sponsor_name: string;
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  placement: SponsorBannerData['placement'];
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD (그날까지 노출)
  active: boolean;
  priority: number;
};

const EMPTY: Draft = {
  sponsor_name: '', title: '', description: '', image_url: '', link_url: '',
  placement: 'feed', start_date: '', end_date: '', active: true, priority: 0,
};

const PLACEMENTS: { key: SponsorBannerData['placement']; label: string }[] = [
  { key: 'feed', label: '피드 게시물형' },
  { key: 'top', label: '홈 맨 위 배너' },
  { key: 'both', label: '둘 다' },
];

// 날짜 <-> 저장값 (종료일은 그날 하루 끝까지 노출)
const toDateInput = (iso: string | null, isEnd = false) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isEnd) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fromDateInput = (value: string, isEnd = false) => {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, isEnd ? d + 1 : d).toISOString();
};

const statusOf = (b: SponsorBannerData) => {
  const now = Date.now();
  if (!b.active) return { label: '중지', className: 'bg-stone-100 text-stone-500 border-stone-200' };
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return { label: '예정', className: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return { label: '종료', className: 'bg-stone-100 text-stone-500 border-stone-200' };
  return { label: '진행 중', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
};

export default function SponsorAdmin({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [banners, setBanners] = useState<SponsorBannerData[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('sponsor_banners').select('*').order('created_at', { ascending: false });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) setSetupNeeded(true);
      return;
    }
    setBanners((data || []) as SponsorBannerData[]);
  };

  useEffect(() => { load(); }, []);

  const edit = (b: SponsorBannerData) => setDraft({
    id: b.id,
    sponsor_name: b.sponsor_name,
    title: b.title,
    description: b.description || '',
    image_url: b.image_url || '',
    link_url: b.link_url || '',
    placement: b.placement,
    start_date: toDateInput(b.starts_at),
    end_date: toDateInput(b.ends_at, true),
    active: b.active,
    priority: b.priority,
  });

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1500, useWebWorker: false });
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage.from('sponsor-banners').upload(name, compressed, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('sponsor-banners').getPublicUrl(name);
      setDraft(d => d ? { ...d, image_url: publicUrl } : d);
    } catch (err) {
      alert(`이미지를 올리지 못했습니다.\n(${err instanceof Error ? err.message : '알 수 없는 오류'})`);
    }
    setUploading(false);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.sponsor_name.trim() || !draft.title.trim()) { alert('후원 업체 이름과 배너 문구는 꼭 입력해주세요.'); return; }
    let link = draft.link_url.trim();
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    const row = {
      sponsor_name: draft.sponsor_name.trim(),
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      image_url: draft.image_url || null,
      link_url: link || null,
      placement: draft.placement,
      starts_at: fromDateInput(draft.start_date),
      ends_at: fromDateInput(draft.end_date, true),
      active: draft.active,
      priority: Number(draft.priority) || 0,
    };
    setSaving(true);
    const { error } = draft.id
      ? await supabase.from('sponsor_banners').update(row).eq('id', draft.id)
      : await supabase.from('sponsor_banners').insert(row);
    setSaving(false);
    if (error) { alert(`저장하지 못했습니다.\n(${error.message})`); return; }
    setDraft(null);
    load();
    onChanged();
  };

  const toggleActive = async (b: SponsorBannerData) => {
    const { error } = await supabase.from('sponsor_banners').update({ active: !b.active }).eq('id', b.id);
    if (error) { alert(error.message); return; }
    load();
    onChanged();
  };

  const remove = async (b: SponsorBannerData) => {
    if (!window.confirm(`'${b.title}' 배너를 삭제할까요? 통계도 함께 삭제됩니다.`)) return;
    const { error } = await supabase.from('sponsor_banners').delete().eq('id', b.id);
    if (error) { alert(error.message); return; }
    load();
    onChanged();
  };

  const input = 'w-full text-sm p-2.5 border border-stone-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-200';
  const label = 'text-[11px] font-bold text-stone-500 mb-1 block';
  const preview: SponsorBannerData | null = draft ? {
    id: 'preview', sponsor_name: draft.sponsor_name || '후원 업체', title: draft.title || '배너 문구', description: draft.description || null,
    image_url: draft.image_url || null, link_url: draft.link_url || null, placement: draft.placement, starts_at: null, ends_at: null,
    active: true, priority: 0, impressions: 0, clicks: 0, created_at: '',
  } : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[30rem] max-h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          {draft
            ? <button onClick={() => setDraft(null)} className="text-sm font-bold text-stone-900">← {draft.id ? '배너 수정' : '새 배너'}</button>
            : <h2 className="font-bold text-stone-900">📢 광고 관리</h2>}
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
        </div>

        {setupNeeded ? (
          <div className="p-10 text-center text-sm text-stone-500 leading-relaxed">
            후원 배너 준비 중입니다.<br />
            <span className="text-xs">(Supabase에서 <code>supabase/sponsor-banners.sql</code> 을 실행해주세요)</span>
          </div>
        ) : draft ? (
          <div className="overflow-y-auto p-4 flex flex-col gap-3">
            <div>
              <span className={label}>미리보기</span>
              <div className="rounded-2xl border border-dashed border-stone-200 -mx-1">{preview && <SponsorBanner banner={preview} variant={draft.placement === 'top' ? 'top' : 'feed'} />}</div>
            </div>
            <div><span className={label}>후원 업체 이름 *</span><input className={input} value={draft.sponsor_name} onChange={e => setDraft({ ...draft, sponsor_name: e.target.value })} placeholder="예: 바오로 성물방" /></div>
            <div><span className={label}>광고 제목 *</span><input className={input} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} maxLength={60} placeholder="예: 대림 시기 묵주 기획전 20% 할인" /></div>
            <div><span className={label}>광고 본문</span><input className={input} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={200} placeholder="예: 가톨릭그램 교우님께 무료 각인 서비스" /></div>
            <div><span className={label}>연결할 주소 (누르면 이동)</span><input className={input} value={draft.link_url} onChange={e => setDraft({ ...draft, link_url: e.target.value })} placeholder="예: https://store.example.com" inputMode="url" /></div>
            <div>
              <span className={label}>광고 사진 (피드 게시물형: 정사각형 1080×1080 권장 / 맨 위 배너: 가로 3:1)</span>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer text-xs px-3 py-2 rounded-xl border border-stone-300 bg-white font-bold">
                  {uploading ? '올리는 중...' : draft.image_url ? '이미지 바꾸기' : '이미지 올리기'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }} />
                </label>
                {draft.image_url && <button onClick={() => setDraft({ ...draft, image_url: '' })} className="text-xs text-stone-400">이미지 빼기</button>}
              </div>
            </div>
            <div>
              <span className={label}>노출 위치</span>
              <div className="flex gap-1.5">
                {PLACEMENTS.map(p => (
                  <button key={p.key} onClick={() => setDraft({ ...draft, placement: p.key })} className={`text-xs px-3 py-1.5 rounded-full border ${draft.placement === p.key ? 'bg-amber-500 text-white border-amber-500 font-bold' : 'bg-white text-stone-600 border-stone-200'}`}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className={label}>시작일 (비우면 바로)</span><input type="date" className={input} value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></div>
              <div><span className={label}>종료일 (그날까지, 비우면 계속)</span><input type="date" className={input} value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 items-end">
              <div><span className={label}>우선순위 (높을수록 먼저)</span><input type="number" className={input} value={draft.priority} onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })} /></div>
              <label className="flex items-center gap-2 text-sm text-stone-700 pb-2.5">
                <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} className="w-4 h-4" /> 노출하기
              </label>
            </div>
            <button onClick={save} disabled={saving || uploading} className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40 mt-1">
              {saving ? '저장하는 중...' : '저장'}
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto">
            <div className="p-4 border-b border-stone-100">
              <button onClick={() => setDraft({ ...EMPTY })} className="w-full bg-amber-500 text-white py-2.5 rounded-xl text-sm font-bold">+ 새 광고 등록</button>
              <p className="text-[11px] text-stone-400 mt-2 leading-relaxed">광고는 홈 피드에 일반 게시글처럼 &lsquo;광고&rsquo; 표시와 함께 섞여 나오며, 고민상담·메시지에는 나오지 않습니다.</p>
            </div>
            {banners.length === 0 && <div className="p-10 text-center text-stone-400 text-sm">등록된 배너가 없습니다.</div>}
            <div className="divide-y divide-stone-100">
              {banners.map(b => {
                const st = statusOf(b);
                const ctr = b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) : '0.0';
                return (
                  <div key={b.id} className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900 truncate">{b.title}</p>
                        <p className="text-[11px] text-stone-500">{b.sponsor_name} · {PLACEMENTS.find(p => p.key === b.placement)?.label}</p>
                        <p className="text-[11px] text-stone-400">
                          {b.starts_at ? toDateInput(b.starts_at) : '즉시'} ~ {b.ends_at ? toDateInput(b.ends_at, true) : '계속'}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold shrink-0 ${st.className}`}>{st.label}</span>
                    </div>
                    <div className="grid grid-cols-3 text-center bg-stone-50 rounded-xl py-2">
                      <div><p className="text-sm font-bold text-stone-800">{b.impressions.toLocaleString()}</p><p className="text-[10px] text-stone-500">노출</p></div>
                      <div><p className="text-sm font-bold text-stone-800">{b.clicks.toLocaleString()}</p><p className="text-[10px] text-stone-500">클릭</p></div>
                      <div><p className="text-sm font-bold text-stone-800">{ctr}%</p><p className="text-[10px] text-stone-500">클릭률</p></div>
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => edit(b)} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700">수정</button>
                      <button onClick={() => toggleActive(b)} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700">{b.active ? '중지' : '다시 노출'}</button>
                      <button onClick={() => remove(b)} className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600">삭제</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
