'use client';

import { Fragment } from 'react';
import { HASHTAG_PATTERN } from '@/lib/hashtags';

// 글 속 #해시태그를 눌러서 검색할 수 있는 링크로 표시
export default function HashtagText({ text, onTag }: { text: string; onTag?: (tag: string) => void }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HASHTAG_PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const tag = m[1];
    parts.push(
      onTag ? (
        <button
          key={`${start}-${tag}`}
          type="button"
          onClick={(e) => { e.stopPropagation(); onTag(tag.toLowerCase()); }}
          className="text-blue-600 font-bold hover:underline"
        >
          #{tag}
        </button>
      ) : (
        <span key={`${start}-${tag}`} className="text-blue-600 font-bold">#{tag}</span>
      )
    );
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}
