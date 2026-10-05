'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import RoleBadge from '@/components/RoleBadge';
import { formatFeastDay } from '@/lib/feast';

export interface AdminMember {
  id: string;
  email: string | null;
  provider: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  baptismal_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  badge_type: string | null;
  feast_day: string | null;
  posts: number;
  followers: number;
  open_reports: number;
  push: boolean;
  suspended: boolean;
  is_admin: boolean;
}

type Filter = 'all' | 'reported' | 'suspended' | 'incomplete';

const PAGE = 40;
const DAY = 24 * 3600e3;

const callApi = async (method: 'GET' | 'POST', body?: object) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: '로그인이 필요합니다.' };
  const res = await fetch('/api/admin/members', {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!res) return { error: '네트워크 오류가 발생했습니다.' };
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { error: json.error || '요청을 처리하지 못했습니다.' };
};

const relative = (iso: string | null) => {
  if (!iso) return '없음';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3600e3) return `${Math.max(1, Math.floor(diff / 60e3))}분 전`;
  if (diff < DAY) return `${Math.floor(diff / 3600e3)}시간 전`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
};

const PROVIDERS: Record<string, string> = { kakao: '카카오', google: '구글', email: '이메일' };

// 관리자 전용: 가입 회원 상태 확인 + 메시지 / 이용 정지 / 정지 해제
export default function AdminMembers({ onClose, onMessage, onOpenProfile }: {
  onClose: () => void;
  onMessage: (member: { id: string; baptismal_name: string; handle?: string; avatar_url?: string; badge_type?: string }) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const result = await callApi('GET');
    if (result.error) { setError(result.error); return; }
    setError('');
    setMembers(result.members);
  };

  useEffect(() => { load(); }, []);

  const toggleSuspend = async (m: AdminMember) => {
    const name = m.baptismal_name || m.email || '이 회원';
    const ok = m.suspended
      ? window.confirm(`${name}님의 이용 정지를 해제할까요?`)
      : window.confirm(`${name}님을 이용 정지할까요?\n로그인이 막히고, 이미 로그인한 기기도 1시간 안에 로그아웃됩니다.`);
    if (!ok) return;
    setBusyId(m.id);
    const result = await callApi('POST', { action: m.suspended ? 'unsuspend' : 'suspend', userId: m.id });
    setBusyId(null);
    if (result.error) { alert(result.error); return; }
    setMembers(prev => prev?.map(x => x.id === m.id ? { ...x, suspended: !!result.suspended } : x) || prev);
  };

  const stats = useMemo(() => {
    const list = members || [];
    const now = Date.now();
    return {
      total: list.length,
      newWeek: list.filter(m => now - new Date(m.created_at).getTime() < 7 * DAY).length,
      activeWeek: list.filter(m => m.last_sign_in_at && now - new Date(m.last_sign_in_at).getTime() < 7 * DAY).length,
      reported: list.filter(m => m.open_reports > 0).length,
      suspended: list.filter(m => m.suspended).length,
      incomplete: list.filter(m => !m.baptismal_name || !m.handle).length,
    };
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    return (members || []).filter(m => {
      if (filter === 'reported' && m.open_reports === 0) return false;
      if (filter === 'suspended' && !m.suspended) return false;
      if (filter === 'incomplete' && m.baptismal_name && m.handle) return false;
      if (!q) return true;
      return [m.baptismal_name, m.handle, m.email].some(v => v?.toLowerCase().includes(q));
    });
  }, [members, query, filter]);

  const chip = (key: Filter, label: string, count: number) => (
    <button
      key={key}
      onClick={() => { setFilter(key); setLimit(PAGE); }}
      className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-bold ${filter === key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}
    >
      {label} {count}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:w-[28rem] h-[92dvh] sm:h-[85dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-bold text-stone-900">👥 회원 관리</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { setMembers(null); load(); }} className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600">새로고침</button>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
          </div>
        </div>

        {error ? (
          <div className="p-10 text-center text-sm text-red-600">{error}</div>
        ) : !members ? (
          <div className="p-10 text-center text-sm text-stone-400">불러오는 중...</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 p-3 border-b border-stone-100 bg-stone-50">
              {[
                ['전체 회원', stats.total],
                ['이번 주 가입', stats.newWeek],
                ['이번 주 접속', stats.activeWeek],
              ].map(([label, value]) => (
                <div key={label} className="bg-white rounded-xl border border-stone-200 p-2 text-center">
                  <p className="text-lg font-bold text-stone-900">{value}</p>
                  <p className="text-[0.75rem] text-stone-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="p-3 flex flex-col gap-2 border-b border-stone-100">
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setLimit(PAGE); }}
                placeholder="이름, @핸들, 이메일 검색"
                className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
                {chip('all', '전체', stats.total)}
                {chip('reported', '🚨 신고됨', stats.reported)}
                {chip('suspended', '⛔ 정지됨', stats.suspended)}
                {chip('incomplete', '프로필 미완성', stats.incomplete)}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
              {filtered.length === 0 && <div className="p-10 text-center text-sm text-stone-400">해당하는 회원이 없습니다.</div>}
              {filtered.slice(0, limit).map(m => {
                const name = m.baptismal_name || '(프로필 미완성)';
                return (
                  <div key={m.id} className={`p-4 flex flex-col gap-2.5 ${m.suspended ? 'bg-red-50/60' : ''}`}>
                    <button onClick={() => m.handle && onOpenProfile(m.id)} className="flex items-center gap-3 text-left min-w-0">
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border border-stone-200 shrink-0" />
                        : <div className="w-11 h-11 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-sm font-serif font-bold shrink-0">{name[0]}</div>}
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.9375rem] font-bold text-stone-900 flex items-center gap-1 flex-wrap">
                          <span className="truncate">{name}</span>
                          <RoleBadge type={m.badge_type || undefined} size="xs" showLabel={false} />
                          {m.is_admin && <span className="text-[0.6875rem] px-1.5 py-px rounded bg-stone-900 text-white">관리자</span>}
                          {m.suspended && <span className="text-[0.6875rem] px-1.5 py-px rounded bg-red-600 text-white">이용 정지</span>}
                          {m.open_reports > 0 && <span className="text-[0.6875rem] px-1.5 py-px rounded bg-amber-500 text-white">신고 {m.open_reports}</span>}
                        </p>
                        <p className="text-xs text-stone-500 truncate">{m.handle ? `@${m.handle}` : '핸들 없음'} · {m.email || '이메일 없음'}</p>
                      </div>
                    </button>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-600 bg-stone-50 rounded-xl p-2.5">
                      <span>가입: {new Date(m.created_at).toLocaleDateString('ko-KR')}</span>
                      <span>최근 접속: {relative(m.last_sign_in_at)}</span>
                      <span>로그인: {PROVIDERS[m.provider || ''] || m.provider || '-'}</span>
                      <span>게시글 {m.posts} · 팔로워 {m.followers}</span>
                      <span>휴대폰 알림: {m.push ? '켜짐' : '꺼짐'}</span>
                      <span>축일: {m.feast_day ? formatFeastDay(m.feast_day) : '미등록'}</span>
                    </div>
                    {!m.is_admin && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => onMessage({ id: m.id, baptismal_name: name, handle: m.handle || undefined, avatar_url: m.avatar_url || undefined, badge_type: m.badge_type || undefined })}
                          disabled={!m.handle}
                          className="flex-1 text-xs py-2 rounded-lg border border-stone-300 text-stone-700 font-bold disabled:opacity-40"
                        >
                          ✉️ 메시지
                        </button>
                        <button
                          onClick={() => toggleSuspend(m)}
                          disabled={busyId === m.id}
                          className={`flex-1 text-xs py-2 rounded-lg font-bold disabled:opacity-50 ${m.suspended ? 'bg-stone-900 text-white' : 'border border-red-300 text-red-600'}`}
                        >
                          {busyId === m.id ? '처리 중...' : m.suspended ? '정지 해제' : '⛔ 이용 정지'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length > limit && (
                <button onClick={() => setLimit(l => l + PAGE)} className="w-full p-4 text-sm text-stone-600 font-bold">더 보기 ({filtered.length - limit}명 남음)</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
