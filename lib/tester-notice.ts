import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from '@/lib/push';
import { onePerDevice, type PushSub } from '@/lib/push-devices';
import { todayKst } from '@/lib/feast';

// 운영자가 정한 날 아침, 구글 Play 테스터 목록에 등록한('등록함') 교우에게 설치 안내 알림을 한 번 보낸다.
// 매일 아침 8시(한국 시간) 도는 축일 cron(app/api/cron/feast-day)이 부른다 — 따로 cron 을 늘리지 않으려고.
// 관리자 화면의 '등록한 N명에게 설치 안내 다시 보내기'와 같은 일을 예약해 둔 것. 지난 날짜는 아무 일도 하지 않는다.
// 2026-10-29: 비공개 테스트 게시(10-27) 뒤 새 설치 안내 화면(components/TesterSignup)으로 처음 알림 (운영자 요청)
export const TESTER_NOTICE_DAYS = ['2026-10-29'];

type Sub = PushSub & { user_id: string };

export async function sendScheduledTesterNotice(admin: SupabaseClient, vapidPrivateKey: string, now = new Date()) {
  if (!TESTER_NOTICE_DAYS.includes(todayKst(now))) return null;
  // 아침에만 (cron 이 늦게 돌거나 누가 다른 때 부르면 보내지 않음)
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (kstHour < 7 || kstHour >= 12) return { skipped: 'not morning' };

  const { data: testers, error } = await admin.from('tester_signups').select('user_id').eq('status', 'added');
  if (error) return { error: error.message };
  const ids = (testers || []).map(t => t.user_id as string);
  if (ids.length === 0) return { testers: 0, sent: 0 };

  const subscriptions: Sub[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from('push_subscriptions').select('*').in('user_id', ids.slice(i, i + 200));
    if (data) subscriptions.push(...onePerDevice(data as Sub[])); // 같은 기기에는 한 번만
  }
  if (subscriptions.length === 0) return { testers: ids.length, sent: 0 };

  const payload = JSON.stringify({
    title: '📱 이제 가톨릭그램 앱을 설치할 수 있어요',
    body: '테스터 교우님, 눌러서 설치 방법을 확인해 주세요 🙏',
    url: '/?tester=1',
    tag: 'tester-added',
  });
  webpush.setVapidDetails('mailto:yunho-jo@casuwon.or.kr', VAPID_PUBLIC_KEY, vapidPrivateKey);
  const results = await Promise.allSettled(subscriptions.map(sub =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
  ));

  // 만료되었거나 해지된 구독은 정리
  const expired = subscriptions.filter((_, i) => {
    const r = results[i];
    const status = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined;
    return status === 404 || status === 410;
  });
  if (expired.length > 0) await admin.from('push_subscriptions').delete().in('id', expired.map(s => s.id));

  return { testers: ids.length, sent: results.filter(r => r.status === 'fulfilled').length };
}
