// 닉네임 꾸미기: 영어 알파벳을 필기체 같은 특수 글자(유니코드 수학 문자)로 바꾼다
// 글꼴이 아니라 글자 자체가 바뀌므로 어느 화면·앱에 붙여 넣어도 같은 모양으로 보인다. 한글·숫자 등은 그대로 둔다.
// 빈칸(예약된 자리) 없이 A–Z, a–z 가 모두 있는 모양만 쓴다.
export const FANCY_STYLES = [
  { id: 'script', label: '필기체', upper: 0x1d4d0, lower: 0x1d4ea },
  { id: 'gothic', label: '옛 글씨', upper: 0x1d56c, lower: 0x1d586 },
  { id: 'bold', label: '굵게', upper: 0x1d400, lower: 0x1d41a },
  { id: 'italic', label: '기울임', upper: 0x1d468, lower: 0x1d482 },
] as const;

export type FancyStyle = (typeof FANCY_STYLES)[number]['id'];

// 꾸민 글자를 보통 알파벳으로 되돌린다 (다른 모양으로 다시 바꾸거나 '원래대로' 할 때)
export const toPlain = (text: string) => text.replace(/[\u{1D400}-\u{1D7FF}]/gu, c => c.normalize('NFKC'));

export const toFancy = (text: string, style: FancyStyle) => {
  const s = FANCY_STYLES.find(f => f.id === style);
  if (!s) return text;
  return toPlain(text).replace(/[A-Za-z]/g, c => {
    const code = c.charCodeAt(0);
    return String.fromCodePoint(code <= 90 ? s.upper + code - 65 : s.lower + code - 97);
  });
};

export const hasLatin = (text: string) => /[A-Za-z]/.test(toPlain(text));

// 이름 첫 글자 (프로필 사진이 없을 때 동그라미에 넣는 글자). 꾸민 글자·이모지는 두 칸짜리라 name[0] 로 자르면 깨진다.
export const initial = (name?: string | null, fallback = '') => Array.from(name || '')[0] || fallback;
