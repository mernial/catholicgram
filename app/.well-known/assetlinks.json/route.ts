// 안드로이드 앱(구글 플레이)과 이 사이트를 연결하는 인증 파일
// Play Console → 앱 무결성 → 앱 서명 → '앱 서명 키 인증서'의 SHA-256 지문을 아래 FINGERPRINTS 에 넣는다
// (Vercel 환경변수 ANDROID_SHA256_FINGERPRINTS 에 쉼표로 더 넣어도 됨). 그러면 앱에서 주소창 없이 전체 화면으로 열린다.
// 이 지문은 누구나 볼 수 있는 공개 값이라 저장소에 넣어도 된다.

export const dynamic = 'force-dynamic';

const PACKAGE = 'com.catholicgram.android'; // 지금 플레이에 올린 앱 (예전 초안 com.catholicgram.app 은 쓰지 않음)
const FINGERPRINTS: string[] = [];

export function GET() {
  const fingerprints = Array.from(new Set([
    ...FINGERPRINTS,
    ...(process.env.ANDROID_SHA256_FINGERPRINTS || '').split(','),
  ].map(f => f.trim().toUpperCase()).filter(Boolean)));
  // 환경변수에 예전 패키지 이름이 남아 있어도 지금 앱은 늘 함께 넣는다
  const packages = Array.from(new Set([PACKAGE, process.env.ANDROID_PACKAGE_NAME].filter((p): p is string => !!p)));

  return Response.json(packages.map(packageName => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  })));
}
