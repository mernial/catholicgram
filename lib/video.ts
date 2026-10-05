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

// 용량이 큰 영상을 720p 로 다시 녹화해 줄인다 (영상 길이만큼 걸림).
// 지원하지 않는 브라우저(아이폰 사파리 등)에서는 null.
export const shrinkVideo = async (file: Blob, onProgress?: (ratio: number) => void): Promise<Blob | null> => {
  const video = await loadVideo(file).catch(() => null);
  if (!video || typeof MediaRecorder === 'undefined') return null;
  const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
  const canvas = document.createElement('canvas');
  if (!capture || !canvas.captureStream) return null;

  const scale = Math.min(1, 720 / Math.min(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale / 2) * 2;
  canvas.height = Math.round(video.videoHeight * scale / 2) * 2;
  const ctx = canvas.getContext('2d')!;

  const mimeType = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) return null;

  video.muted = false;
  video.volume = 0.0001; // 소리는 녹음되지만 들리지 않게
  const stream = canvas.captureStream(30);
  try { capture.call(video).getAudioTracks().forEach(t => stream.addTrack(t)); } catch { /* 소리 없이 */ }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] })); });

  let raf = 0;
  const draw = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onProgress?.(Math.min(1, video.currentTime / (video.duration || 1)));
    if (!video.ended) raf = requestAnimationFrame(draw);
  };
  recorder.start(1000);
  try { await video.play(); } catch { recorder.stop(); URL.revokeObjectURL(video.src); return null; }
  draw();
  await new Promise<void>(resolve => { video.onended = () => resolve(); });
  cancelAnimationFrame(raf);
  recorder.stop();
  const blob = await done;
  URL.revokeObjectURL(video.src);
  return blob;
};
