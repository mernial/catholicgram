// 지금 배포된 앱 버전 (앱을 다시 열었을 때 화면의 버전과 비교해 새 버전이면 새로고침)
export async function GET(request: Request) {
  void request; // 요청마다 새로 응답 (미리 만들어 두지 않음)
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
