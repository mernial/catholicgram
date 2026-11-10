import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file:///tmp/cgexp/stage.html'); await p.evaluate(() => window.ready);
const d = await p.evaluate(() => ({ taps: TAP.map(x => x.t), trans: SCR.filter(s => s.tr && s.tr !== 'none').map(s => s.t), fx: FX.map(f => [f.type, f.t0, f.t1]), dur: DUR, praise: PAR[29].t1 }));
fs.writeFileSync('/tmp/cgexp/sfx.json', JSON.stringify(d)); console.log(d.taps.length, d.trans.length, d.dur, d.praise);
await b.close();
