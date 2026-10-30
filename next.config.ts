import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 앱 버전(배포마다 바뀜): 앱을 다시 열었을 때 새 버전이 나왔으면 자동으로 새로고침하는 데 사용
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev',
    // 설정 → 버전 정보: 사람이 읽는 버전 번호(main 에 합친 PR 번호)·나온 때·이번 업데이트 제목 (lib/app-version)
    NEXT_PUBLIC_APP_RELEASE: /Merge pull request #(\d+)/.exec(process.env.VERCEL_GIT_COMMIT_MESSAGE || '')?.[1] || '',
    NEXT_PUBLIC_APP_NOTE: (process.env.VERCEL_GIT_COMMIT_MESSAGE || '').split(/\n\s*\n/)[1]?.split('\n')[0]?.trim().slice(0, 140) || '',
    NEXT_PUBLIC_APP_BUILT_AT: new Date().toISOString(),
  },
  // 보안 헤더: 다른 사이트가 앱 화면을 몰래 품어 누르게 하지 못하게(클릭재킹), 파일 형식 추측 금지, 다른 사이트로 주소 정보 최소 전달
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        // 늘 https 로만 접속 (중간에서 엿보거나 바꿔치기 못 하게)
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        // 다른 사이트 창이 우리 앱 창을 건드리지 못하게 (우리가 연 팝업은 그대로)
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
      ],
    }];
  },
};

export default nextConfig;
