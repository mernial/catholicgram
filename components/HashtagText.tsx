'use client';

import { Fragment } from 'react';
import { HASHTAG_PATTERN } from '@/lib/hashtags';
import { MENTION_PATTERN } from '@/lib/mentions';

type Token = { start: number; end: number; kind: 'tag' | 'mention'; value: string };

// 글 속 #해시태그(검색)와 @아이디 태그(프로필로 이동)를 눌러지는 링크로 표시
export default function HashtagText({ text, onTag, onMention }: {
  text: string;
  onTag?: (tag: string) => void;
  onMention?: (handle: string) => void;
}) {
  if (!text) return null;
  const tokens: Token[] = [];
  for (const m of text.matchAll(HASHTAG_PATTERN)) {
    const start = m.index ?? 0;
    tokens.push({ start, end: start + m[0].length, kind: 'tag', value: m[1] });
  }
  for (const m of text.matchAll(MENTION_PATTERN)) {
    const handle = m[2].replace(/\.+$/, '');
    const start = (m.index ?? 0) + m[1].length;
    tokens.push({ start, end: start + 1 + handle.length, kind: 'mention', value: handle });
  }
  tokens.sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const t of tokens) {
    if (t.start < last) continue; // 겹치는 경우 앞의 것만
    if (t.start > last) parts.push(text.slice(last, t.start));
    const label = t.kind === 'tag' ? `#${t.value}` : `@${t.value}`;
    const onClick = t.kind === 'tag' ? onTag : onMention;
    parts.push(
      onClick ? (
        <button
          key={`${t.start}-${label}`}
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(t.value.toLowerCase()); }}
          className="text-blue-600 font-bold hover:underline whitespace-nowrap"
        >
          {label}
        </button>
      ) : (
        <span key={`${t.start}-${label}`} className="text-blue-600 font-bold whitespace-nowrap">{label}</span>
      )
    );
    last = t.end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}
