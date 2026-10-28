'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import BottomSheet from '@/components/BottomSheet';
import { askConfirm } from '@/components/ConfirmDialog';

const LABELS: Record<string, string> = { posts: '게시물·스토리', profiles: '프로필 사진', messages: '메시지 사진', feedback: '건의 사진', letters: '사연 사진', sponsor_banners: '광고 배너', bgm_tracks: '배경음악' };

// 관리자 전용: 사진·영상 저장소(Cloudflare R2) 연결 확인, 비밀 열쇠 만들기, 기존 파일 옮기기
export default function MediaStorage({ onClose }: { onClose: () => void }) {
  const mediaUrl = (process.env.NEXT_PUBLIC_MEDIA_URL || '').replace(/\/+$/, '');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [workerOk, setWorkerOk] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState<Record<string, number> | null>(null);
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef(false);

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };
  const load = async () => {
    const res = await fetch('/api/admin/migrate-media', { headers: await authHeader() }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json) { setEnabled(!!json.enabled); setRemaining(json.remaining || {}); }
    else setEnabled(false);
    if (mediaUrl) {
      const ping = await fetch(mediaUrl, { cache: 'no-store' }).catch(() => null);
      const body = ping?.ok ? await ping.json().catch(() => null) : null;
      setWorkerOk(body?.service === 'catholicgram-media');
    } else setWorkerOk(false);
  };
  useEffect(() => { load(); }, []);

  const makeSecret = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    setSecret(Array.from(bytes, b => chars[b % chars.length]).join(''));
    setCopied(false);
  };
  const copySecret = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { setCopied(false); }
  };

  const total = remaining ? Object.values(remaining).reduce((a, b) => a + b, 0) : 0;
  const migrate = async () => {
    if (!(await askConfirm(`수파베이스에 있는 파일 ${total}개를 R2로 옮길까요?\n(옮기는 동안 화면을 켜 두세요. 수파베이스 쪽 원본은 지우지 않아요.)`))) return;
    setRunning(true); stopRef.current = false; setLog([]);
    let totalMoved = 0;
    for (let round = 1; !stopRef.current; round++) {
      const res = await fetch('/api/admin/migrate-media', { method: 'POST', headers: await authHeader() }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) { setLog(l => [...l, `멈춤: ${json.error || '서버 오류'}`]); break; }
      totalMoved += json.moved || 0;
      setRemaining(json.remaining || {});
      const left = Object.values((json.remaining || {}) as Record<string, number>).reduce((a, b) => a + b, 0);
      setLog(l => [...l, `${round}회: ${json.moved}개 옮김 · 남은 파일 ${left}개${json.failed?.length ? ` · 실패 ${json.failed.length}건` : ''}`, ...(json.failed || []).slice(0, 5).map((f: string) => `  ↳ ${f}`)]);
      if (left === 0) { setLog(l => [...l, `끝! 모두 ${totalMoved}개를 옮겼어요.`]); break; }
      if (!json.moved) { setLog(l => [...l, '더 옮길 수 있는 파일이 없어요. 실패한 파일은 원래 자리(수파베이스)에 그대로 있어요.']); break; }
    }
    setRunning(false);
  };

  const Row = ({ ok, label }: { ok: boolean | null; label: string }) => (
    <p className="flex items-center gap-2 text-[0.9375rem]">
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs ${ok === null ? 'bg-stone-300' : ok ? 'bg-emerald-500' : 'bg-red-400'}`}>{ok === null ? '…' : ok ? '✓' : '!'}</span>
      {label}
    </p>
  );

  return (
    <BottomSheet bare label="사진·영상 저장소" onClose={onClose} z="z-[86]" tone="bg-white">
      <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-stone-900"><Icon name="camera" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />사진 저장소</h2>
            <p className="text-xs text-stone-400 mt-0.5">Cloudflare R2 · 내려받는 전송량 무료 · 관리자만 보여요</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1" aria-label="닫기">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="font-bold text-stone-800">1. 연결 상태</h3>
            <Row ok={workerOk} label={workerOk ? 'Cloudflare Worker 연결됨' : mediaUrl ? 'Worker 에 연결되지 않아요 (주소·코드 확인)' : 'Worker 주소(NEXT_PUBLIC_MEDIA_URL)가 아직 없어요'} />
            <Row ok={enabled} label={enabled ? '올리기 설정 완료 — 새 사진·영상은 R2 로 저장돼요' : '올리기 설정 전 (R2_UPLOAD_SECRET) — 지금은 수파베이스에 저장돼요'} />
            <button onClick={load} className="self-start text-sm text-stone-500 underline">다시 확인</button>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-bold text-stone-800">2. 비밀 열쇠 만들기</h3>
            <p className="text-sm text-stone-500">Cloudflare Worker 의 <b>UPLOAD_SECRET</b> 과 Vercel 의 <b>R2_UPLOAD_SECRET</b> 에 똑같이 넣을 값이에요. 다른 사람에게 보여 주지 마세요.</p>
            {!secret ? (
              <button onClick={makeSecret} className="self-start px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-bold">비밀 열쇠 만들기</button>
            ) : (
              <>
                <code className="block break-all bg-stone-100 rounded-xl p-3 text-sm select-all">{secret}</code>
                <div className="flex gap-2">
                  <button onClick={copySecret} className="px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-bold">{copied ? '복사됨 ✓' : '복사하기'}</button>
                  <button onClick={makeSecret} className="px-4 py-2 rounded-xl border border-stone-200 text-sm">새로 만들기</button>
                </div>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-bold text-stone-800">3. 기존 사진·영상 옮기기</h3>
            {remaining ? (
              <ul className="text-sm text-stone-600">
                {Object.entries(remaining).map(([k, n]) => <li key={k}>{LABELS[k] || k}: {n}개</li>)}
              </ul>
            ) : <p className="text-sm text-stone-400">확인 중...</p>}
            <button
              onClick={running ? () => { stopRef.current = true; } : migrate}
              disabled={!running && (!enabled || !workerOk || total === 0)}
              className="self-start px-4 py-2 rounded-xl bg-emerald-600 disabled:bg-stone-300 text-white text-sm font-bold"
            >
              {running ? '멈추기' : total === 0 && remaining ? '옮길 파일이 없어요' : `R2 로 옮기기 (${total}개)`}
            </button>
            {log.length > 0 && <pre className="text-xs text-stone-600 bg-stone-50 rounded-xl p-3 whitespace-pre-wrap">{log.join('\n')}</pre>}
          </section>
        </div>
      </div>
    </BottomSheet>
  );
}
