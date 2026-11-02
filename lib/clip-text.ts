// 글자 수 제한 (루비로사 2026-11-02: 기도 내용 끝의 ❤️ 가 검은 ❤ 로 저장됨)
// ❤️ 는 ❤(U+2764) + 보이지 않는 '그림으로 보여 줘' 표시(U+FE0F) 두 글자라, 100자 칸에서 .slice(0, 100) 하면
// 끝의 표시만 잘려 글자 모양 ❤ 가 남았다. → 그림 문자·한 글자로 보이는 것은 통째로 넣거나 통째로 뺀다.
// 세는 법은 서버(Postgres char_length = 코드 포인트)와 같게 — 화면 숫자와 서버 제한이 어긋나지 않게
const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;

/** 글자 수 (코드 포인트 — 서버의 char_length 와 같은 셈) */
export function charCount(text: string): number {
  let n = 0;
  for (const _ of text) n++; // eslint-disable-line @typescript-eslint/no-unused-vars
  return n;
}

/** max 글자까지만 — 보이는 한 글자(그림 문자·조합)를 반으로 자르지 않음 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text; // UTF-16 길이가 max 이하면 코드 포인트도 max 이하
  if (charCount(text) <= max) return text;
  const parts = segmenter ? Array.from(segmenter.segment(text), s => s.segment) : Array.from(text);
  let out = '';
  let n = 0;
  for (const g of parts) {
    const c = charCount(g);
    if (n + c > max) break;
    out += g;
    n += c;
  }
  return out;
}

/** 예전에 끝 표시가 잘려 저장된 검은 ❤ 를 보일 때만 빨간 ❤️ 로 (기도지향 — 앱에서 ❤ 만 따로 칠 일은 거의 없음) */
export const showHeart = (text: string) => text.replace(/\u2764(?!\uFE0F)/g, '\u2764\uFE0F');
