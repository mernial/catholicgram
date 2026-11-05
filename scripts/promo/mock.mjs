import fs from 'fs';
// 아주 작은 PostgREST 흉내: 표 이름 → 줄들, 쿼리 거르기·정렬·개수
const splitTop = s => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);
function test(row, col, opv) {
  let neg = false;
  if (opv.startsWith('not.')) { neg = true; opv = opv.slice(4); }
  const i = opv.indexOf('.'); const op = opv.slice(0, i); let v = opv.slice(i + 1);
  const x = row[col];
  let r;
  switch (op) {
    case 'eq': r = String(x) === v; break;
    case 'neq': r = String(x) !== v; break;
    case 'gt': r = x != null && x > v; break;
    case 'gte': r = x != null && x >= v; break;
    case 'lt': r = x != null && x < v; break;
    case 'lte': r = x != null && x <= v; break;
    case 'in': { const items = v.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')); r = items.includes(String(x)); break; }
    case 'is': r = v === 'null' ? x == null : v === 'true' ? x === true : v === 'false' ? x === false : false; break;
    case 'like': case 'ilike': { const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : ''); r = re.test(String(x ?? '')); break; }
    case 'cs': r = true; break;
    default: r = true;
  }
  return neg ? !r : r;
}
function orTest(row, expr) {
  return splitTop(expr.replace(/^\(|\)$/g, '')).some(part => {
    if (part.startsWith('and(')) return splitTop(part.slice(4, -1)).every(p2 => { const j = p2.indexOf('.'); return test(row, p2.slice(0, j), p2.slice(j + 1)); });
    const j = part.indexOf('.'); return test(row, part.slice(0, j), part.slice(j + 1));
  });
}
export async function installMocks(ctx, { db, rpc = {}, me, log = false, files = {} }) {
  const unknown = new Set();
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me) }));
  await ctx.route('**/realtime/**', r => r.abort());
  await ctx.route('**/storage/v1/object/public/**', r => {
    const u = new URL(r.request().url()); const name = u.pathname.split('/').pop();
    const f = files[name];
    if (!f) { unknown.add('file ' + name); return r.fulfill({ status: 404, body: '' }); }
    const type = f.endsWith('.webm') ? 'video/webm' : f.endsWith('.png') ? 'image/png' : f.endsWith('.mp3') ? 'audio/mpeg' : 'image/jpeg';
    r.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(); const u = new URL(req.url());
    const path = u.pathname.replace(/^.*\/rest\/v1\//, '');
    const method = req.method();
    if (path.startsWith('rpc/')) {
      const name = path.slice(4);
      const h = rpc[name];
      if (!h) { unknown.add('rpc ' + name); return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'not found' }) }); }
      let args = {}; try { args = req.postDataJSON() || {}; } catch { /* */ }
      const out = typeof h === 'function' ? h(args) : h;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    }
    const table = path.split('?')[0];
    if (!(table in db)) unknown.add('table ' + table + ' ' + method);
    let rows = (db[table] || []).slice();
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE' || method === 'PUT') {
      let body = null; try { body = req.postDataJSON(); } catch { /* */ }
      if (method === 'POST' && body) { const list = (Array.isArray(body) ? body : [body]).map((x, i) => ({ id: 'new' + Date.now() + i, created_at: new Date().toISOString(), ...x })); (db[table] ||= []).push(...list); if (table === 'post_reactions') for (const x of list) { const po = (db.posts || []).find(q => q.id === x.post_id); if (po) po[x.reaction_type === 'pray' ? 'pray_count' : 'like_count']++; } return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(list) }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
      if (k === 'or') { rows = rows.filter(row => orTest(row, v)); continue; }
      if (k === 'and') { rows = rows.filter(row => splitTop(v.replace(/^\(|\)$/g, '')).every(part => { const j = part.indexOf('.'); return test(row, part.slice(0, j), part.slice(j + 1)); })); continue; }
      rows = rows.filter(row => test(row, k, v));
    }
    const order = u.searchParams.get('order');
    if (order) {
      const keys = order.split(',').map(s => { const [c, d] = s.split('.'); return [c, d === 'desc' ? -1 : 1]; });
      rows.sort((a, b) => { for (const [c, d] of keys) { const x = cmp(a[c], b[c]) * d; if (x) return x; } return 0; });
    }
    const total = rows.length;
    const off = +(u.searchParams.get('offset') || 0); const lim = u.searchParams.get('limit');
    rows = rows.slice(off, lim ? off + +lim : undefined);
    const headers = { 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*', 'content-range': `${rows.length ? off : '*'}-${rows.length ? off + rows.length - 1 : ''}/${total}`.replace('*-/', '*/') };
    if (method === 'HEAD') return r.fulfill({ status: 200, headers, body: '' });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(single ? rows[0] || null : rows) });
  });
  await ctx.route('**/api/**', r => r.request().url().includes('/api/version') ? r.continue() : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  return () => (log && unknown.size ? console.log('  unhandled:', [...unknown].join(' | ')) : null);
}
