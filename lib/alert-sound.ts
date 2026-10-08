// 새 알림이 왔을 때 '찬미예수님' 여성 음성으로 알린다 (휴대폰에 들어 있는 한국어 음성 사용)
// 한국어 음성이 없는 기기에서는 짧은 '띵-동' 알림음 (음원 파일 없이 Web Audio로 생성)
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
  // iOS 는 터치 때 한 번 말해 둬야 나중에 음성이 나온다 → 소리 없는 빈 말
  const synth = getSynth();
  if (synth && !speechUnlocked) {
    speechUnlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }
}

let speechUnlocked = false;
const getSynth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

// 한국어 여성 음성 고르기 (아이폰: 유나, 안드로이드: 구글 한국어, 윈도우: 선희·해미 등)
const FEMALE_HINTS = ['yuna', '유나', 'sunhi', '선희', 'heami', '해미', 'female', '여성', 'sora', '소라', 'google'];
const MALE_HINTS = ['male', '남성', 'injoon', '인준', 'minsu', '민수', 'jinho'];
function pickKoreanVoice(): SpeechSynthesisVoice | null {
  const voices = getSynth()?.getVoices() || [];
  const ko = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith('ko'));
  if (ko.length === 0) return null;
  const name = (v: SpeechSynthesisVoice) => v.name.toLowerCase();
  const notMale = ko.filter(v => !MALE_HINTS.some(h => name(v).includes(h) && !name(v).includes('female')));
  return notMale.find(v => FEMALE_HINTS.some(h => name(v).includes(h))) || notMale[0] || ko[0];
}
// 음성 목록은 늦게 채워지는 기기가 있어 미리 한 번 불러 둔다
if (typeof window !== 'undefined') getSynth()?.getVoices();

// '찬미예수님' 음성 (한국어 음성이 없으면 false)
export function speakPraise(): boolean {
  const synth = getSynth();
  const voice = synth ? pickKoreanVoice() : null;
  if (!synth || !voice) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance('찬미예수님');
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;   // 또박또박
  u.pitch = 1.15; // 조금 높고 부드럽게
  u.volume = 1;
  synth.speak(u);
  return true;
}

let lastPlayedAt = 0;
export function playAlertSound() {
  // 같은 알림으로 두 번 울리지 않게 (푸시 + 앱 안 알림 창)
  if (Date.now() - lastPlayedAt < 5000) return;
  lastPlayedAt = Date.now();
  if (speakPraise()) return;
  playDingDong();
}

// '띵-동' 두 음
function playDingDong() {
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
