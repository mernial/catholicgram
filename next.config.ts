import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 앱 버전(배포마다 바뀜): 앱을 다시 열었을 때 새 버전이 나왔으면 자동으로 새로고침하는 데 사용
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev',
  },
};

export default nextConfig;
