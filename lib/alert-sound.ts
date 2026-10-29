// 새 알림이 왔을 때(앱을 열어 둔 동안) 울리는 소리 — 설정 → 알림 소리에서 여러 가지 중 고름 (이 휴대폰에만 localStorage 'alertSoundKind')
//  - '찬미예수님': 여성 음성 (휴대폰에 들어 있는 한국어 음성, 없으면 '띵-동')
//  - 띵동·성당 종소리·아멘 오르간·하프·방울·새소리·물방울: 음원 파일 없이 Web Audio 로 그 자리에서 만듦
// 앱을 닫아 두었을 때 휴대폰 위쪽에 뜨는 알림의 소리는 휴대폰이 정함(웹 알림은 소리를 고를 수 없음) → 설정에 바꾸는 법 안내
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

export interface AlertSoundOption { key: string; name: string; desc: string; emoji: string }
export const ALERT_SOUNDS: AlertSoundOption[] = [
  { key: 'praise', name: '찬미예수님', desc: '여성 목소리로 인사해요', emoji: '🙏' },
  { key: 'dingdong', name: '띵동', desc: '짧고 또렷한 두 음', emoji: '🔔' },
  { key: 'bell', name: '성당 종소리', desc: '은은하게 울리는 종 두 번', emoji: '⛪' },
  { key: 'amen', name: '아멘 오르간', desc: "오르간 화음으로 '아-멘'", emoji: '🎹' },
  { key: 'harp', name: '하프', desc: '맑게 올라가는 네 음', emoji: '🎶' },
  { key: 'chime', name: '방울', desc: '작은 방울이 딸랑딸랑', emoji: '✨' },
  { key: 'bird', name: '새소리', desc: '아침 새가 짹짹', emoji: '🐦' },
  { key: 'drop', name: '물방울', desc: '톡톡 떨어지는 소리', emoji: '💧' },
];
const DEFAULT_SOUND = 'praise';
const KIND_KEY = 'alertSoundKind';
const ON_KEY = 'alertSound';            // 'off' 면 소리 없음 (알림창 머리줄의 소리 밀기 단추와 같은 값)
export const ALERT_SOUND_EVENT = 'alert-sound-change';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가 */ } };

export function getAlertSoundKind(): string {
  const k = read(KIND_KEY);
  return k && ALERT_SOUNDS.some(s => s.key === k) ? k : DEFAULT_SOUND;
}
// 설정에 보이는 지금 고른 것: 소리 종류 또는 'off'
export function getAlertSoundChoice(): string {
  return read(ON_KEY) === 'off' ? 'off' : getAlertSoundKind();
}
export function setAlertSoundChoice(choice: string) {
  if (choice === 'off') write(ON_KEY, 'off');
  else { write(ON_KEY, 'on'); write(KIND_KEY, choice); }
  window.dispatchEvent(new Event(ALERT_SOUND_EVENT));
}
export const alertSoundName = (choice: string) => (choice === 'off' ? '소리 없음' : ALERT_SOUNDS.find(s => s.key === choice)?.name || '찬미예수님');

let lastPlayedAt = 0;
export function playAlertSound() {
  // 같은 알림으로 두 번 울리지 않게 (푸시 + 앱 안 알림 창)
  if (Date.now() - lastPlayedAt < 5000) return;
  lastPlayedAt = Date.now();
  playSound(getAlertSoundKind());
}

// 설정에서 눌러 들어 보기 (바로 울림)
export function previewAlertSound(kind: string) {
  lastPlayedAt = Date.now();
  getSynth()?.cancel();
  playSound(kind);
}

function playSound(kind: string) {
  if (kind === 'praise') { if (!speakPraise()) synth('dingdong'); return; }
  synth(kind);
}

interface Tone {
  f: number; at: number; dur: number; gain: number;
  type?: OscillatorType;
  attack?: number;
  hold?: number;                 // 이때까지 같은 크기로 (오르간)
  sweep?: [number, number][];    // [주파수, 시작에서 몇 초] — 새소리·물방울처럼 음이 미끄러짐
}
function tone(c: AudioContext, dest: AudioNode, t: Tone) {
  const t0 = c.currentTime + 0.03 + t.at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = t.type || 'sine';
  osc.frequency.setValueAtTime(t.f, t0);
  t.sweep?.forEach(([f, s]) => osc.frequency.exponentialRampToValueAtTime(f, t0 + s));
  const attack = t.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(t.gain, t0 + attack);
  if (t.hold) g.gain.setValueAtTime(t.gain, t0 + t.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + t.dur + 0.05);
}

// 종: 맥놀이가 있는 배음(허밍 0.5·기본 1·단3도 1.2·5도 1.5·옥타브 2 …), 낮은 배음일수록 오래 울림
const BELL_PARTIALS: [number, number, number][] = [[0.5, 0.22, 2.4], [1, 0.32, 2], [1.2, 0.16, 1.5], [1.5, 0.1, 1.1], [2, 0.26, 1.3], [2.5, 0.08, 0.8], [3, 0.06, 0.6], [4.2, 0.04, 0.4]];
// 오르간: 8'·4'·2⅔'·2' 음전
const ORGAN_PARTIALS: [number, number][] = [[1, 1], [2, 0.45], [3, 0.2], [4, 0.12]];

function synth(kind: string) {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const out = c.createGain();
  out.gain.value = 0.9;
  out.connect(c.destination);
  const tones: Tone[] = [];
  switch (kind) {
    case 'bell': // 딩-동 (G4 → E4)
      [[392, 0], [329.63, 0.8]].forEach(([f, at]) => BELL_PARTIALS.forEach(([r, gain, dur]) => tones.push({ f: f * r, at, dur, gain: gain * 0.55, attack: 0.004 })));
      break;
    case 'amen': // 다장조 버금딸림화음(IV) → 으뜸화음(I) '아-멘'
      [[[174.61, 349.23, 440, 523.25], 0, 0.62, 0.8], [[130.81, 329.63, 392, 523.25], 0.66, 1.6, 2]].forEach(([notes, at, hold, end]) =>
        (notes as number[]).forEach(f => ORGAN_PARTIALS.forEach(([r, a]) =>
          tones.push({ f: f * r, at: at as number, hold: (hold as number) - (at as number), dur: (end as number) - (at as number), gain: 0.06 * a, attack: 0.06 }))));
      break;
    case 'harp': // 도-미-솔-도
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tones.push({ f, at: i * 0.1, dur: 1.2, gain: 0.24, type: 'triangle', attack: 0.004 });
        tones.push({ f: f * 2, at: i * 0.1, dur: 0.5, gain: 0.05, attack: 0.004 });
      });
      break;
    case 'chime': // 딸랑딸랑 (작은 종의 배음 1·2.76·5.4)
      [2093, 1760, 2093, 2637].forEach((f, i) => [[1, 0.2, 0.7], [2.76, 0.06, 0.35], [5.4, 0.025, 0.18]].forEach(([r, gain, dur]) =>
        tones.push({ f: f * r, at: i * 0.12, dur, gain, attack: 0.003 })));
      break;
    case 'bird': // 짹-짹-짹 + 짧은 지저귐
      [0, 0.12, 0.24].forEach((at, i) => tones.push({ f: 3000 + i * 150, at, dur: 0.09, gain: 0.24, attack: 0.008, sweep: [[4700 + i * 200, 0.035], [3300, 0.085]] }));
      [0, 1, 2, 3, 4].forEach(i => tones.push({ f: 4300 - i * 120, at: 0.48 + i * 0.055, dur: 0.045, gain: 0.18, attack: 0.005, sweep: [[3500 - i * 100, 0.04]] }));
      break;
    case 'drop': // 톡 · 톡
      [[520, 1500, 0], [700, 1900, 0.22]].forEach(([f, to, at]) => tones.push({ f, at, dur: 0.2, gain: 0.4, attack: 0.004, sweep: [[to, 0.07]] }));
      break;
    default: // 띵-동
      [[880, 0], [1318.5, 0.16]].forEach(([f, at]) => tones.push({ f, at, dur: 0.45, gain: 0.35, attack: 0.02 }));
  }
  tones.forEach(t => tone(c, out, t));
}
