'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import BottomSheet from '@/components/BottomSheet';

// 관리자 전용 데이터 사용량: 저장 공간(데이터베이스·사진·영상), 회원·글 수, 종류별 크기, 요금 화면 바로 가기
interface SupabaseUsage {
  setupNeeded?: boolean;
  members: number; active30: number; active7: number; new30: number;
  dbBytes: number; storageBytes: number;
  buckets: { name: string; files: number; bytes: number }[];
  tables: { name: string; rows: number; bytes: number }[];
  counts: { posts: number; posts30: number; comments: number; messages: number; reactions: number };
}
// estimated: 사진 저장소가 예전 코드라 앱에서 쓰는 파일만 하나씩 크기를 물어 더한 값
type R2Usage = { bytes: number; files: number; byKind: Record<string, { bytes: number; files: number }>; estimated?: boolean };
interface Usage { supabase: SupabaseUsage; r2: R2Usage | null; checkedAt: string }

const GB = 1024 ** 3;
// 요금제에 포함된 양 (Supabase Pro, Cloudflare R2 무료 범위)
const LIMITS = { db: 8 * GB, storage: 100 * GB, r2: 10 * GB };

const size = (b: number) => {
  if (b < 1024 * 1024) return `${Math.max(0, Math.round(b / 1024))}KB`;
  if (b < GB) { const mb = b / 1024 / 1024; return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`; }
  return `${parseFloat((b / GB).toFixed(2))}GB`;
};
const pct = (b: number, limit: number) => (b / limit) * 100;
const pctText = (p: number) => (p < 0.1 ? '0.1% 미만' : `${p < 10 ? p.toFixed(1) : Math.round(p)}%`);

const KIND_LABELS: Record<string, string> = {
  posts: '게시물 사진', videos: '영상', posters: '영상 표지', avatars: '프로필 사진', stories: '스토리',
  dm: '메시지 사진', feedback: '건의 사진', letters: '사연 사진', sponsor: '광고 배너', bgm: '배경음악',
};
const TABLE_LABELS: Record<string, string> = {
  posts: '글', comments: '댓글', messages: '1:1 메시지', post_reactions: '기도·공감', comment_reactions: '댓글 하트',
  app_sessions: '접속 기록', lounge_messages: '사랑방 대화', lounge_trash: '사랑방 지운 대화', profiles: '회원 정보',
  push_subscriptions: '알림 기기', follows: '팔로우', prayer_intentions: '기도지향', intention_prayers: '함께 기도',
  letters: '사연', feedback: '건의', reports: '신고', anon_posts: '익명 고민', anon_replies: '익명 답글',
  interest_events: '검색 기록', deleted_messages: '지운 메시지 보관', announcements: '공지', message_reactions: '메시지 하트',
  blocks: '차단', profile_private: '실명', sponsor_banners: '광고 배너', bgm_tracks: '배경음악',
};

export default function AdminUsage({ onClose }: { onClose: () => void }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');

  const fetchUsage = async (): Promise<{ usage?: Usage; error?: string }> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/usage', { headers: { Authorization: `Bearer ${session?.access_token}` }, cache: 'no-store' }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    return res?.ok ? { usage: json } : { error: json.error || '사용량을 불러오지 못했어요.' };
  };
  const apply = (r: { usage?: Usage; error?: string }) => { setError(r.error || ''); if (r.usage) setUsage(r.usage); };
  const load = () => fetchUsage().then(apply);
  useEffect(() => { fetchUsage().then(apply); }, []);

  const s = usage?.supabase;
  const r2 = usage?.r2 || null;
  const tile = 'bg-white border border-stone-200 rounded-2xl p-3.5';

  // 저장 공간 막대: 절반 넘으면 노랑, 80% 넘으면 빨강
  const bar = (label: string, sub: string, bytes: number, limit: number) => {
    const p = pct(bytes, limit);
    return (
      <div className={tile}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-stone-800">{label}</p>
          <p className="text-sm font-bold text-stone-900 shrink-0">{size(bytes)} <span className="text-stone-400 font-normal">/ {size(limit)}</span></p>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-stone-100 overflow-hidden">
          <div className={`h-full rounded-full ${p >= 80 ? 'bg-red-500' : p >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(2, Math.min(100, p))}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-stone-500">{pctText(p)} 사용 · {sub}</p>
      </div>
    );
  };
  const row = (label: string, value: string, key?: string) => (
    <div key={key || label} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 text-sm">
      <span className="text-stone-700">{label}</span>
      <span className="font-bold text-stone-900">{value}</span>
    </div>
  );
  const link = (href: string, label: string, sub: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between py-2.5 border-b border-stone-100 last:border-0">
      <span><span className="block text-sm font-bold text-stone-800">{label}</span><span className="block text-xs text-stone-500">{sub}</span></span>
      <span className="text-blue-600 text-sm font-bold shrink-0">열기 ›</span>
    </a>
  );

  return (
    <BottomSheet bare label="사용량" onClose={onClose} z="z-[86]" tone="bg-stone-50">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 bg-white border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-stone-900"><Icon name="stack" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />데이터 사용량</h2>
            {usage && <p className="text-[0.75rem] text-stone-400">{new Date(usage.checkedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 기준</p>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">새로 고침</button>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-2" aria-label="닫기">×</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {error && <p className="p-6 text-center text-sm text-red-600">{error}</p>}
          {!usage && !error && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
          {s?.setupNeeded && (
            <p className="p-6 text-center text-sm text-stone-500 leading-relaxed">데이터 사용량을 준비 중이에요.<br /><span className="text-xs">(Supabase에서 <code>supabase/admin-usage.sql</code> 실행 필요)</span></p>
          )}

          {usage && (
            <>
              <p className="text-sm font-bold text-stone-700">저장 공간</p>
              {s && !s.setupNeeded && bar('데이터베이스', 'Supabase · 글·댓글·회원 정보 등 (요금제 포함량)', s.dbBytes, LIMITS.db)}
              {r2
                ? bar('사진·영상', `Cloudflare R2 · ${r2.estimated ? '앱에서 쓰는 ' : ''}파일 ${r2.files.toLocaleString()}개 (무료 범위)`, r2.bytes, LIMITS.r2)
                : (
                  <div className={`${tile} text-sm text-stone-600 leading-relaxed`}>
                    <p className="font-bold text-stone-800">사진·영상 (Cloudflare R2)</p>
                    <p className="text-xs mt-1">사진 저장소가 연결되어 있지 않아요.</p>
                  </div>
                )}
              {s && !s.setupNeeded && bar('예전 사진 저장소', 'Supabase Storage · 사진 저장소를 옮기기 전에 올린 파일 (요금제 포함량)', s.storageBytes, LIMITS.storage)}

              {s && !s.setupNeeded && (
                <>
                  <p className="text-sm font-bold text-stone-700 mt-1">회원</p>
                  <div className={tile}>
                    {row('전체 회원', `${s.members.toLocaleString()}명`)}
                    {row('최근 30일 동안 로그인', `${s.active30.toLocaleString()}명`)}
                    {row('최근 7일 동안 로그인', `${s.active7.toLocaleString()}명`)}
                    {row('최근 30일 새로 가입', `${s.new30.toLocaleString()}명`)}
                  </div>

                  <p className="text-sm font-bold text-stone-700 mt-1">글·대화</p>
                  <div className={tile}>
                    {row('글 (스토리 포함)', `${s.counts.posts.toLocaleString()}개 · 최근 30일 ${s.counts.posts30.toLocaleString()}개`)}
                    {row('댓글', `${s.counts.comments.toLocaleString()}개`)}
                    {row('1:1 메시지', `${s.counts.messages.toLocaleString()}개`)}
                    {row('기도·공감', `${s.counts.reactions.toLocaleString()}번`)}
                  </div>
                </>
              )}

              {r2 && Object.keys(r2.byKind).length > 0 && (
                <>
                  <p className="text-sm font-bold text-stone-700 mt-1">사진·영상 종류별</p>
                  <div className={tile}>
                    {Object.entries(r2.byKind).sort((a, b) => b[1].bytes - a[1].bytes)
                      .map(([kind, v]) => row(KIND_LABELS[kind] || kind, `${size(v.bytes)} · ${v.files.toLocaleString()}개`, kind))}
                  </div>
                </>
              )}

              {s && !s.setupNeeded && s.buckets.length > 0 && (
                <>
                  <p className="text-sm font-bold text-stone-700 mt-1">예전 사진 저장소 종류별</p>
                  <div className={tile}>
                    {s.buckets.map(b => row(b.name, `${size(b.bytes)} · ${b.files.toLocaleString()}개`, b.name))}
                  </div>
                </>
              )}

              {s && !s.setupNeeded && s.tables.length > 0 && (
                <>
                  <p className="text-sm font-bold text-stone-700 mt-1">데이터베이스에서 큰 것</p>
                  <div className={tile}>
                    {s.tables.slice(0, 8).map(t => row(TABLE_LABELS[t.name] || t.name, `${size(t.bytes)}${t.rows ? ` · 약 ${t.rows.toLocaleString()}줄` : ''}`, t.name))}
                  </div>
                </>
              )}

              <p className="text-sm font-bold text-stone-700 mt-1">요금 화면 바로 가기</p>
              <div className={tile}>
                {link('https://vercel.com/dashboard', 'Vercel (앱 화면)', 'Usage에서 이번 달 비용 · 앱 안에서는 볼 수 없어요')}
                {link('https://supabase.com/dashboard/org/_/usage', 'Supabase (데이터베이스·로그인)', '내보낸 데이터 양·월 사용자 수')}
                {link('https://dash.cloudflare.com/?to=/:account/r2/overview', 'Cloudflare R2 (사진·영상)', '저장 용량·요청 수')}
              </div>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
