// 사진 틀 비율: 세로는 3:4(휴대폰 사진)까지, 가로는 1.91:1 까지 사진 모양 그대로
// 틀보다 더 길거나 넓은 사진(휴대폰 화면 캡처, 유튜브 썸네일 등)은 잘리지 않게 통째로 보여 준다
export const MIN_FRAME = 0.75; // 3:4
export const MAX_FRAME = 1.91; // 1.91:1

export const frameRatio = (ratio?: number | null) =>
  ratio ? Math.min(MAX_FRAME, Math.max(MIN_FRAME, ratio)) : MIN_FRAME;

// 사진은 절대 자르지 않는다: 틀과 모양이 같으면 꽉 채우고('cover'), 다르면 통째로('contain', 남는 곳은 바탕색)
// (예전에는 4:5 보다 긴 세로 사진을 틀에 꽉 채우느라 위아래가 잘렸음)
export const photoFit = (ratio: number | null | undefined, frame: number): 'contain' | 'cover' => {
  if (!ratio) return 'cover';
  return Math.abs(ratio - frame) <= 0.01 ? 'cover' : 'contain';
};

export const naturalRatio = (img: HTMLImageElement) =>
  img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
