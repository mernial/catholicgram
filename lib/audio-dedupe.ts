'use client';

// 음악 중복 찾기 (관리자 음악 올리기 components/BgmAdmin):
//  - hash: 소리 부분의 지문 — mp3 는 앞뒤 꼬리표(ID3)와 첫 머리 프레임(Xing/Info/VBRI)을 빼고 소리 프레임 앞 1.5MB 의 SHA-256
//    → 같은 파일을 다시 받았거나 꼬리표만 다른 파일은 똑같이 나옴. mp3 가 아니면 파일 앞 4MB
//  - print: 소리를 풀어 0.5초마다 소리 크기를 잰 줄 + 길이('193.4:base64') → 다른 형식·음질로 다시 만든 같은 노래도 알아봄
//    (길이가 1초 안으로 같고 소리 크기 줄이 거의 같으면(상관 0.97 이상) 같은 노래)
// 둘 다 bgm_tracks.content_hash·audio_print 에 저장 (supabase/bgm-dedupe.sql)

export interface AudioKeys { hash: string; print: string | null }

const MP3_BITRATES: Record<string, number[]> = {
  '1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],  // MPEG1 Layer III
  '2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],      // MPEG2·2.5 Layer III
};
const MP3_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

// mp3 프레임 하나의 길이 (Layer III 만, 아니면 0)
function mp3FrameLength(b: Uint8Array, i: number): number {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return 0;
  const version = (b[i + 1] >> 3) & 3;          // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layer = (b[i + 1] >> 1) & 3;            // 1=Layer III
  if (version === 1 || layer !== 1) return 0;
  const kbps = MP3_BITRATES[version === 3 ? '1' : '2'][(b[i + 2] >> 4) & 15];
  const rate = MP3_RATES[version]?.[(b[i + 2] >> 2) & 3];
  if (!kbps || !rate) return 0;
  const pad = (b[i + 2] >> 1) & 1;
  return Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + pad;
}

// 꼬리표·머리 프레임을 뺀 mp3 소리 프레임 구간 [start, end)
export function mp3AudioRange(b: Uint8Array): [number, number] | null {
  let start = 0;
  while (start + 10 <= b.length && b[start] === 0x49 && b[start + 1] === 0x44 && b[start + 2] === 0x33) { // 'ID3'
    const size = ((b[start + 6] & 0x7f) << 21) | ((b[start + 7] & 0x7f) << 14) | ((b[start + 8] & 0x7f) << 7) | (b[start + 9] & 0x7f);
    start += 10 + size + (b[start + 5] & 0x10 ? 10 : 0);
  }
  // 앞에 0 이 끼어 있는 파일도 있어 첫 프레임을 조금 찾아본다
  let tries = 0;
  while (start < b.length && !mp3FrameLength(b, start) && tries++ < 4096) start++;
  const first = mp3FrameLength(b, start);
  if (!first) return null;
  let end = b.length;
  if (end - start > 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) end -= 128; // 끝의 'TAG'
  // 첫 프레임이 소리가 아니라 길이 정보(Xing·Info·VBRI·LAME)면 건너뜀 — 프로그램마다 다시 써 넣는 곳
  const head = String.fromCharCode(...b.subarray(start, Math.min(start + first, start + 200)));
  if (/Xing|Info|VBRI/.test(head)) start += first;
  return start < end ? [start, end] : null;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');

export async function audioHash(bytes: ArrayBuffer, ext: string): Promise<string> {
  const b = new Uint8Array(bytes);
  const range = ext === 'mp3' ? mp3AudioRange(b) : null;
  const part = range ? b.subarray(range[0], Math.min(range[1], range[0] + 1_500_000)) : b.subarray(0, 4_000_000);
  const copy = new Uint8Array(part.length);
  copy.set(part);
  return `${range ? 'mp3' : 'raw'}:${toHex(await crypto.subtle.digest('SHA-256', copy))}`;
}

const WINDOW = 0.5; // 초
export async function audioPrint(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const Ctx = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext
      || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx(1, 1, 22050);
    const audio: AudioBuffer = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(bytes.slice(0), resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
    });
    const step = Math.max(1, Math.round(audio.sampleRate * WINDOW));
    const chans = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
    const n = Math.floor(audio.length / step);
    if (n < 4) return null;
    const rms = new Float64Array(n);
    for (let w = 0; w < n; w++) {
      let sum = 0;
      for (let i = w * step; i < (w + 1) * step; i++) {
        let v = 0;
        for (const ch of chans) v += ch[i];
        v /= chans.length;
        sum += v * v;
      }
      rms[w] = Math.sqrt(sum / step);
    }
    const max = Math.max(...rms) || 1;
    const q = new Uint8Array(n);
    for (let w = 0; w < n; w++) q[w] = Math.round((rms[w] / max) * 255);
    return `${audio.duration.toFixed(1)}:${btoa(String.fromCharCode(...q))}`;
  } catch { return null; }
}

export async function audioKeys(bytes: ArrayBuffer, ext: string): Promise<AudioKeys> {
  return { hash: await audioHash(bytes, ext), print: await audioPrint(bytes) };
}

// 소리 크기 줄 둘이 같은 노래인지 (길이 1초 안 + 상관 0.97 이상)
export function samePrint(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const [da, ea] = a.split(':'), [db, eb] = b.split(':');
  if (!ea || !eb || Math.abs(Number(da) - Number(db)) > 1) return false;
  let x: Uint8Array, y: Uint8Array;
  try { x = Uint8Array.from(atob(ea), c => c.charCodeAt(0)); y = Uint8Array.from(atob(eb), c => c.charCodeAt(0)); } catch { return false; }
  const n = Math.min(x.length, y.length);
  if (n < 4) return false;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (!sxx || !syy) return false;
  return sxy / Math.sqrt(sxx * syy) >= 0.97;
}

// 두 곡이 같은 노래인지: 'exact' = 같은 소리 파일, 'similar' = 다른 파일이지만 같은 노래로 보임
export function sameAudio(a: Partial<AudioKeys> & { content_hash?: string | null; audio_print?: string | null },
  b: Partial<AudioKeys> & { content_hash?: string | null; audio_print?: string | null }): 'exact' | 'similar' | null {
  const ha = a.hash ?? a.content_hash, hb = b.hash ?? b.content_hash;
  const pa = a.print ?? a.audio_print, pb = b.print ?? b.audio_print;
  // 지문은 앞부분만 보므로 길이가 1초 넘게 다르면(같은 곡을 짧게 줄인 판 등) 다른 곡으로 본다
  const lengthDiffers = !!pa && !!pb && Math.abs(Number(pa.split(':')[0]) - Number(pb.split(':')[0])) > 1;
  if (ha && hb && ha === hb && !lengthDiffers) return 'exact';
  return samePrint(pa, pb) ? 'similar' : null;
}

// 앱에 기본으로 들어 있는 곡의 지문 (처음 한 번 받아서 이 기기에 저장)
const BUILTIN_CACHE = 'bgmBuiltinKeys:v1';
export async function builtinKeys(list: { id: string; url: string }[]): Promise<Record<string, AudioKeys>> {
  let cache: Record<string, AudioKeys & { url: string }> = {};
  try { cache = JSON.parse(localStorage.getItem(BUILTIN_CACHE) || '{}'); } catch { /* 없음 */ }
  const out: Record<string, AudioKeys> = {};
  for (const t of list) {
    const hit = cache[t.id];
    if (hit && hit.url === t.url) { out[t.id] = hit; continue; }
    try {
      const res = await fetch(t.url);
      if (!res.ok) continue;
      const keys = await audioKeys(await res.arrayBuffer(), t.url.split('.').pop()!.toLowerCase());
      out[t.id] = keys;
      cache[t.id] = { ...keys, url: t.url };
    } catch { /* 이번엔 건너뜀 */ }
  }
  try { localStorage.setItem(BUILTIN_CACHE, JSON.stringify(cache)); } catch { /* 저장 불가 */ }
  return out;
}
