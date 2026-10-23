import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 앱 버전(배포마다 바뀜): 앱을 다시 열었을 때 새 버전이 나왔으면 자동으로 새로고침하는 데 사용
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev',
  },
  // 보안 헤더: 다른 사이트가 앱 화면을 몰래 품어 누르게 하지 못하게(클릭재킹), 파일 형식 추측 금지, 다른 사이트로 주소 정보 최소 전달
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
      ],
    }];
  },
};

export default nextConfig;
