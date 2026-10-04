import { supabase } from '@/lib/supabase';

// 관심사 기록 (검색어, 누른 해시태그) — 탐색 탭의 맞춤 추천과 최근 검색에 쓰인다.
// supabase/explore.sql 의 interest_events 테이블에 저장하고, 아직 테이블이 없으면 이 기기에만 저장한다.

export type InterestKind = 'search' | 'tag';
export interface InterestEvent { kind: InterestKind; value: string; created_at: string }

const LOCAL_KEY = 'interestEvents';

const readLocal = (): InterestEvent[] => {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
};
const writeLocal = (events: InterestEvent[]) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(events.slice(0, 100))); } catch { /* 저장 불가 */ }
};

export async function recordInterest(userId: string | undefined, kind: InterestKind, rawValue: string) {
  const value = rawValue.trim().slice(0, 60);
  if (!value) return;
  const event: InterestEvent = { kind, value, created_at: new Date().toISOString() };
  writeLocal([event, ...readLocal().filter(e => !(e.kind === kind && e.value === value))]);
  if (userId) await supabase.from('interest_events').insert({ kind, value }).then(() => {}, () => {});
}

export async function loadInterests(userId: string | undefined): Promise<InterestEvent[]> {
  if (userId) {
    const { data, error } = await supabase.from('interest_events').select('kind, value, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(150);
    if (!error && data) return data as InterestEvent[];
  }
  return readLocal();
}

export async function removeSearch(userId: string | undefined, value: string | null) {
  // value 가 null 이면 최근 검색 전체 삭제
  writeLocal(readLocal().filter(e => e.kind !== 'search' || (value !== null && e.value !== value)));
  if (!userId) return;
  let q = supabase.from('interest_events').delete().eq('user_id', userId).eq('kind', 'search');
  if (value !== null) q = q.eq('value', value);
  await q.then(() => {}, () => {});
}
