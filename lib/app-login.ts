// 안드로이드 앱(하이브리드) 로그인: 앱 안 웹뷰에서는 구글이 로그인을 막아서(403 disallowed_useragent)
// 앱이 크롬 창으로 /auth/app-login 을 열고 → 거기서 카카오·구글·네이버로 로그인 → /auth/signin-complete 가
// 받은 로그인을 intent:// 로 그 앱(패키지 고정)에 넘겨준다. 앱은 그 토큰으로 웹뷰 안에서 로그인한다.
// 크롬에 원래 있던 로그인(예전 홈 화면 앱·Play 앱이 쓰던 것)은 넘겨준 뒤 그대로 되돌려 둔다 (한 로그인을 두 곳이 같이 쓰지 않게).
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const APP_LOGIN_KEY = 'cgAppLogin';
export const APP_PACKAGES = ['com.catholicgram.android', 'com.catholicgram.android.dev'];
const MAX_AGE = 20 * 60 * 1000;

export type AppLogin = { pkg: string; state: string; at: number; prev: { access_token: string; refresh_token: string } | null };

export function readAppLogin(): AppLogin | null {
  try {
    const v = JSON.parse(localStorage.getItem(APP_LOGIN_KEY) || 'null') as AppLogin | null;
    if (!v || !APP_PACKAGES.includes(v.pkg) || !v.state || Date.now() - v.at > MAX_AGE) return null;
    return v;
  } catch { return null; }
}

export function saveAppLogin(v: AppLogin) {
  try { localStorage.setItem(APP_LOGIN_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
}

/** 로그인을 앱에 넘길 주소 (그 패키지의 앱만 열림) */
export function handoffUrl(login: AppLogin, session: Session): string {
  const hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in ?? 3600),
    expires_at: String(session.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
    token_type: session.token_type || 'bearer',
    type: 'app',
  }).toString();
  return `intent://auth#Intent;scheme=catholicgram;package=${login.pkg};S.cg_state=${encodeURIComponent(login.state)};S.cg_hash=${encodeURIComponent(hash)};end`;
}

/** 앱에 넘길 주소를 만들고, 크롬의 로그인은 원래대로 (없었으면 이 창에서만 로그아웃) */
export async function finishAppLogin(login: AppLogin, session: Session): Promise<string> {
  const url = handoffUrl(login, session);
  try { localStorage.removeItem(APP_LOGIN_KEY); } catch { /* 무시 */ }
  try {
    if (login.prev) await supabase.auth.setSession(login.prev);
    else await supabase.auth.signOut({ scope: 'local' });
  } catch { /* 되돌리지 못해도 앱 로그인은 그대로 */ }
  return url;
}
