// 네이버 로그인 시작: 네이버 로그인 화면으로 보낸다.
// (Supabase 는 네이버를 기본 지원하지 않아 서버에서 직접 연동한다 → callback/route.ts)

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId || !process.env.NAVER_CLIENT_SECRET) {
    return Response.redirect(`${origin}/?login_error=naver_not_configured`, 302);
  }
  const state = crypto.randomUUID();
  const authorize = new URL('https://nid.naver.com/oauth2.0/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${origin}/api/auth/naver/callback`);
  authorize.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `naver_state=${state}; Path=/api/auth/naver; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
