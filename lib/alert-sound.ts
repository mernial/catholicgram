// 새 알림이 왔을 때 짧은 알림음을 재생한다 (음원 파일 없이 Web Audio로 생성)
// 브라우저 정책상 사용자가 화면을 한 번 터치한 뒤부터 소리가 난다.

let ctx: AudioContext | null = null;

const getContext = () => {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
};

// 첫 터치 때 오디오를 깨워 둔다 (iOS/안드로이드 자동 재생 제한 대응)
export function unlockAlertSound() {
  const c = getContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// '띵-동' 두 음
export function playAlertSound() {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const now = c.currentTime;
  [[880, 0], [1318.5, 0.16]].forEach(([freq, offset]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.45);
    osc.connect(gain).connect(c.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.5);
  });
}
