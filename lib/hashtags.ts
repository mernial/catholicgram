// 해시태그: 글 안의 #단어 (한글·영문·숫자·_ , 최대 30자)
export const HASHTAG_PATTERN = /#([0-9A-Za-z가-힣_]{1,30})/g;

// 글에서 해시태그 목록 추출 (소문자, 중복 제거)
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const m of text.matchAll(HASHTAG_PATTERN)) tags.add(m[1].toLowerCase());
  return Array.from(tags);
}

// 여러 글에서 많이 쓰인 해시태그 순위
export function popularHashtags(texts: (string | null | undefined)[], limit = 12): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  texts.forEach(t => extractHashtags(t).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}
