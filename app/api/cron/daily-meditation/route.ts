import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { createMeditation, meditationPostText } from '@/lib/meditation';
import { renderMeditationCard } from '@/lib/meditation-card';

// 매일 저녁 8시(한국 시간) Vercel Cron 이 호출 → 다음 날 「오늘의 묵상」 글과 포토카드를 관리자 계정으로 올린다.
// 관리자는 앱에서 직접 실행할 수도 있다: ?date=YYYY-MM-DD (그날 묵상), ?preview=1 (올리지 않고 미리 보기)
// 같은 날짜의 묵상이 이미 올라가 있으면 다시 올리지 않는다.

export const maxDuration = 300; // 웹 검색 + 글쓰기에 1~3분 걸림

const KST = 9 * 3600 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const tomorrowKst = () => new Date(Date.now() + KST + 86400000).toISOString().slice(0, 10);
const dateLabelOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00+09:00`);
  return `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 ${WEEKDAYS[d.getUTCDay()]}요일`;
};

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY 가 설정되지 않았습니다. (Vercel 환경 변수)' }, { status: 503 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 누가 부르는지 확인: Vercel Cron(저녁 7~10시) 또는 CRON_SECRET, 아니면 관리자 로그인
  const url = new URL(request.url);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const cronSecret = process.env.CRON_SECRET;
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  let manual = false;
  let authorized = cronSecret
    ? bearer === cronSecret
    : (request.headers.get('user-agent') || '').startsWith('vercel-cron') && kstHour >= 19 && kstHour < 23;
  if (!authorized && bearer) {
    const { data: { user } } = await admin.auth.getUser(bearer);
    authorized = !!user?.email && ADMIN_EMAILS.includes(user.email);
    manual = authorized;
  }
  if (!authorized) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const isoDate = manual && /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date')! : tomorrowKst();
  const preview = manual && url.searchParams.get('preview') === '1';

  // 관리자 계정
  const { data: adminProfile } = await admin.from('profiles').select('id, baptismal_name').in('email', ADMIN_EMAILS).limit(1).maybeSingle();
  if (!adminProfile) return Response.json({ error: '관리자 프로필을 찾지 못했어요' }, { status: 500 });

  // 이미 올렸는지 (사진 주소에 날짜가 들어감)
  const path = `meditations/${isoDate}.png`;
  const { data: { publicUrl } } = admin.storage.from('community-images').getPublicUrl(path);
  if (!preview) {
    const { data: existing } = await admin.from('posts').select('id').eq('user_id', adminProfile.id).contains('images', [publicUrl]).limit(1);
    if (existing && existing.length > 0) return Response.json({ skipped: '이미 올린 날짜예요', date: isoDate, postId: existing[0].id });
  }

  try {
    const meditation = await createMeditation(isoDate, dateLabelOf(isoDate));
    const png = await renderMeditationCard(meditation);
    const content = meditationPostText(meditation);
    if (preview) {
      return Response.json({ date: isoDate, content, image: `data:image/png;base64,${Buffer.from(png).toString('base64')}` });
    }
    const { error: uploadError } = await admin.storage.from('community-images').upload(path, png, { contentType: 'image/png', upsert: true });
    if (uploadError) return Response.json({ error: `사진을 올리지 못했어요: ${uploadError.message}` }, { status: 500 });
    const { data: created, error } = await admin.from('posts').insert({
      user_id: adminProfile.id,
      author_name: adminProfile.baptismal_name || '윤호요셉 신부',
      content,
      images: [publicUrl],
    }).select('id').single();
    if (error) return Response.json({ error: `글을 올리지 못했어요: ${error.message}` }, { status: 500 });
    return Response.json({ ok: true, date: isoDate, postId: created.id, theme: meditation.theme });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
