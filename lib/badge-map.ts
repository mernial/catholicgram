'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { badgeOf, badgeRank } from '@/lib/badges';

// 교우마다 달고 있는 활동 뱃지 키 (이름 옆 작은 메달용) — 앱이 열릴 때 한 번 모두 받아 두고(1등마다 한 줄이라 작음),
// 뱃지가 바뀌면(member-badges-changed) 다시 받는다. 본인이 숨긴 교우(profiles.hide_badges)는 뺀다.
// 운영자 2026-11-06: '소통왕·공감왕 같은 뱃지도 모든 프로필·게시글에 붙는 프로필에 보이게'
type BadgeMap = Record<string, string[]>;
let map: BadgeMap = {};
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export async function loadBadgeMap(force = false) {
  if (!force && Date.now() - loadedAt < 60_000) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { data, error } = await supabase.from('member_badges').select('user_id, badge_key').limit(2000);
      if (error || !data) return;
      const rows = (data as { user_id: string; badge_key: string }[]).filter(r => badgeOf(r.badge_key));
      const ids = Array.from(new Set(rows.map(r => r.user_id)));
      const hidden = new Set<string>();
      const featured: Record<string, string> = {};
      if (ids.length > 0) {
        // 대표 뱃지(featured_badge, featured-badge.sql) — 칸이 없으면 빼고 다시
        let res = await supabase.from('profiles').select('id, hide_badges, featured_badge').in('id', ids);
        if (res.error) res = await supabase.from('profiles').select('id, hide_badges').in('id', ids) as typeof res;
        ((res.data || []) as { id: string; hide_badges?: boolean; featured_badge?: string | null }[]).forEach(p => {
          if (p.hide_badges) hidden.add(p.id);
          if (p.featured_badge) featured[p.id] = p.featured_badge;
        });
      }
      const next: BadgeMap = {};
      // 이름 옆에는 1등 뱃지·기념 뱃지를 먼저, 달성 도장(permanent)은 뒤에 (많아질 수 있으므로 +N 으로)
      rows.sort((a, b) => badgeRank(a.badge_key) - badgeRank(b.badge_key)); // 1등 → 높은 등급 → 기념 → 나머지
      rows.forEach(r => { if (!hidden.has(r.user_id)) (next[r.user_id] ||= []).push(r.badge_key); });
      // 고른 대표 뱃지를 맨 앞으로 (이름 옆에는 맨 앞 하나 + 나머지 수)
      Object.entries(next).forEach(([uid, keys]) => { const f = featured[uid]; if (f && keys.includes(f)) next[uid] = [f, ...keys.filter(k => k !== f)]; });
      map = next; loadedAt = Date.now(); emit();
    } finally { loading = null; }
  })();
  return loading;
}

export function useBadgeMap(): BadgeMap {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    const onChange = () => { loadBadgeMap(true); };
    window.addEventListener('member-badges-changed', onChange);
    loadBadgeMap();
    return () => { listeners.delete(l); window.removeEventListener('member-badges-changed', onChange); };
  }, []);
  return map;
}
