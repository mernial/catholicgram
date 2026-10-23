// 가톨릭그램 사진·영상 저장소 (Cloudflare Worker + R2)
// - GET  /<경로>  : 사진·영상 보내기 (누구나, 1년 캐시, 영상 구간 요청 지원)
// - PUT  /<경로>  : 올리기  — 앱 서버(/api/media/token)가 만든 1회용 허가증이 있어야 함
// - DELETE /<경로>: 지우기 — 앱 서버가 만든 허가증이 있어야 함
// - GET /__usage  : 저장소 사용량(종류별 크기·개수) — 앱 서버가 만든 관리 허가증이 있어야 함 (관리자 화면 '데이터 사용량')
// 설정 (Cloudflare 대시보드 → Workers → 이 Worker → 설정):
//   - R2 버킷 연결(Binding): 변수 이름 MEDIA → 버킷 catholicgram-media
//   - 비밀 변수(Secret): UPLOAD_SECRET → Vercel 의 R2_UPLOAD_SECRET 과 같은 값
const MAX_BYTES = 60 * 1024 * 1024;
// 파일 형식은 올리는 사람이 보낸 값이 아니라 확장자로 정한다 (html·svg·js 같은 파일을 올려 이 주소로 퍼뜨리지 못하게)
const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
};
const typeOf = (key) => TYPES[(key.split('.').pop() || '').toLowerCase()];
// 보낼 때 함께 붙이는 보안 머리글: 형식 추측 금지, 혹시 문서로 열려도 스크립트 실행 금지
const SAFE = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'cross-origin',
};
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

    // 관리자 화면용 사용량: 모든 파일 크기를 종류(경로 첫 부분: posts·videos·dm …)별로 더한다
    if (method === 'GET' && key === '__usage') {
      if (!env.UPLOAD_SECRET) return json({ error: 'UPLOAD_SECRET 이 설정되지 않았어요' }, 500);
      const [exp, sig] = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.');
      if (!exp || !sig || Date.now() / 1000 > Number(exp)) return json({ error: '허가증이 없거나 만료됐어요' }, 401);
      if (!same(await sign(env.UPLOAD_SECRET, `USAGE\n__usage\n${exp}`), sig)) return json({ error: '허가증이 맞지 않아요' }, 403);
      const byKind = {};
      let bytes = 0, files = 0, cursor;
      do {
        const page = await env.MEDIA.list({ cursor, limit: 1000 });
        for (const o of page.objects) {
          const kind = o.key.split('/')[0] || '기타';
          byKind[kind] = byKind[kind] || { bytes: 0, files: 0 };
          byKind[kind].bytes += o.size; byKind[kind].files += 1;
          bytes += o.size; files += 1;
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return json({ bytes, files, byKind });
    }

    if (method === 'GET' || method === 'HEAD') {
      if (!key) return json({ ok: true, service: 'catholicgram-media' });
      const range = request.headers.get('range');
      const obj = await env.MEDIA.get(key, range ? { range: request.headers } : undefined);
      if (!obj) return new Response('not found', { status: 404, headers: CORS });
      const headers = new Headers(CORS);
      obj.writeHttpMetadata(headers);
      Object.entries(SAFE).forEach(([k, v]) => headers.set(k, v));
      const type = typeOf(key);
      if (type) headers.set('Content-Type', type);
      else { headers.set('Content-Type', 'application/octet-stream'); headers.set('Content-Disposition', 'attachment'); }
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
      const type = typeOf(key);
      if (!type) return json({ error: '올릴 수 없는 파일 형식이에요' }, 415);
      const size = Number(request.headers.get('content-length') || 0);
      if (!size) return json({ error: '파일 크기를 알 수 없어요' }, 411);
      if (size > MAX_BYTES) return json({ error: '파일이 너무 커요' }, 413);
      // 한 번 올린 파일은 같은 허가증으로 바꿔치기하지 못하게
      if (await env.MEDIA.head(key)) return json({ error: '이미 올린 파일이에요' }, 409);
      await env.MEDIA.put(key, request.body, {
        httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
      });
      return json({ ok: true, key });
    }
    return json({ error: 'method not allowed' }, 405);
  },
};
