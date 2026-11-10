'use client';

// 설명 영상 녹음실 (관리자만 · /studio)
// 대본을 보면서 녹음을 누르고 읽은 뒤 끝내면, 녹음이 서버(app/api/studio)에 저장되어 영상 작업 쪽에서 바로 가져간다.
//  - 한 번의 녹음으로 여러 장을 이어 읽을 수 있다: 한 장을 다 읽으면 '다음 장'을 눌러 넘긴다 (넘긴 때가 함께 기록됨)
//  - 같은 장을 다시 녹음하면 가장 나중 녹음을 쓴다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ADMIN_EMAILS } from '@/lib/admin';
import { askConfirm } from '@/components/ConfirmDialog';
import { EXPLAINER_SCRIPT, NAME_SLOT, SCRIPT_VERSION } from '@/lib/explainer-script';

interface Take { id: string; from: number; to: number; secs: number; parts: number; names: string[]; size: number; ext: string }
interface Pending { id: string; blob: Blob; names: string[]; meta: string; from: number; to: number; secs: number; state: 'sending' | 'failed'; sent: number; why?: string }
interface WakeLock { release(): Promise<void> }

const PART_BYTES = 3 * 1024 * 1024;               // 서버가 받는 조각 크기 (app/api/studio 는 4MB 까지)
const SIZES = [1.125, 1.375, 1.625, 1.875, 2.25]; // 대본 글씨 크기 (rem)
const LAST = EXPLAINER_SCRIPT.length - 1;
const MIME: Record<string, string> = { webm: 'audio/webm', m4a: 'audio/mp4', ogg: 'audio/ogg' };
const NAME_RE = /^(t\d{13})_c(\d{2})-(\d{2})_d(\d{1,5})_p(\d{2})of(\d{2})\.(webm|m4a|ogg|bin)$/;
const pad = (n: number) => String(n).padStart(2, '0');
const mmss = (secs: number) => { const s = Math.max(0, Math.round(secs)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 없어도 됨 */ } };
const recall = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

// 서버 목록(조각 이름들) → 녹음 하나씩. 조각이 다 있는 녹음만
function parseTakes(files: { name: string; size: number }[]): Take[] {
  const map = new Map<string, Take>();
  for (const f of files) {
    const m = NAME_RE.exec(f.name);
    if (!m) continue;
    const t = map.get(m[1]) || { id: m[1], from: Number(m[2]), to: Number(m[3]), secs: Number(m[4]), parts: Number(m[6]), names: [], size: 0, ext: m[7] };
    t.names.push(f.name); t.size += f.size || 0;
    map.set(m[1], t);
  }
  return Array.from(map.values()).filter(t => t.names.length === t.parts).map(t => ({ ...t, names: [...t.names].sort() })).sort((a, b) => a.id.localeCompare(b.id));
}

async function api(query: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('로그인이 풀렸어요. 가톨릭그램에서 다시 로그인해 주세요.');
  return fetch('/api/studio' + query, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } });
}

export default function NarrationStudio() {
  const [gate, setGate] = useState<'loading' | 'signin' | 'forbidden' | 'ok'>('loading');
  const [name, setName] = useState('');
  const [ch, setCh] = useState(0);
  const [size, setSize] = useState(1);
  const [takes, setTakes] = useState<Take[]>([]);
  const [listError, setListError] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState('');
  const [play, setPlay] = useState<{ id: string; url: string } | null>(null);
  const [busyId, setBusyId] = useState('');
  const [quiet, setQuiet] = useState<string[]>([]);   // 소리가 작게 녹음된 녹음들

  const chRef = useRef(0);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; began: number } | null>(null);
  const meter = useRef<{ ac: AudioContext; raf: number } | null>(null);
  const marks = useRef<number[]>([]);
  const peak = useRef(0);
  const tick = useRef(0);
  const wake = useRef<WakeLock | null>(null);
  const bar = useRef<HTMLSpanElement | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  const localUrls = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    try {
      const r = await api('');
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setListError(body.error || `저장된 녹음 목록을 불러오지 못했어요 (${r.status})`); return; }
      setListError(''); setTakes(parseTakes(body.files || []));
    } catch (e) {
      setListError(e instanceof Error ? e.message : '저장된 녹음 목록을 불러오지 못했어요');
    }
  }, []);

  // 들어오면: 관리자인지 보고, 닉네임과 저장된 녹음 목록을 불러온다
  useEffect(() => {
    let off = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (off) return;
      if (!u) { setGate('signin'); return; }
      if (!u.email || !ADMIN_EMAILS.includes(u.email)) { setGate('forbidden'); return; }
      const { data: p } = await supabase.from('profiles').select('baptismal_name').eq('id', u.id).maybeSingle();
      if (off) return;
      const at = Number(recall('studioChapter'));
      const sz = Number(recall('studioSize'));
      if (Number.isInteger(at) && at >= 0 && at <= LAST) { chRef.current = at; setCh(at); }
      if (Number.isInteger(sz) && sz >= 0 && sz < SIZES.length && recall('studioSize') !== null) setSize(sz);
      setName((p as { baptismal_name?: string } | null)?.baptismal_name || '');
      setGate('ok');
      refresh();
    })();
    return () => { off = true; };
  }, [refresh]);

  const go = (n: number) => {
    const to = Math.max(0, Math.min(LAST, n));
    chRef.current = to; setCh(to); remember('studioChapter', String(to));
    scroller.current?.scrollTo({ top: 0 });
  };
  const resize = (d: number) => setSize(s => { const n = Math.max(0, Math.min(SIZES.length - 1, s + d)); remember('studioSize', String(n)); return n; });

  /* ---------- 서버로 보내기 ---------- */
  const send = useCallback(async (p: Pending) => {
    setPending(list => list.map(x => x.id === p.id ? { ...x, state: 'sending', why: undefined } : x));
    try {
      for (let i = p.sent; i < p.names.length; i++) {
        const part = p.blob.slice(i * PART_BYTES, (i + 1) * PART_BYTES);
        let ok = false, why = '';
        for (let tries = 0; tries < 3 && !ok; tries++) {
          let fatal = false;
          try {
            const r = await api(`?name=${encodeURIComponent(p.names[i])}`, { method: 'POST', body: part, headers: { 'Content-Type': 'application/octet-stream' } });
            if (r.ok) ok = true;
            else { const b = await r.json().catch(() => ({})); why = b.error || `서버 응답 ${r.status}`; fatal = r.status === 400 || r.status === 403 || r.status === 413; }
          } catch (e) { why = e instanceof Error ? e.message : '인터넷 연결을 확인해 주세요'; }
          if (fatal) break;
          if (!ok) await new Promise(res => setTimeout(res, 1200));
        }
        if (!ok) throw new Error(why || '보내지 못했어요');
        setPending(list => list.map(x => x.id === p.id ? { ...x, sent: i + 1 } : x));
      }
      const r = await api(`?name=${p.id}.json`, { method: 'POST', body: p.meta, headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw new Error('마무리 기록을 남기지 못했어요');
      setPending(list => list.filter(x => x.id !== p.id));
      await refresh();
    } catch (e) {
      setPending(list => list.map(x => x.id === p.id ? { ...x, state: 'failed', why: e instanceof Error ? e.message : '보내지 못했어요' } : x));
    }
  }, [refresh]);

  /* ---------- 녹음 ---------- */
  const cleanup = useCallback(() => {
    const r = rec.current; rec.current = null;
    r?.stream.getTracks().forEach(t => t.stop());
    const m = meter.current; meter.current = null;
    if (m) { cancelAnimationFrame(m.raf); m.ac.close().catch(() => {}); }
    window.clearInterval(tick.current);
    wake.current?.release().catch(() => {}); wake.current = null;
    setRecording(false);
  }, []);

  const finish = useCallback((blob: Blob, from: number, to: number, ms: number) => {
    const id = 't' + Date.now();
    const type = blob.type || '';
    const ext = type.includes('webm') ? 'webm' : type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'bin';
    const parts = Math.max(1, Math.ceil(blob.size / PART_BYTES));
    const secs = Math.max(1, Math.round(ms / 1000));
    const names = Array.from({ length: parts }, (_, i) => `${id}_c${pad(from)}-${pad(to)}_d${secs}_p${pad(i + 1)}of${pad(parts)}.${ext}`);
    const meta = JSON.stringify({
      id, from, to, marksMs: marks.current, durationMs: Math.round(ms), mime: type, bytes: blob.size, parts,
      peak: Math.round(peak.current * 1000) / 1000, script: SCRIPT_VERSION, ua: navigator.userAgent.slice(0, 200),
    });
    localUrls.current.set(id, URL.createObjectURL(blob));
    if (peak.current < 0.02) setQuiet(q => [...q, id]);
    const p: Pending = { id, blob, names, meta, from, to, secs, state: 'sending', sent: 0 };
    setPending(list => [...list, p]);
    send(p);
  }, [send]);

  const start = async () => {
    setNotice(''); setPlay(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setNotice('이 브라우저에서는 녹음할 수 없어요. 크롬으로 열어 주세요.'); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    } catch (e) {
      const n = (e as { name?: string } | null)?.name;
      setNotice(n === 'NotAllowedError' ? '마이크를 쓸 수 없어요. 주소창 옆 자물쇠나 휴대폰 설정에서 마이크를 허용해 주세요.'
        : n === 'NotFoundError' ? '마이크를 찾지 못했어요.' : '마이크를 켜지 못했어요. 다시 눌러 주세요.');
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined); }
    catch { stream.getTracks().forEach(t => t.stop()); setNotice('녹음을 시작하지 못했어요. 다시 눌러 주세요.'); return; }
    const chunks: Blob[] = [];
    const began = performance.now();
    const first = chRef.current;
    marks.current = []; peak.current = 0;
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const ms = performance.now() - began;
      cleanup();
      const blob = new Blob(chunks, { type: mr.mimeType || type });
      if (!blob.size || ms < 800) { setNotice('녹음이 너무 짧아요. 다시 눌러 주세요.'); return; }
      finish(blob, first, chRef.current, ms);
    };
    rec.current = { mr, stream, began };
    try {   // 소리 크기 막대
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC(); const an = ac.createAnalyser(); an.fftSize = 1024;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const m = { ac, raf: 0 }; meter.current = m;
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > peak.current) peak.current = rms;
        if (bar.current) bar.current.style.width = `${Math.min(100, Math.round(Math.sqrt(rms) * 150))}%`;
        m.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* 막대만 없음 */ }
    try { wake.current = (await (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<WakeLock> } }).wakeLock?.request('screen')) || null; } catch { /* 없어도 됨 */ }
    mr.start(1000);   // 1초마다 조각을 받아 둠
    setElapsed(0); setRecording(true);
    tick.current = window.setInterval(() => setElapsed((performance.now() - began) / 1000), 250);
  };
  const stop = () => { const r = rec.current; if (r && r.mr.state !== 'inactive') r.mr.stop(); };
  const advance = () => {
    if (ch >= LAST) return;
    if (rec.current) marks.current.push(Math.round(performance.now() - rec.current.began));
    go(ch + 1);
  };

  // 화면을 떠나면 마이크를 끈다
  useEffect(() => {
    const urls = localUrls.current;
    return () => {
      const r = rec.current;
      if (r) { r.mr.onstop = null; try { r.mr.stop(); } catch { /* 이미 멈춤 */ } r.stream.getTracks().forEach(t => t.stop()); }
      if (meter.current) { cancelAnimationFrame(meter.current.raf); meter.current.ac.close().catch(() => {}); }
      window.clearInterval(tick.current);
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, []);
  // 녹음 중이거나 아직 보내는 중이면 나가기 전에 물어봄
  useEffect(() => {
    if (!recording && pending.length === 0) return;
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [recording, pending.length]);

  /* ---------- 저장된 녹음 ---------- */
  const done = useMemo(() => EXPLAINER_SCRIPT.map(c => [...takes].reverse().find(t => t.from <= c.n && c.n <= t.to) || null), [takes]);
  const saved = done.filter(Boolean).length;
  const current = done[ch];
  const waiting = pending.filter(p => p.from <= ch && ch <= p.to);
  const elsewhere = pending.filter(p => p.state === 'failed' && !(p.from <= ch && ch <= p.to));   // 다른 장에 남은, 보내지 못한 녹음

  const listen = async (t: Take) => {
    const local = localUrls.current.get(t.id);
    if (local) { setPlay({ id: t.id, url: local }); return; }
    setBusyId(t.id); setNotice('');
    try {
      const blobs: Blob[] = [];
      for (const n of t.names) {
        const r = await api(`?name=${encodeURIComponent(n)}`);
        if (!r.ok) throw new Error('녹음을 불러오지 못했어요');
        blobs.push(await r.blob());
      }
      const url = URL.createObjectURL(new Blob(blobs, { type: MIME[t.ext] || '' }));
      localUrls.current.set(t.id, url); setPlay({ id: t.id, url });
    } catch (e) { setNotice(e instanceof Error ? e.message : '녹음을 불러오지 못했어요'); }
    setBusyId('');
  };
  const remove = async (t: Take) => {
    if (!(await askConfirm(`이 녹음을 지울까요?\n${t.from === t.to ? `${t.from}장` : `${t.from}장부터 ${t.to}장까지`} · ${mmss(t.secs)}`))) return;
    setBusyId(t.id); setNotice('');
    try {
      const r = await api(`?take=${t.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('지우지 못했어요');
      if (play?.id === t.id) setPlay(null);
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : '지우지 못했어요'); }
    setBusyId('');
  };

  if (gate !== 'ok') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-stone-50 text-stone-800 px-6 text-center">
        <p className="text-[1.0625rem] font-bold">
          {gate === 'loading' ? '불러오는 중…' : gate === 'signin' ? '가톨릭그램에 로그인한 뒤 다시 열어 주세요.' : '관리자만 쓸 수 있는 화면이에요.'}
        </p>
        {gate !== 'loading' && <Link href="/" className="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold">가톨릭그램으로</Link>}
      </div>
    );
  }

  const chapter = EXPLAINER_SCRIPT[ch];
  const arrow = 'w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-stone-700 disabled:opacity-30';
  return (
    <div className="fixed inset-0 flex flex-col bg-stone-50 text-stone-900">
      <header className="pt-safe bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-3 h-14 flex items-center gap-2">
          <Link href="/" aria-label="가톨릭그램으로 돌아가기" className="w-10 h-10 flex items-center justify-center text-stone-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          <h1 className="flex-1 min-w-0 font-bold text-[1.0625rem] truncate">설명 영상 녹음실</h1>
          <span className="text-sm text-stone-500 tabular-nums" aria-live="polite">{saved}/{EXPLAINER_SCRIPT.length}장 저장</span>
        </div>
        <div className="max-w-3xl mx-auto px-2 pb-2 flex items-center gap-1">
          <button type="button" onClick={() => go(ch - 1)} disabled={recording || ch === 0} aria-label="앞 장" className={arrow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <label className="flex-1 min-w-0">
            <span className="sr-only">장 고르기</span>
            <select id="studio-chapter" value={ch} disabled={recording} onChange={e => go(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-xl border border-stone-200 bg-white text-stone-900 font-bold text-[1rem] disabled:opacity-60">
              {EXPLAINER_SCRIPT.map(c => <option key={c.n} value={c.n}>{done[c.n] ? '✓ ' : ''}{c.n}장 · {c.title}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => go(ch + 1)} disabled={recording || ch === LAST} aria-label="다음 장" className={arrow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <button type="button" onClick={() => resize(-1)} disabled={size === 0} aria-label="대본 글씨 작게" className={`${arrow} border border-stone-200 bg-white text-[0.8125rem] font-bold`}>가</button>
          <button type="button" onClick={() => resize(1)} disabled={size === SIZES.length - 1} aria-label="대본 글씨 크게" className={`${arrow} border border-stone-200 bg-white text-[1.1875rem] font-bold`}>가</button>
        </div>
      </header>

      <main ref={scroller} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-3xl mx-auto px-5 py-6 flex flex-col gap-[1.1em] break-keep" style={{ fontSize: `${SIZES[size]}rem`, lineHeight: 1.85 }}>
          {chapter.paras.map((p, i) => <p key={i}>{p.replace(NAME_SLOT, name || '○○○')}</p>)}
        </div>
        <p className="max-w-3xl mx-auto px-5 pb-6 text-sm text-stone-400">읽는 시간 약 {chapter.read}초</p>
      </main>

      <footer className="bg-white border-t border-stone-200 pb-safe">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-col gap-2.5">
          {notice && <p role="alert" className="text-sm font-bold text-red-600">{notice}</p>}
          {!recording && listError && <p className="text-sm text-red-600">{listError} <button type="button" onClick={refresh} className="underline font-bold">다시 불러오기</button></p>}
          {!recording && elsewhere.length > 0 && (
            <p className="text-sm text-red-600">
              보내지 못한 녹음이 {elsewhere.length}개 있어요.{' '}
              <button type="button" onClick={() => go(elsewhere[0].from)} className="underline font-bold">{elsewhere[0].from}장으로 가기</button>
            </p>
          )}
          {!recording && waiting.map(p => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {p.state === 'sending'
                ? <span className="font-bold text-blue-600">저장하는 중… {p.names.length > 1 ? `${p.sent}/${p.names.length}` : ''}</span>
                : <>
                    <span className="font-bold text-red-600">저장하지 못했어요. {p.why}</span>
                    <button type="button" onClick={() => send(p)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold">다시 보내기</button>
                    <a href={localUrls.current.get(p.id)} download={`가톨릭그램-녹음-${p.from}장.${p.names[0].split('.').pop()}`} className="px-3 py-1.5 rounded-lg border border-stone-300 font-bold text-stone-700">휴대폰에 저장</a>
                  </>}
            </div>
          ))}
          {!recording && current && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-bold text-green-700">저장됨 · {mmss(current.secs)}{current.from !== current.to ? ` · ${current.from}장부터 ${current.to}장까지 이어 읽음` : ''}</span>
                <button type="button" onClick={() => listen(current)} disabled={busyId === current.id} className="px-3 py-1.5 rounded-lg border border-stone-300 font-bold text-stone-700 disabled:opacity-50">{busyId === current.id ? '불러오는 중…' : '들어 보기'}</button>
                <button type="button" onClick={() => remove(current)} disabled={busyId === current.id} className="px-3 py-1.5 rounded-lg border border-stone-300 font-bold text-red-600 disabled:opacity-50">지우기</button>
              </div>
              {play?.id === current.id && <audio controls autoPlay src={play.url} className="w-full h-11" />}
              {quiet.includes(current.id) && <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">소리가 작게 녹음됐어요. 휴대폰을 조금 더 가까이 두고 다시 녹음해 보세요.</p>}
            </div>
          )}
          {recording ? (
            <>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />
                <span className="font-bold tabular-nums text-red-600" role="timer">녹음 중 {mmss(elapsed)}</span>
                <span className="flex-1 h-2 rounded-full bg-stone-200 overflow-hidden" aria-hidden="true"><span ref={bar} className="block h-full bg-green-600" style={{ width: '0%' }} /></span>
              </div>
              <div className="flex gap-2">
                {ch < LAST && <button type="button" onClick={advance} className="flex-1 h-14 rounded-2xl border-2 border-stone-300 bg-white font-bold text-[1.0625rem] text-stone-800">다음 장 이어 읽기</button>}
                <button type="button" onClick={stop} className="flex-1 h-14 rounded-2xl bg-blue-600 text-white font-bold text-[1.0625rem]">녹음 끝</button>
              </div>
            </>
          ) : (
            <button type="button" onClick={start} className="h-14 rounded-2xl bg-red-600 text-white font-bold text-[1.125rem] flex items-center justify-center gap-2.5">
              <span className="w-3.5 h-3.5 rounded-full bg-white" aria-hidden="true" />{current ? '이 장 다시 녹음' : '녹음 시작'}
            </button>
          )}
          <p className="text-[0.8125rem] leading-snug text-stone-500">
            {recording ? '다 읽었으면 녹음 끝을 누르세요. 저절로 저장됩니다.' : '틀리면 녹음을 끝내고 다시 녹음하세요. 가장 나중 녹음을 씁니다.'}
          </p>
        </div>
      </footer>
    </div>
  );
}
