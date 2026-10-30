// 대화방 날짜 경계: 날이 바뀌면 '2026년 10월 30일 금요일' 줄 (1:1·단체방·사랑방 공통, 시간 표시와 같은 휴대폰 시각)

export const chatDayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export const chatDayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

// 바로 앞에 보이는 메시지와 날이 다르면 true (맨 처음 메시지도 true). 내 화면에서만 지운 메시지는 건너뛰고 봄
export function isNewChatDay<T extends { created_at: string }>(list: T[], i: number, skip?: (m: T) => boolean) {
  for (let j = i - 1; j >= 0; j--) {
    if (skip?.(list[j])) continue;
    return chatDayKey(list[j].created_at) !== chatDayKey(list[i].created_at);
  }
  return true;
}

export function ChatDayDivider({ iso }: { iso: string }) {
  const label = chatDayLabel(iso);
  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 my-2 text-[0.8125rem] text-stone-500">
      <span className="flex-1 h-px bg-stone-300" />
      <span className="shrink-0 bg-white/80 rounded-full px-3 py-1">{label}</span>
      <span className="flex-1 h-px bg-stone-300" />
    </div>
  );
}
