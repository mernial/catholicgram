// 안드로이드 앱(구글 플레이)과 이 사이트를 연결하는 인증 파일
// Vercel 환경변수 ANDROID_SHA256_FINGERPRINTS 에 Play Console 의 앱 서명 인증서
// SHA-256 지문을 넣으면 된다 (여러 개면 쉼표로 구분).
// 그러면 앱에서 주소창 없이 전체 화면으로 열린다.

export const dynamic = 'force-dynamic';

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME || 'com.catholicgram.app';
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || '')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);

  return Response.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
