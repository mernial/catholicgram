'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// 글을 정해진 줄 수만 보여 주고, 넘치면 마지막 줄의 글 바로 뒤에 '… 더 보기'를 붙인다.
// 글이나 '더 보기'를 누르면 전체를 펼치고, onCollapse가 있으면 끝에 '간략히 보기'로 다시 접는다.
export default function ClampText({ lines, expanded, onExpand, onCollapse, prefix, prefixText = '', text, renderText, className = '' }: {
  lines: number;
  expanded: boolean;
  onExpand: () => void;
  onCollapse?: () => void;
  prefix?: React.ReactNode;   // 맨 앞 (닉네임 등)
  prefixText?: string;        // 길이 재기용 prefix 글자
  text: string;
  renderText: (text: string) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [cut, setCut] = useState<number | null>(null); // 보여 줄 글자 수 (null = 전부)
  const [long, setLong] = useState(false); // 접을 만큼 긴 글인지 (펼친 뒤 '간략히 보기'용)

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) { setCut(null); setLong(false); return; }
    if (expanded) { setCut(null); return; }
    const measure = () => {
      const style = getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
      const maxHeight = lines * lineHeight + 2;
      const probe = document.createElement('div');
      Object.assign(probe.style, {
        position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0',
        // font 한꺼번에 쓰기는 사파리(아이폰)에서 비어 있어 하나씩 복사
        width: `${el.clientWidth}px`, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        fontStyle: style.fontStyle, letterSpacing: style.letterSpacing, lineHeight: style.lineHeight,
        whiteSpace: 'pre-wrap', wordBreak: style.wordBreak, overflowWrap: 'anywhere',
      });
      document.body.appendChild(probe);
      // 닉네임은 굵은 글씨·배지가 있어 조금 넉넉히 잡는다
      const head = prefixText ? `${prefixText}　 ` : '';
      const fits = (s: string) => { probe.textContent = s; return probe.scrollHeight <= maxHeight; };
      if (fits(head + text)) { setCut(null); setLong(false); probe.remove(); return; }
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(`${head}${text.slice(0, mid).trimEnd()} … 더 보기　`)) lo = mid; else hi = mid - 1;
      }
      probe.remove();
      setCut(lo);
      setLong(true);
    };
    measure();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; measure(); } });
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text, lines, prefixText]);

  const folded = !expanded && cut !== null;

  // 아이폰 사파리는 글 사이 단추의 click 이 오지 않는 경우가 있어 손가락을 뗄 때 바로 처리한다
  // (조금이라도 밀었으면 화면 넘김으로 보고 무시, 처리했으면 뒤따르는 click 은 막음)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const tap = (fn: () => void, ignoreInner = false) => ({
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; touchStart.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = touchStart.current; touchStart.current = null;
      if (!s) return;
      // 글 안의 닉네임·#태그·@이름 단추는 그것대로 동작하게 둔다
      if (ignoreInner && (e.target as Element).closest?.('button, a')) return;
      const t = e.changedTouches[0];
      if (Math.abs(t.clientX - s.x) > 10 || Math.abs(t.clientY - s.y) > 10) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    },
    onClick: (e: React.MouseEvent) => {
      if (ignoreInner && (e.target as Element).closest?.('button, a')) return;
      e.stopPropagation();
      fn();
    },
  });
  const collapse = () => {
    onCollapse?.();
    // 접은 글이 화면 위로 올라가 있으면 보이는 곳으로 (앱은 main 안에서 스크롤됨)
    requestAnimationFrame(() => {
      const el = ref.current;
      const scroller = el?.closest('main');
      if (!el || !scroller) return;
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      if (top < 0) scroller.scrollTop += top - 80;
    });
  };

  return (
    <p ref={ref} {...(folded ? tap(onExpand, true) : {})} className={`${className} ${folded ? 'cursor-pointer' : ''} [touch-action:manipulation]`}>
      {prefix}
      {folded ? (
        <>
          {renderText(text.slice(0, cut).trimEnd())}{' '}
          <button type="button" {...tap(onExpand)} className="font-semibold text-stone-500 whitespace-nowrap py-1">… 더 보기</button>
        </>
      ) : (
        <>
          {renderText(text)}
          {expanded && long && onCollapse && (
            <>
              {' '}
              <button type="button" {...tap(collapse)} className="font-semibold text-stone-500 whitespace-nowrap py-1">간략히 보기</button>
            </>
          )}
        </>
      )}
    </p>
  );
}
