'use client';

import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { cheerKindOf, todayFeastKeys, type CheerKind } from '@/lib/feast';

// 오늘(한국 시간) 생일·축일인 교우 — 글·댓글·메시지·목록의 프로필 사진에 리본·비둘기를 붙이는 데 쓴다 (components/CelebrateAvatar CelebrateBand)
// 앱을 열 때 한 번에 불러 두고(오늘 날인 교우만이라 적음), 한국 시간 자정이 지나거나 앱으로 돌아왔을 때 날이 바뀌었으면 다시 불러 저절로 사라진다.
// 생일은 profiles.birthday 칸 읽기 권한(supabase/birthday.sql)이 있어야 — 없으면 축일만
type Days = { birthday?: string | null; feast_day?: string | null };
let days = new Map<string, Days>();
let loadedFor = '';
let loadedAt = 0;
let loading: Promise<void> | null = null;
let again = false; // 불러오는 중에 다시 부르면(로그인 직후 등) 끝난 뒤 한 번 더
let midnight: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

const todayKey = () => todayFeastKeys()[0];

// 다음 한국 시간 자정(+5초)에 다시 불러 어제 축하는 지운다
const armMidnight = () => {
  if (midnight) clearTimeout(midnight);
  const kst = Date.now() + 9 * 3600_000;
  const next = (Math.floor(kst / 86400_000) + 1) * 86400_000 - 9 * 3600_000;
  midnight = setTimeout(() => { emit(); refreshCelebrations(); }, next - Date.now() + 5000);
};

export function refreshCelebrations() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (loading) { again = true; return loading; }
  const key = todayKey();
  const keys = todayFeastKeys();
  const list = keys.map(k => `"${k}"`).join(',');
  loading = (async () => {
    try {
      const both = await supabase.from('profiles').select('id, feast_day, birthday').or(`feast_day.in.(${list}),birthday.in.(${list})`).limit(1000);
      const { data, error } = both.error ? await supabase.from('profiles').select('id, feast_day').in('feast_day', keys).limit(1000) : both; // 생일 칸·권한 전이면 축일만
      if (error) return;
      days = new Map(((data || []) as (Days & { id: string })[]).map(r => [r.id, { birthday: r.birthday, feast_day: r.feast_day }]));
      loadedFor = key;
      loadedAt = Date.now();
      emit();
    } finally {
      loading = null;
      armMidnight();
      if (again) { again = false; refreshCelebrations(); }
    }
  })();
  return loading;
}

const onVisible = () => {
  if (document.visibilityState !== 'visible') return;
  if (loadedFor !== todayKey() || Date.now() - loadedAt > 30 * 60_000) { emit(); refreshCelebrations(); }
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisible);
    if (loadedFor !== todayKey()) refreshCelebrations();
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) document.removeEventListener('visibilitychange', onVisible);
  };
};

// 이 교우가 오늘 생일·축일이면 그 종류 — 날짜는 볼 때마다 다시 따지므로 자정이 지나면 불러오기 전이라도 사라진다
export function useCelebration(id?: string | null): CheerKind | null {
  return useSyncExternalStore(subscribe, () => (id ? cheerKindOf(days.get(id)) : null), () => null);
}
