import { useRef } from 'react';

// 한 번 누름과 두 번 누름을 구분한다 (두 번 누르면 한 번 누름 동작은 하지 않음)
export function useDoubleTap(onSingle: () => void, onDouble: () => void, delay = 260) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      onDouble();
      return;
    }
    timer.current = setTimeout(() => { timer.current = null; onSingle(); }, delay);
  };
}
