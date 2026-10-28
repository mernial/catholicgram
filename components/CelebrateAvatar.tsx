'use client';

import type { ReactNode } from 'react';

// 생일·축일 당일(한국 시간) 프로필 사진 꾸미기: 생일이면 사진 위에 '오늘 생일이에요' 리본, 축일이면 사진 아래에 '오늘 축일이에요' 비둘기
// (운영자가 준 그림 public/celebrate-birthday.webp 480×232 · celebrate-feast.webp 480×269). 사진보다 조금 넓게(134%), 사진 테두리에 살짝 걸치게.
// 그림은 사진 상자를 기준으로 겹쳐 놓고(absolute), 사진 위·아래로 삐져나온 만큼 자리를 비워 둘레 글·단추와 겹치지 않게 한다 (size = 사진 지름 rem).
// 내 공간·교우 공간 머리, 프로필 카드처럼 사진이 큰 곳에만 쓴다
const WIDTH = 1.34;
const RIBBON_H = WIDTH * 232 / 480, RIBBON_OVERLAP = 0.2; // 리본이 사진 윗부분을 덮는 몫
const DOVE_H = WIDTH * 269 / 480, DOVE_OVERLAP = 0.28;     // 비둘기 띠가 사진 아랫부분을 덮는 몫

export default function CelebrateAvatar({ birthday, feast, size, children }: { birthday?: boolean; feast?: boolean; size: number; children: ReactNode }) {
  if (!birthday && !feast) return <>{children}</>;
  const float = 'drop-shadow-[0_3px_6px_rgba(0,0,0,.18)] motion-reduce:[animation:none]';
  return (
    <div className="relative shrink-0" style={{ marginTop: birthday ? `${(RIBBON_H - RIBBON_OVERLAP) * size}rem` : undefined, marginBottom: feast ? `${(DOVE_H - DOVE_OVERLAP) * size}rem` : undefined }}>
      {children}
      {birthday && (
        <img src="/celebrate-birthday.webp" alt="오늘 생일이에요" draggable={false}
          className={`absolute left-1/2 max-w-none pointer-events-none select-none z-10 ${float} [animation:celebrateFloat_3.2s_ease-in-out_infinite]`}
          style={{ width: `${WIDTH * 100}%`, bottom: `${(1 - RIBBON_OVERLAP) * 100}%`, translate: '-50% 0' }} />
      )}
      {feast && (
        <img src="/celebrate-feast.webp" alt="오늘 축일이에요" draggable={false}
          className={`absolute left-1/2 max-w-none pointer-events-none select-none z-10 ${float} [animation:celebrateFloat_3.2s_ease-in-out_1.6s_infinite]`}
          style={{ width: `${WIDTH * 100}%`, top: `${(1 - DOVE_OVERLAP) * 100}%`, translate: '-50% 0' }} />
      )}
    </div>
  );
}
