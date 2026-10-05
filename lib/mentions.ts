// @아이디 태그(언급): 글·댓글 속 @핸들을 찾아 링크로 보여주고, 언급된 사람에게 알린다.

// 앞 글자가 영문/숫자/@ 이면 이메일 등이므로 제외. 끝의 마침표는 문장 부호로 보고 뺀다.
export const MENTION_PATTERN = /(^|[^0-9A-Za-z_@])@([0-9A-Za-z_가-힣][0-9A-Za-z_.가-힣]{0,29})/g;

const clean = (handle: string) => handle.replace(/\.+$/, '').toLowerCase();

// 글에서 언급된 핸들 목록 (소문자, 중복 제거)
export function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const handles = new Set<string>();
  for (const m of text.matchAll(MENTION_PATTERN)) {
    const h = clean(m[2]);
    if (h) handles.add(h);
  }
  return Array.from(handles);
}

// 이 글이 이 핸들을 언급했는지 (다른 핸들의 앞부분만 같은 경우 제외)
export const mentionsHandle = (text: string | null | undefined, handle?: string | null) =>
  !!handle && extractMentions(text).includes(handle.toLowerCase());

// 입력 중인 마지막 단어가 @로 시작하면 그 글자 (자동 완성용)
export const typingMention = (text: string): string | null => {
  const m = text.match(/(^|\s)@([0-9A-Za-z_.가-힣]{0,30})$/);
  return m ? m[2] : null;
};

// 입력 중인 @글자를 고른 핸들로 바꾼다
export const insertMention = (text: string, handle: string) =>
  text.replace(/(^|\s)@([0-9A-Za-z_.가-힣]{0,30})$/, (_all, pre) => `${pre}@${handle} `);
