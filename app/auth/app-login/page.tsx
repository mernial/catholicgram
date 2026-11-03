'use client';

// 안드로이드 앱(하이브리드)이 크롬 창으로 여는 로그인 시작 화면 (lib/app-login.ts 참고)
// /auth/app-login?provider=kakao|google|naver&pkg=앱패키지&state=앱이만든값[&switch=1]
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { APP_PACKAGES, saveAppLogin } from '@/lib/app-login';

const NAMES: Record<string, string> = { kakao: '카카오', google: 'Google', naver: '네이버' };

export default function AppLogin() {
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const provider = q.get('provider') || '';
    const pkg = q.get('pkg') || '';
    const state = q.get('state') || '';
    const switchAccount = q.get('switch') === '1';
    if (!NAMES[provider] || !APP_PACKAGES.includes(pkg) || !/^[\w-]{8,64}$/.test(state)) {
      setTimeout(() => setError('앱에서 로그인을 다시 눌러 주세요.'), 0);
      return;
    }
    setTimeout(() => setName(NAMES[provider]), 0);
    (async () => {
      const { data } = await supabase.auth.getSession();
      const prev = data.session ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : null;
      saveAppLogin({ pkg, state, at: Date.now(), prev });
      if (provider === 'naver') {
        window.location.replace(switchAccount ? '/api/auth/naver/start?switch=1' : '/api/auth/naver/start');
        return;
      }
      const queryParams = provider === 'google' ? { prompt: 'select_account' } : switchAccount ? { prompt: 'login' } : undefined;
      const { data: d, error: e } = await supabase.auth.signInWithOAuth({
        provider: provider as 'kakao' | 'google',
        options: { redirectTo: `${window.location.origin}/auth/signin-complete`, skipBrowserRedirect: true, ...(queryParams ? { queryParams } : {}) },
      });
      if (e || !d?.url) { setError('로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
      window.location.replace(d.url);
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center">
      {error ? (
        <>
          <p className="text-stone-800 font-bold">{error}</p>
          <p className="text-stone-500 text-sm">이 창을 닫고 가톨릭그램 앱으로 돌아가 주세요.</p>
        </>
      ) : (
        <p className="text-stone-600 text-sm font-medium">{name ? `${name} 로그인으로 가는 중이에요…` : '로그인을 준비하는 중이에요…'}</p>
      )}
    </div>
  );
}
