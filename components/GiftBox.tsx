'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { STICKER_PACKS } from '@/lib/stickers';

// 관리자가 보낸 선물이 도착하면 뜨는 선물 상자 (전용 이모티콘 선물 · 사연 선물 · 앞으로 더할 선물).
// 상자를 누르면 빛나며 열리고(축하 소리: 팡파르 + 박수), 꽃가루가 터지며 선물한 이모티콘 하나가 상자에서 튀어나온 뒤
// 무슨 선물인지 보여 준다. 연 선물은 page 가 기억한다(localStorage giftsOpened:아이디)
// 그림은 운영자가 준 선물 상자(public/gift-box.webp), 소리는 public/sounds/gift-celebrate.mp3 (scripts/gift-sound-synth.py)
export type Gift =
  | { key: string; kind: 'sticker'; packId: string }
  | { key: string; kind: 'letter'; letterId: string }
  | { key: string; kind: 'music'; trackId: string; title: string; url: string; note: string | null }; // 노래 선물 (보관 음악 → music_grants)

const BOX = '/gift-box.webp';
const SOUND = '/sounds/gift-celebrate.mp3';
const CONFETTI_COLORS = ['#ff5a6e', '#ffc93c', '#5ac8fa', '#7ed957', '#b388ff', '#ff9f43'];

// 꽃가루 조각 (상자 위에서 사방으로 터졌다 떨어짐)
const confettiPieces = () => Array.from({ length: 30 }, (_, i) => {
  const a = (i / 30) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3;
  const r = 110 + ((i * 37) % 70);
  return {
    dx: `${Math.round(Math.cos(a) * r)}px`, dy: `${Math.round(Math.sin(a) * r * 0.8 - 60)}px`,
    rot: `${(i * 97) % 720 - 360}deg`, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    w: 6 + (i % 3) * 3, h: 10 + (i % 4) * 3, delay: `${(i % 5) * 0.03}s`,
  };
});

export default function GiftBox({ gift, onOpened, onClose, onShowLetters, onUseMusic }: {
  gift: Gift;
  onOpened: (key: string) => void;   // 상자를 열었음 (다시 띄우지 않게 기억)
  onClose: () => void;               // 닫기 (열지 않고 닫으면 다음에 앱을 열 때 다시)
  onShowLetters?: () => void;        // 사연 선물: 내 사연 보기
  onUseMusic?: (trackId: string) => Promise<boolean>; // 노래 선물: 내 공간 음악으로 하기
}) {
  const [stage, setStage] = useState<'closed' | 'opening' | 'open'>('closed');
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const confetti = useMemo(confettiPieces, []);
  // 노래 선물: 들어 보기 · 내 공간 음악으로 정함
  const songRef = useRef<HTMLAudioElement | null>(null);
  const [songPlaying, setSongPlaying] = useState(false);
  const [usedMusic, setUsedMusic] = useState<'busy' | 'done' | null>(null);
  useEffect(() => { setStage('closed'); setUsedMusic(null); }, [gift.key]);
  useEffect(() => () => { songRef.current?.pause(); }, []);
  const toggleSong = () => {
    if (gift.kind !== 'music') return;
    if (!songRef.current) {
      songRef.current = new Audio(gift.url);
      songRef.current.onplay = () => setSongPlaying(true);
      songRef.current.onpause = () => setSongPlaying(false);
      songRef.current.onended = () => setSongPlaying(false);
    }
    if (songRef.current.paused) songRef.current.play().catch(() => {}); else songRef.current.pause();
  };
  const useMusic = async () => {
    if (gift.kind !== 'music' || !onUseMusic || usedMusic) return;
    setUsedMusic('busy');
    setUsedMusic((await onUseMusic(gift.trackId)) ? 'done' : null);
  };
  const close = () => { songRef.current?.pause(); onClose(); };
  // 누르자마자 소리가 나게 미리 받아 둔다
  useEffect(() => {
    const a = new Audio(SOUND);
    a.preload = 'auto';
    soundRef.current = a;
    return () => { a.pause(); soundRef.current = null; };
  }, []);

  const pack = gift.kind === 'sticker' ? STICKER_PACKS.find(p => p.id === gift.packId) : undefined;
  // 상자에서 튀어나올 이모티콘: 축하하는 것 → 인사 → 첫 번째
  const popSticker = pack ? (pack.stickers.find(s => /축하/.test(s.label)) || pack.stickers.find(s => /안녕|반가/.test(s.label)) || pack.stickers[0]) : undefined;

  const openBox = () => {
    if (stage !== 'closed') return;
    setStage('opening');
    onOpened(gift.key);
    let soundOn = true;
    try { soundOn = localStorage.getItem('alertSound') !== 'off'; } catch { /* 기본은 켬 */ }
    if (soundOn && soundRef.current) { soundRef.current.currentTime = 0; soundRef.current.volume = 0.85; soundRef.current.play().catch(() => {}); }
    setTimeout(() => setStage('open'), 2100);
  };

  const pop = popSticker
    ? <img src={popSticker.src} alt={popSticker.label} className="w-full h-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,.35)]" draggable={false} />
    : <span className="w-full h-full flex items-center justify-center text-[6rem] leading-none">{gift.kind === 'music' ? '🎶' : '💌'}</span>;

  return (
    <div className="fixed inset-0 z-[97] bg-[rgba(18,14,10,.86)] flex flex-col items-center justify-center p-6 [animation:confirmFade_.2s_ease-out]" role="dialog" aria-modal="true" aria-label="관리자의 선물">
      <button type="button" onClick={close} className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 w-11 h-11 text-white/80 text-3xl leading-none" aria-label="닫기">×</button>
      {stage !== 'open' ? (
        <>
          <p className="text-white text-[1.5rem] font-bold text-center leading-snug [text-shadow:0_2px_12px_rgba(0,0,0,.5)]">
            {stage === 'closed' ? <>🎁 관리자의 선물이<br />도착했습니다</> : <>🎉 축하합니다!<br />&nbsp;</>}
          </p>
          <div className={`relative w-60 max-w-[68vw] aspect-square ${stage === 'opening' ? 'mt-36' : 'mt-7'} transition-[margin] duration-300`}>
            {/* 상자 뒤 빛 */}
            {stage === 'opening' && <div className="absolute left-1/2 top-[8%] w-[150%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,236,170,.95)_0%,rgba(255,214,120,.45)_35%,rgba(255,214,120,0)_70%)] [animation:giftGlow_.6s_ease-out_both]" />}
            {/* 상자에서 튀어나오는 이모티콘 (상자 뒤에서 위로 솟음) */}
            {stage === 'opening' && (
              <div className="absolute left-1/2 top-[8%] w-[66%] aspect-square [animation:giftRise_1s_cubic-bezier(.2,1.5,.4,1)_.2s_both]">{pop}</div>
            )}
            <button type="button" onClick={openBox} aria-label="선물 상자 열기"
              className={`relative w-full h-full rounded-[2.25rem] bg-white shadow-[0_0_60px_rgba(255,214,120,.55)] overflow-hidden
                ${stage === 'closed' ? '[animation:giftWiggle_2.2s_ease-in-out_infinite] motion-reduce:[animation:none]' : '[animation:giftPop_.5s_ease-out]'}`}>
              <img src={BOX} alt="" className="w-full h-full object-contain" draggable={false} />
            </button>
            {/* 꽃가루 */}
            {stage === 'opening' && confetti.map((c, i) => (
              <span key={i} aria-hidden="true" className="absolute left-1/2 top-[10%] rounded-sm [animation:giftConfetti_1.4s_cubic-bezier(.15,.7,.4,1)_both]"
                style={{ width: c.w, height: c.h, background: c.color, animationDelay: c.delay, '--dx': c.dx, '--dy': c.dy, '--rot': c.rot } as CSSProperties} />
            ))}
          </div>
          <p className={`mt-5 text-white/85 text-[1rem] font-bold transition-opacity ${stage === 'closed' ? 'animate-pulse' : 'opacity-0'}`}>상자를 눌러 열어 보세요</p>
        </>
      ) : (
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 pt-0 flex flex-col items-center text-center gap-3 [animation:confirmPop_.25s_ease-out]">
          <div className="w-28 h-28 -mt-14 [animation:giftBounce_.6s_ease-out]">{pop}</div>
          <p className="text-[0.9375rem] font-bold text-rose-600">관리자의 선물</p>
          {gift.kind === 'sticker' && (
            <>
              <h2 className="text-[1.25rem] font-bold text-stone-900 leading-snug">&lsquo;{pack?.name || '전용'}&rsquo; 이모티콘{pack ? ` ${pack.stickers.length}개` : ''}</h2>
              {pack && (
                <div className="grid grid-cols-4 gap-1.5 w-full">
                  {pack.stickers.slice(0, 8).map(s => <img key={s.id} src={s.src} alt={s.label} className="w-full aspect-square object-contain" />)}
                </div>
              )}
              <p className="text-[0.9375rem] text-stone-600 leading-relaxed">이제 메시지·댓글 입력칸 옆 <b>😊</b> 에서<br />바로 쓸 수 있어요</p>
            </>
          )}
          {gift.kind === 'letter' && (
            <>
              <h2 className="text-[1.25rem] font-bold text-stone-900 leading-snug">보내 주신 사연이<br />선물 대상으로 뽑혔어요! 🎉</h2>
              <p className="text-[0.9375rem] text-stone-600 leading-relaxed">운영자가 곧 메시지로 연락드릴게요 🙏</p>
              {onShowLetters && <button type="button" onClick={onShowLetters} className="w-full py-3 rounded-2xl border border-stone-300 text-stone-800 font-bold">내 사연 보기</button>}
            </>
          )}
          {gift.kind === 'music' && (
            <>
              <h2 className="text-[1.25rem] font-bold text-stone-900 leading-snug">&lsquo;{gift.title}&rsquo;<br />노래를 선물받았어요 🎶</h2>
              {gift.note && <p className="text-[0.9375rem] text-amber-700 font-bold leading-snug">🎁 {gift.note}</p>}
              <button type="button" onClick={toggleSong} className="w-full py-3 rounded-2xl bg-violet-50 border border-violet-200 text-violet-900 font-bold">
                {songPlaying ? '❚❚ 멈추기' : '▶ 들어 보기'}
              </button>
              {onUseMusic && (
                <button type="button" onClick={useMusic} disabled={usedMusic !== null} className={`w-full py-3 rounded-2xl font-bold ${usedMusic === 'done' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-violet-700 text-white disabled:opacity-60'}`}>
                  {usedMusic === 'done' ? '✓ 내 공간 음악으로 정했어요' : usedMusic === 'busy' ? '정하는 중…' : '🎵 내 공간 음악으로 하기'}
                </button>
              )}
              <p className="text-[0.875rem] text-stone-600 leading-relaxed">교우들이 내 공간을 누르면 이 노래가 흘러요.<br />글을 쓸 때 <b>음악 추가 › 🎁 선물받은 노래</b>에서도 고를 수 있어요</p>
            </>
          )}
          <button type="button" onClick={close} className="w-full py-3.5 rounded-2xl bg-stone-900 text-white text-[1.0625rem] font-bold">확인</button>
        </div>
      )}
    </div>
  );
}
