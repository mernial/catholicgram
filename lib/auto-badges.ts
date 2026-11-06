import type { SupabaseClient } from '@supabase/supabase-js';
import { badgeOf } from '@/lib/badges';
import { sendPushTargets } from '@/lib/push-send';

// 활동 1등 뱃지 다시 계산 (supabase/member-badges.sql refresh_auto_badges) + 새로 받은 교우에게 휴대폰 알림
// 아침 cron(/api/cron/feast-day)과 관리자 '지금 다시 계산'(/api/admin/refresh-badges)이 부른다. service role 클라이언트로.
export async function refreshAutoBadges(admin: SupabaseClient): Promise<{ awarded: { user_id: string; badge_key: string }[]; pushed: number; error?: string }> {
  const { data, error } = await admin.rpc('refresh_auto_badges');
  if (error) return { awarded: [], pushed: 0, error: error.message };
  const awarded = ((data || []) as { user_id: string; badge_key: string }[]).filter(r => badgeOf(r.badge_key));
  const targets = awarded.map(r => {
    const def = badgeOf(r.badge_key)!;
    return { recipientId: r.user_id, payload: {
      title: `🏅 '${def.label}' 뱃지를 받았어요`,
      body: `${def.desc} — 지금 1등이에요! 내 공간에서 확인해 보세요`,
      url: `/?profile=${r.user_id}`, tag: `badge-${r.user_id}`,
    } };
  });
  const pushed = targets.length > 0 ? await sendPushTargets(admin, targets).catch(() => 0) : 0;
  return { awarded, pushed };
}
