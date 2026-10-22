// 숏폼 영상(1분 이하) 도우미: 길이 확인, 미리보기 이미지 만들기, 용량이 크면 화질을 줄이기

export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_MB = 45; // Supabase 무료 요금제 업로드 한도(50MB)보다 조금 작게

const loadVideo = (file: Blob) => new Promise<HTMLVideoElement>((resolve, reject) => {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(file);
  video.onloadedmetadata = () => resolve(video);
  video.onerror = () => reject(new Error('영상을 읽을 수 없어요'));
});

export const getVideoInfo = async (file: Blob) => {
  const video = await loadVideo(file);
  const info = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  URL.revokeObjectURL(video.src);
  return info;
};

// 영상 0.5초 지점을 JPG 로 (피드·바둑판 미리보기용)
export const makeVideoPoster = async (file: Blob): Promise<Blob | null> => {
  try {
    const video = await loadVideo(file);
    await new Promise<void>(resolve => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    });
    const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(video.src);
    return await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82));
  } catch {
    return null;
  }
};

// 이 크기보다 큰 영상은 올리기 전에 줄인다 (볼 때마다 전송량이 나가므로)
export const SHRINK_OVER_MB = 12;

// 영상을 720p·약 1.5Mbps 로 다시 녹화해 줄인다 (영상 길이만큼 걸림, 1분 영상 → 약 12MB).
// 화면은 캔버스로, 소리는 Web Audio 로 받아 녹화하므로 아이폰 사파리에서도 동작한다.
// 지원하지 않거나 실패하면 null. isCancelled 가 참이 되면(그사이 영상을 빼거나 바꿈) 멈추고 null.
export const shrinkVideo = async (file: Blob, onProgress?: (ratio: number) => void, isCancelled?: () => boolean): Promise<Blob | null> => {
  const video = await loadVideo(file).catch(() => null);
  const canvas = document.createElement('canvas');
  if (!video || typeof MediaRecorder === 'undefined' || !canvas.captureStream) return null;

  const scale = Math.min(1, 720 / Math.min(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale / 2) * 2;
  canvas.height = Math.round(video.videoHeight * scale / 2) * 2;
  const ctx = canvas.getContext('2d')!;

  // 모든 휴대폰(아이폰 포함)에서 재생되도록 H.264 mp4 로만 만든다. 못 만드는 브라우저는 줄이지 않음
  const mimeType = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1']
    .find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) return null;

  const stream = canvas.captureStream(30);
  // 소리: 영상 → Web Audio → 녹음 (스피커로는 내보내지 않음)
  let audioCtx: AudioContext | null = null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      const src = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      await audioCtx.resume().catch(() => {});
    }
  } catch { /* 소리 없이 */ }
  video.muted = false;
  video.volume = 1;

  const cleanup = () => { URL.revokeObjectURL(video.src); audioCtx?.close().catch(() => {}); };
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_400_000, audioBitsPerSecond: 96_000 });
  } catch { cleanup(); return null; }
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] })); });

  let raf = 0;
  let finish = () => {};
  const ended = new Promise<void>(resolve => { finish = resolve; video.onended = () => resolve(); });
  const draw = () => {
    if (isCancelled?.()) { video.pause(); finish(); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onProgress?.(Math.min(1, video.currentTime / (video.duration || 1)));
    if (!video.ended) raf = requestAnimationFrame(draw);
  };
  recorder.start(1000);
  try { await video.play(); } catch { recorder.stop(); cleanup(); return null; }
  draw();
  await ended;
  cancelAnimationFrame(raf);
  recorder.stop();
  const blob = await done;
  cleanup();
  if (isCancelled?.()) return null;
  return blob.size > 0 ? blob : null;
};
