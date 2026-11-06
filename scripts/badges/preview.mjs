import ts from '/home/user/catholicgram/node_modules/typescript/lib/typescript.js';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/user/catholicgram/package.json');
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
const Module = require('module');
function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths('/home/user/catholicgram');
  const origRequire = m.require.bind(m);
  m.require = p => { if (p.startsWith('@/')) return load('/home/user/catholicgram/' + p.slice(2) + (p.endsWith('.tsx') || p.endsWith('.ts') ? '' : (fs.existsSync('/home/user/catholicgram/' + p.slice(2) + '.tsx') ? '.tsx' : '.ts'))); return origRequire(p); };
  m._compile(out, file); return m.exports;
}
const { BadgeIcon, Medal, CLERGY_ART } = load('/home/user/catholicgram/components/BadgeIcon.tsx');
const { MEMBER_BADGES } = load('/home/user/catholicgram/lib/badges.ts');
const { BADGES } = load('/home/user/catholicgram/components/RoleBadge.tsx');
const h = React.createElement;
const rows = [];
for (const size of [96, 40, 18]) {
  rows.push(h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 } },
    MEMBER_BADGES.map(b => h('div', { key: b.key, style: { textAlign: 'center', width: size >= 96 ? 110 : 'auto' } }, h(BadgeIcon, { badge: b, size }), size >= 96 ? h('div', { style: { fontSize: 13, marginTop: 4 } }, b.label) : null))));
}
for (const size of [96, 40, 18]) {
  rows.push(h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 } },
    Object.keys(CLERGY_ART).map(k => h('div', { key: k, style: { textAlign: 'center', width: size >= 96 ? 110 : 'auto' } }, h(Medal, { colors: CLERGY_ART[k].colors, rim: CLERGY_ART[k].rim, size }, CLERGY_ART[k].emblem), size >= 96 ? h('div', { style: { fontSize: 13, marginTop: 4 } }, BADGES[k].label) : null))));
}
const html = `<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;background:#faf7f1;padding:20px;width:1400px">${renderToStaticMarkup(h('div', null, rows))}</body>`;
fs.writeFileSync('/tmp/cgbadge/preview.html', html);
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('file:///tmp/cgbadge/preview.html'); await p.screenshot({ path: '/tmp/cgbadge/preview.png', fullPage: true }); await b.close(); console.log('ok');
