import type { SupabaseClient } from '@supabase/supabase-js';
import { TIERS, badgeOf } from '@/lib/badges';
import { sendPushTargets } from '@/lib/push-send';

// 활동 1등 뱃지 다시 계산 (supabase/member-badges.sql refresh_auto_badges) + 새로 받은 교우에게 휴대폰 알림
// 아침 cron(/api/cron/feast-day)과 관리자 '지금 다시 계산'(/api/admin/refresh-badges)이 부른다. service role 클라이언트로.
export async function refreshAutoBadges(admin: SupabaseClient): Promise<{ awarded: { user_id: string; badge_key: string }[]; pushed: number; error?: string }> {
  const { data, error } = await admin.rpc('refresh_auto_badges');
  if (error) return { awarded: [], pushed: 0, error: error.message };
  const awarded = ((data || []) as { user_id: string; badge_key: string }[]).filter(r => badgeOf(r.badge_key));
  const targets = awarded.map(r => {
    const def = badgeOf(r.badge_key)!;
    if (def.tier) return { recipientId: r.user_id, payload: {
      title: `🏅 '${def.label}' — ${TIERS[def.tier - 1].name} 등급이 되었어요`,
      body: `${def.desc} — 내 공간 '내 뱃지'에서 확인해 보세요`,
      url: `/?profile=${r.user_id}`, tag: `badge-${r.user_id}`,
    } };
    return { recipientId: r.user_id, payload: {
      title: def.permanent ? `🏅 '${def.label}' 도장을 받았어요` : `🏅 '${def.label}' 뱃지를 받았어요`,
      body: def.permanent ? `${def.desc} — 내 공간 '도장 모음'에 오늘 날짜로 남아요` : `${def.desc} — 지금 1등이에요! 내 공간에서 확인해 보세요`,
      url: `/?profile=${r.user_id}`, tag: `badge-${r.user_id}`,
    } };
  });
  const pushed = targets.length > 0 ? await sendPushTargets(admin, targets).catch(() => 0) : 0;
  return { awarded, pushed };
}
