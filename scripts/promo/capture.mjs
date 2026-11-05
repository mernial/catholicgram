import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { installMocks } from './mock.mjs';
import { makeData } from './data.mjs';
const BASE = 'http://localhost:3153/';
const only = process.argv.slice(2);
const b = await chromium.launch();
const NOTE_IDS = (process.env.NOTE_IDS || '').split(',').filter(Boolean);
async function shot(name, fn, { theme = 'sage', viewport = { width: 390, height: 844 }, card = false } = {}) {
  if (only.length && !only.includes(name)) return;
  const { db, rpc, me, files } = makeData();
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul',
    userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript(([me, ids, theme, card]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('sb-example-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: me }));
    for (const k of ['installPromptAt', 'pushPromptAt:me']) localStorage.setItem(k, String(Date.now()));
    localStorage.setItem('installBannerDismissed', '1'); localStorage.setItem('testerPromptDismissed:me', '1'); localStorage.setItem('activeTab', 'home');
    localStorage.setItem('updateNotesHidden:me', JSON.stringify(ids)); localStorage.setItem('samsungGuideHidden:me', '1');
    localStorage.setItem('appTheme', theme); localStorage.setItem('myUserId', 'me');
    localStorage.setItem('birthdayAskHidden:me', '1');
    const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    localStorage.setItem('feastToast:me', kst);
    if (!card) localStorage.setItem('feastCardDismissed:me', kst);
  }, [me, NOTE_IDS, theme, card]);
  const report = await installMocks(ctx, { db, rpc, me, files, log: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  PAGEERROR', String(e).slice(0, 160)));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  try { await fn(p); console.log('✓', name); } catch (e) { console.log('✗', name, String(e).slice(0, 300)); await p.screenshot({ path: `/tmp/cgpromo/shots/_fail-${name}.png` }); }
  report();
  await ctx.close();
}
const expand = async p => { for (let k = 0; k < 6; k++) { const m = p.locator('main button:has-text("더 보기"), main span:has-text("더 보기")').first(); if (!(await m.count())) break; await m.click().catch(() => {}); await p.waitForTimeout(150); } };
const snap = (p, name) => p.screenshot({ path: `/tmp/cgpromo/shots/${name}.png` });
const nav = (p, i) => p.locator('nav button').nth(i).click();
import fs from 'fs';
async function boxes(p, name, sels) { const out = {}; for (const [k, sel] of Object.entries(sels)) { const b = await p.locator(sel).first().boundingBox().catch(() => null); out[k] = b; } fs.writeFileSync(`/tmp/cgpromo/shots/${name}.json`, JSON.stringify(out)); }

await shot('home', async p => { await snap(p, 'home'); });
await shot('home-pray', async p => {
  await p.locator('button[aria-label^="기도 "]').first().click(); await p.waitForTimeout(500);
  await p.locator('button[aria-label^="공감 "]').first().click(); await p.waitForTimeout(700);
  await snap(p, 'home-pray');
});
await shot('react', async p => {
  await expand(p);
  const pray = p.locator('button[aria-label^="기도 "]').first();
  await pray.scrollIntoViewIfNeeded(); await p.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollBy(0, 120); }); await p.waitForTimeout(500);
  await boxes(p, 'react', { pray: 'button[aria-label^="기도 "]', like: 'button[aria-label^="공감 "]' });
  await snap(p, 'react-before');
  await pray.click(); await p.waitForTimeout(600); await snap(p, 'react-pray');
  await p.locator('button[aria-label^="공감 "]').first().click(); await p.waitForTimeout(700); await snap(p, 'react-both');
});
await shot('home-tall', async p => { await expand(p); await p.evaluate(() => document.querySelector('main')?.scrollTo(0, 0)); await p.waitForTimeout(300); await snap(p, 'home-tall'); }, { viewport: { width: 390, height: 2400 } });
for (const t of ['ivory', 'navy', 'burgundy', 'charcoal']) await shot('theme-' + t, async p => { await snap(p, 'theme-' + t); }, { theme: t });
await shot('me', async p => { await nav(p, 4); await p.waitForTimeout(1500); await boxes(p, 'me', { music: '[data-profile-music]', missa: 'text=매일미사', bible: 'text=가톨릭성경', head: 'text=클라라' }); await snap(p, 'me'); });
await shot('me-list', async p => { await nav(p, 4); await p.waitForTimeout(1200); await p.locator('button[aria-label^="게시물 "]').click(); await p.waitForTimeout(800); await snap(p, 'me-list'); });
await shot('reels', async p => { await nav(p, 1); await p.waitForTimeout(2000); await snap(p, 'reels'); });
await shot('dm', async p => {
  await nav(p, 2); await p.waitForTimeout(1200);
  await p.locator('text=모니카').first().click(); await p.waitForTimeout(2000);
  await boxes(p, 'dm', { heart: 'text=❤️', amen: 'img[alt*="좋은 아침"]', last: 'text=오늘도 좋은 하루 보내세요' });
  await snap(p, 'dm');
});
await shot('lounge', async p => {
  p.on('load', () => {});
  await nav(p, 2); await p.waitForTimeout(1000);
  await p.locator('[role=tab]', { hasText: '단체' }).click(); await p.waitForTimeout(600);
  await p.locator('text=모두의 사랑방').first().click(); await p.waitForTimeout(2500);
  await p.evaluate(() => { for (const el of document.querySelectorAll('span,b,p')) if (el.childNodes.length === 1 && /지금 0명/.test(el.textContent)) el.textContent = el.textContent.replace('지금 0명', '지금 12명'); });
  await snap(p, 'lounge');
});
await shot('anon', async p => { await p.locator('button[aria-label^="고민상담"]').click(); await p.waitForTimeout(1500); await boxes(p, 'anon', { pray: 'button:has-text("기도 4")' }); await snap(p, 'anon'); });
await shot('alerts', async p => { await p.locator('button[aria-label="알림"]').click(); await p.waitForTimeout(1500); await snap(p, 'alerts'); });

await shot('celebrate', async p => { await boxes(p, 'celebrate', { cheer: 'button:has-text("축하하기")', stories: 'text=내 스토리' }); await snap(p, 'celebrate'); }, { card: true });
const PH = ['sunset', 'flowers', 'sea', 'rosary'].map(n => `/tmp/cgpromo/img/${n}.jpg`);
async function compose(p) {
  await p.locator('button[aria-label="새 글 만들기"]').click(); await p.waitForTimeout(700);
  await p.setInputFiles('#photo-upload', PH); await p.waitForTimeout(1500);
}
await shot('compose-pick', async p => { await compose(p); await boxes(p, 'compose-pick', { effect: 'button[aria-label^="사진 효과"]', collage: 'button[aria-label^="콜라주 만들기"]' }); await snap(p, 'compose-pick'); });
await shot('effect', async p => {
  await compose(p);
  await p.locator('button[aria-label^="사진 효과"]').first().click(); await p.waitForTimeout(1500);
  await p.locator('button', { hasText: '이모티콘' }).last().click(); await p.waitForTimeout(1200);
  await snap(p, 'effect-panel');
  const cell = p.locator('[role=region][aria-label="이모티콘"] button[aria-label]').filter({ hasText: '' }).nth(8);
  const cb = await cell.boundingBox().catch(() => null);
  await cell.click().catch(() => {});
  await p.waitForTimeout(900);
  await snap(p, 'effect-sticker');
  fs.writeFileSync('/tmp/cgpromo/shots/effect.json', JSON.stringify({ cell: cb }));
  await p.locator('button', { hasText: '모자이크' }).last().click(); await p.waitForTimeout(700);
  await p.locator('button', { hasText: '동그라미 넣기' }).click(); await p.waitForTimeout(900);
  await snap(p, 'effect-mosaic');
});
await shot('collage', async p => { await compose(p); await p.locator('button[aria-label^="콜라주 만들기"]').first().click(); await p.waitForTimeout(2000); await snap(p, 'collage'); });
await shot('music', async p => {
  await compose(p); await p.locator('button', { hasText: '다음' }).first().click(); await p.waitForTimeout(800);
  await p.locator('textarea').first().fill('오늘 새벽 미사 다녀왔어요 ☀️ #감사'); await p.waitForTimeout(300);
  await snap(p, 'write');
  await p.locator('button', { hasText: '음악 추가' }).click(); await p.waitForTimeout(1500);
  await snap(p, 'music');
});
await shot('comments', async p => {
  await p.locator('text=댓글 5개 모두 보기').first().scrollIntoViewIfNeeded(); await p.locator('text=댓글 5개 모두 보기').first().click(); await p.waitForTimeout(1800);
  await snap(p, 'comments');
});
await shot('intentions', async p => { await p.locator('text=오늘의 첫 기도지향').first().click().catch(() => p.locator('text=오늘의 기도').first().click()); await p.waitForTimeout(1500); await boxes(p, 'intentions', { row: 'text=수험생 아들을 위하여', count: 'text=24' }); await snap(p, 'intentions'); });
await shot('letters', async p => { await p.locator('button[aria-label="사연 보내기"]').click(); await p.waitForTimeout(1500); await snap(p, 'letters'); });
await shot('explore', async p => { await nav(p, 3); await p.waitForTimeout(1500); await snap(p, 'explore'); });
await b.close();
