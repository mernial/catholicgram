import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const times = process.argv.slice(2).map(Number);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('console', m => console.log('console:', m.text()));
p.on('pageerror', e => console.log('PAGEERROR', String(e)));
await p.goto('file:///tmp/cgpromo/stage.html');
await p.evaluate(() => window.ready);
for (const t of times) { await p.evaluate(t => window.render(t), t); await p.screenshot({ path: `/tmp/cgpromo/prev-${t}.jpg`, type: 'jpeg', quality: 80 }); }
await b.close();
