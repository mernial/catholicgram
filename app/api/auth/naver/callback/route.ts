import { createClient } from '@supabase/supabase-js';

// 네이버 로그인 완료: 네이버 회원 정보를 확인한 뒤 Supabase 계정에 로그인시킨다.
// - 네이버 회원마다 고정된 내부 이메일(naver-<네이버ID>@naver.catholicgram.app)로 계정을 만들어
//   다른 로그인 방식의 계정과 섞이지 않게 한다.
// - Supabase 의 일회용 로그인 링크(magic link)를 서버에서 만들어 바로 이동시키므로 메일은 보내지 않는다.

const fail = (origin: string, reason: string) => new Response(null, {
  status: 302,
  headers: {
    Location: `${origin}/?login_error=${reason}`,
    'Set-Cookie': 'naver_state=; Path=/api/auth/naver; Max-Age=0',
  },
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error')) return fail(origin, 'naver_cancelled');

  const savedState = request.headers.get('cookie')?.match(/(?:^|;\s*)naver_state=([^;]+)/)?.[1];
  if (!code || !state || !savedState || state !== savedState) return fail(origin, 'naver_state');

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clientId || !clientSecret || !supabaseUrl || !serviceRoleKey) return fail(origin, 'naver_not_configured');

  // 1) 접근 토큰
  const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
  Object.entries({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, state })
    .forEach(([k, v]) => tokenUrl.searchParams.set(k, v));
  const tokenRes = await fetch(tokenUrl, { cache: 'no-store' }).catch(() => null);
  const token = tokenRes?.ok ? await tokenRes.json() as { access_token?: string } : null;
  if (!token?.access_token) return fail(origin, 'naver_token');

  // 2) 네이버 회원 정보
  const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${token.access_token}` }, cache: 'no-store',
  }).catch(() => null);
  const me = meRes?.ok ? await meRes.json() as { response?: { id?: string; email?: string; nickname?: string; name?: string } } : null;
  const naver = me?.response;
  if (!naver?.id) return fail(origin, 'naver_profile');

  // 3) Supabase 계정 만들기(처음이면) → 일회용 로그인 링크로 이동
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `naver-${naver.id.replace(/[^A-Za-z0-9_-]/g, '').toLowerCase()}@naver.catholicgram.app`;
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { naver_id: naver.id },
    user_metadata: { provider: 'naver', naver_email: naver.email || null, name: naver.name || null, nickname: naver.nickname || null },
  });
  if (createError && !/already|registered|exists/i.test(createError.message)) return fail(origin, 'naver_account');

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${origin}/auth/signin-complete` },
  });
  if (linkError || !link?.properties?.action_link) return fail(origin, 'naver_account');

  return new Response(null, {
    status: 302,
    headers: {
      Location: link.properties.action_link,
      'Set-Cookie': 'naver_state=; Path=/api/auth/naver; Max-Age=0',
    },
  });
}
