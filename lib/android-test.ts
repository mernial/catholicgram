// 구글 플레이 비공개 테스트 (안드로이드 앱) — 테스터 모집·안내에 쓰는 값
export const ANDROID_PACKAGE = 'com.catholicgram.android';
// 테스터 목록에 들어간 구글 계정으로 열면 '테스터 되기'를 누를 수 있는 주소 (Play Console → 비공개 테스트 → 테스터 → '웹에서 참여')
export const TESTER_JOIN_URL = `https://play.google.com/apps/testing/${ANDROID_PACKAGE}`;
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
// 정식 출시를 신청하려면 이만큼의 테스터가 14일 동안 참여해야 한다
export const TESTER_GOAL = 12;

export type TesterStatus = 'none' | 'requested' | 'added';

export const isAndroidDevice = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
export const isValidEmail = (s: string) => s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
