import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', e => console.log('PAGEERROR', String(e))); p.on('console', m => console.log('console', m.text()));
await p.goto('file:///tmp/cgexp/stage.html'); await p.evaluate(() => window.ready);
const ts = process.argv.slice(2).map(Number);
for (const t of ts) { await p.evaluate(t => window.render(t), t); await p.screenshot({ path: `/tmp/cgexp/pv/${String(t).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 80 }); }
await b.close();
