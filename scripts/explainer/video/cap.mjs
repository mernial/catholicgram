import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { installMocks } from './mock.mjs';
import { makeData } from './data.mjs';
import fs from 'fs';
const BASE = 'http://localhost:3153/';
const only = process.argv.slice(2);
const b = await chromium.launch();
const NOTE_IDS = (process.env.NOTE_IDS || '').split(',').filter(Boolean);
async function shot(name, fn, { theme = 'sage', loggedOut = false, noProfile = false, tweak, card = false, tall = 0 } = {}) {
  if (only.length && !only.includes(name)) return;
  const { db, rpc, me, files } = makeData();
  if (noProfile) db.profiles = db.profiles.filter(p => p.id !== 'me');
  db.member_badges = [['hearts','me'],['talker','me'],['m_posts10','me'],['writer','monica'],['prayers','andrea']].map(([k,u],i)=>({ id:'mb'+i, user_id:u, badge_key:k, note:null, auto:true, permanent:false, created_at:new Date(Date.now()-86400e3*(i+2)).toISOString() }));
  db.badge_stamps = ['hearts','talker','m_posts10','m_days30','m_streak7','m_hearts100'].map((k,i)=>({ id:'bs'+i, user_id:'me', badge_key:k, earned_at:new Date(Date.now()-86400e3*(3+i*4)).toISOString(), auto:true, note:null }));
  if (tweak) tweak(db, rpc);
  const ctx = await b.newContext({ viewport: { width: 390, height: tall || 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul',
    userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript(([me, ids, theme, loggedOut, card]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (!loggedOut) localStorage.setItem('sb-example-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: me }));
    for (const k of ['installPromptAt', 'pushPromptAt:me']) localStorage.setItem(k, String(Date.now()));
    localStorage.setItem('installBannerDismissed', '1'); localStorage.setItem('testerPromptDismissed:me', '1'); localStorage.setItem('activeTab', 'home');
    localStorage.setItem('updateNotesHidden:me', JSON.stringify(ids)); localStorage.setItem('samsungGuideHidden:me', '1');
    localStorage.setItem('appTheme', theme); localStorage.setItem('myUserId', 'me'); localStorage.setItem('birthdayAskHidden:me', '1');
    localStorage.setItem('termsAccepted:me', new Date().toISOString());
    const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    localStorage.setItem('feastToast:me', kst); if (!card) localStorage.setItem('feastCardDismissed:me', kst);
  }, [me, NOTE_IDS, theme, loggedOut, card]);
  const report = await installMocks(ctx, { db, rpc, me, files, log: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  PAGEERROR', String(e).slice(0, 160)));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  try { await fn(p); console.log('✓', name); } catch (e) { console.log('✗', name, String(e).slice(0, 300)); await p.screenshot({ path: `shots/_fail-${name}.png` }); }
  report(); await ctx.close();
}
const snap = (p, name) => p.screenshot({ path: `shots/${name}.png` });
const nav = (p, i) => p.locator('nav button').nth(i).click();
const T = (p, t) => p.locator(`text=${t}`).first();
export { shot, snap, nav, T, b };
const steps = (await import(process.env.STEPS || './steps.mjs')).default;
await steps({ shot, snap, nav, T, fs });
await b.close();
