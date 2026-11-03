'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { finishAppLogin, readAppLogin } from '@/lib/app-login';

export default function SignInComplete() {
  const [blockedMessage, setBlockedMessage] = useState('');
  // 안드로이드 앱이 크롬 창으로 연 로그인이면: 받은 로그인을 앱에 넘겨줄 주소 (lib/app-login.ts)
  const [appHandoff, setAppHandoff] = useState('');
  const [appFailed, setAppFailed] = useState(false);

  useEffect(() => {
    // 이용 정지된 계정이면 로그인 대신 안내를 보여준다
    const params = new URLSearchParams(`${window.location.search.slice(1)}&${window.location.hash.slice(1)}`);
    const errorText = `${params.get('error_description') || ''} ${params.get('error_code') || ''}`;
    if (/banned/i.test(errorText)) {
      setTimeout(() => setBlockedMessage('운영 정책에 따라 이용이 정지된 계정입니다.'), 0);
      return;
    }

    const appLogin = readAppLogin();
    if (appLogin) {
      let done = false;
      const handoff = async (session: Parameters<typeof finishAppLogin>[1]) => {
        if (done) return;
        done = true;
        const url = await finishAppLogin(appLogin, session);
        setAppHandoff(url);
        window.location.href = url; // 막히면 화면의 '앱으로 돌아가기' 단추로
      };
      // 크롬에 원래 있던 로그인(prev)은 넘기지 않음 — 방금 새로 받은 로그인만
      const fresh = (session: Parameters<typeof finishAppLogin>[1] | null) => !!session && session.access_token !== appLogin.prev?.access_token;
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session && fresh(session)) handoff(session); });
      const t = setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session && fresh(data.session)) handoff(data.session);
      }, 1500);
      const fail = setTimeout(() => { if (!done) setAppFailed(true); }, 10000);
      return () => { clearTimeout(t); clearTimeout(fail); sub?.subscription.unsubscribe(); };
    }

    // URL의 토큰을 세션에 저장한 뒤 메인 페이지('/')로 자동 이동
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        window.location.replace('/');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.replace('/');
      }
    });

    // 로그인 처리가 끝나기 전에 넘어가면 세션이 사라지므로 넉넉히 기다린 뒤에만 복귀
    // (아이폰 등 느린 환경 대비)
    const fallback = setTimeout(() => {
      window.location.replace('/');
    }, 6000);

    return () => {
      clearTimeout(fallback);
      authListener?.subscription.unsubscribe();
    };
  }, []);

  if (appHandoff || appFailed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-stone-50 p-6 text-center">
        {appHandoff ? (
          <>
            <p className="text-stone-800 font-bold text-lg">로그인했어요</p>
            <a href={appHandoff} className="px-6 py-3.5 rounded-2xl bg-stone-900 text-white text-base font-bold">가톨릭그램 앱으로 돌아가기</a>
            <p className="text-stone-500 text-sm">앱이 저절로 열리지 않으면 위 단추를 눌러 주세요</p>
          </>
        ) : (
          <>
            <p className="text-stone-800 font-bold">로그인을 마치지 못했어요</p>
            <p className="text-stone-500 text-sm">이 창을 닫고 가톨릭그램 앱에서 다시 로그인해 주세요.</p>
          </>
        )}
      </div>
    );
  }

  if (blockedMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center">
        <p className="text-3xl">🚫</p>
        <p className="text-stone-800 font-bold">{blockedMessage}</p>
        <p className="text-stone-500 text-sm">문의: yunho-jo@casuwon.or.kr</p>
        <a href="/" className="mt-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-bold">처음으로</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <p className="text-stone-600 text-sm font-medium">로그인을 완료하는 중입니다...</p>
    </div>
  );
}