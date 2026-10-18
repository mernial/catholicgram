// 사진 틀 비율 (인스타그램처럼): 세로는 4:5 까지, 가로는 1.91:1 까지 사진 모양 그대로
// 틀보다 더 넓은 사진(유튜브 썸네일 등)은 좌우가 잘리지 않게 통째로 보여 준다
export const MIN_FRAME = 0.8;  // 4:5
export const MAX_FRAME = 1.91; // 1.91:1

export const frameRatio = (ratio?: number | null) =>
  ratio ? Math.min(MAX_FRAME, Math.max(MIN_FRAME, ratio)) : MIN_FRAME;

// 틀과 모양이 다른 사진은 'contain'(통째로 보이게). 단, 4:5 틀에 들어가는 세로로 긴 사진은
// 지금처럼 'cover'(틀을 꽉 채우고 위아래만 조금 잘림)
export const photoFit = (ratio: number | null | undefined, frame: number): 'contain' | 'cover' => {
  if (!ratio) return 'cover';
  if (ratio > frame + 0.01) return 'contain';
  if (ratio < frame - 0.01 && frame > MIN_FRAME + 0.01) return 'contain';
  return 'cover';
};

export const naturalRatio = (img: HTMLImageElement) =>
  img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
