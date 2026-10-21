// 가톨릭그램 사진·영상 저장소 (Cloudflare Worker + R2)
// - GET  /<경로>  : 사진·영상 보내기 (누구나, 1년 캐시, 영상 구간 요청 지원)
// - PUT  /<경로>  : 올리기  — 앱 서버(/api/media/token)가 만든 1회용 허가증이 있어야 함
// - DELETE /<경로>: 지우기 — 앱 서버가 만든 허가증이 있어야 함
// 설정 (Cloudflare 대시보드 → Workers → 이 Worker → 설정):
//   - R2 버킷 연결(Binding): 변수 이름 MEDIA → 버킷 catholicgram-media
//   - 비밀 변수(Secret): UPLOAD_SECRET → Vercel 의 R2_UPLOAD_SECRET 과 같은 값
const MAX_BYTES = 60 * 1024 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag',
  'Access-Control-Max-Age': '86400',
};

const enc = new TextEncoder();
async function sign(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
  return Array.from(mac, b => b.toString(16).padStart(2, '0')).join('');
}
function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (method === 'GET' || method === 'HEAD') {
      if (!key) return json({ ok: true, service: 'catholicgram-media' });
      const range = request.headers.get('range');
      const obj = await env.MEDIA.get(key, range ? { range: request.headers } : undefined);
      if (!obj) return new Response('not found', { status: 404, headers: CORS });
      const headers = new Headers(CORS);
      obj.writeHttpMetadata(headers);
      headers.set('ETag', obj.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Accept-Ranges', 'bytes');
      if (range && obj.range) {
        const offset = obj.range.offset ?? 0;
        const length = obj.range.length ?? obj.size - offset;
        headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
        headers.set('Content-Length', String(length));
        return new Response(method === 'HEAD' ? null : obj.body, { status: 206, headers });
      }
      headers.set('Content-Length', String(obj.size));
      return new Response(method === 'HEAD' ? null : obj.body, { headers });
    }

    if (method === 'PUT' || method === 'DELETE') {
      if (!env.UPLOAD_SECRET) return json({ error: 'UPLOAD_SECRET 이 설정되지 않았어요' }, 500);
      const [exp, sig] = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.');
      if (!key || !exp || !sig || Date.now() / 1000 > Number(exp)) return json({ error: '허가증이 없거나 만료됐어요' }, 401);
      if (!same(await sign(env.UPLOAD_SECRET, `${method}\n${key}\n${exp}`), sig)) return json({ error: '허가증이 맞지 않아요' }, 403);
      if (method === 'DELETE') { await env.MEDIA.delete(key); return json({ ok: true }); }
      const size = Number(request.headers.get('content-length') || 0);
      if (size > MAX_BYTES) return json({ error: '파일이 너무 커요' }, 413);
      await env.MEDIA.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable' },
      });
      return json({ ok: true, key });
    }
    return json({ error: 'method not allowed' }, 405);
  },
};
