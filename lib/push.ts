// 웹 푸시 공개키 (공개되어도 되는 값). 비밀키는 Vercel 환경변수 VAPID_PRIVATE_KEY 에만 둔다.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BH6tMlNvrWx7w3LIdoSiiVoFlRmnVdSKYj3UsiJEBmzo5hg0S39TOrb9QlvWcKdxshVGSxrG0jYMdbsmf6RLkiY';

export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
