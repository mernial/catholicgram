'use client';

import { Fragment } from 'react';
import { HASHTAG_PATTERN } from '@/lib/hashtags';
import { MENTION_PATTERN } from '@/lib/mentions';
import { isNativeApp, nativeOpenExternal } from '@/lib/native-app';

type Token = { start: number; end: number; kind: 'tag' | 'mention' | 'link'; value: string };

// 글 속 주소(https://… · www.…)를 눌러지는 링크로 (운영자 2026-11-10: 댓글의 유튜브 링크가 안 눌림). 끝에 붙은 문장 부호·닫는 괄호는 뺀다
export const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const trimUrl = (raw: string) => {
  let u = raw.replace(/[.,;:!?…)\]}'"]+$/u, '');
  // 괄호를 연 만큼만 닫는 괄호를 남김 (위키 주소 등)
  while (u.endsWith(')') && (u.split('(').length - 1) < (u.split(')').length - 1)) u = u.slice(0, -1);
  return u;
};
const hrefOf = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
/** 화면에 보일 주소: 앞의 https://·www. 를 떼고 길면 줄임 */
const shortUrl = (u: string) => { const t = u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''); return t.length > 48 ? `${t.slice(0, 45)}…` : t; };
const openLink = (e: React.MouseEvent, href: string) => {
  e.stopPropagation();
  if (isNativeApp()) { e.preventDefault(); nativeOpenExternal(href); }
};

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
  for (const m of text.matchAll(URL_PATTERN)) {
    const u = trimUrl(m[0]);
    if (u.length < 5) continue;
    const start = m.index ?? 0;
    tokens.push({ start, end: start + u.length, kind: 'link', value: u });
  }
  // 주소 안의 #·@ 조각(유튜브 #t=10s 등)은 주소가 이김: 주소 먼저, 겹치는 토큰은 아래에서 버림
  tokens.sort((a, b) => a.start - b.start || (a.kind === 'link' ? -1 : b.kind === 'link' ? 1 : 0));

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const t of tokens) {
    if (t.start < last) continue; // 겹치는 경우 앞의 것만
    if (t.start > last) parts.push(text.slice(last, t.start));
    if (t.kind === 'link') {
      const href = hrefOf(t.value);
      parts.push(
        <a key={`${t.start}-link`} href={href} target="_blank" rel="noopener noreferrer" onClick={e => openLink(e, href)}
          className="text-blue-600 underline underline-offset-2 break-all" title={href}>{shortUrl(t.value)}</a>
      );
      last = t.end;
      continue;
    }
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
