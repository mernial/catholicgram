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
  return (
    <p ref={ref} onClick={folded ? onExpand : undefined} className={`${className} ${folded ? 'cursor-pointer' : ''}`}>
      {prefix}
      {folded ? (
        <>
          {renderText(text.slice(0, cut).trimEnd())}{' '}
          <button onClick={e => { e.stopPropagation(); onExpand(); }} className="font-semibold text-stone-500 whitespace-nowrap">… 더 보기</button>
        </>
      ) : (
        <>
          {renderText(text)}
          {expanded && long && onCollapse && (
            <>
              {' '}
              <button onClick={e => { e.stopPropagation(); onCollapse(); requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'nearest' })); }} className="font-semibold text-stone-500 whitespace-nowrap">간략히 보기</button>
            </>
          )}
        </>
      )}
    </p>
  );
}
