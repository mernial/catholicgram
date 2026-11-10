import fs from 'fs';
const PH = ['sunset', 'flowers', 'sea', 'rosary'].map(n => `/tmp/cgpromo/img/${n}.jpg`);
async function compose(p) { await p.locator('button[aria-label="새 글 만들기"]').click(); await p.waitForTimeout(700); await p.setInputFiles('#photo-upload', PH); await p.waitForTimeout(1500); }
const expand = async p => { for (let k = 0; k < 6; k++) { const m = p.locator('main button:has-text("더 보기"), main span:has-text("더 보기")').first(); if (!(await m.count())) break; await m.click().catch(() => {}); await p.waitForTimeout(150); } };
async function boxes(p, name, sels) { const out = {}; for (const [k, sel] of Object.entries(sels)) out[k] = await p.locator(sel).first().boundingBox().catch(() => null); fs.writeFileSync(`shots/${name}.json`, JSON.stringify(out)); }
async function openDm(p, nav) { await nav(p, 2); await p.waitForTimeout(1200); await p.locator('text=모니카').first().click(); await p.waitForTimeout(2000); }
export default async ({ shot, snap, nav, T }) => {
  await shot('login', async p => { await T(p, '로그인').click(); await p.waitForTimeout(1200); await snap(p, 'login'); }, { loggedOut: true });
  await shot('welcome', async p => {
    await snap(p, 'welcome');
    const inp = p.locator('input:not([type=file])'); await inp.nth(0).fill('클라라'); await inp.nth(1).fill('clara'); await inp.nth(2).fill('김지영 클라라'); await p.waitForTimeout(400);
    await snap(p, 'welcome-filled');
    const sel = p.locator('select'); const n = await sel.count();
    await sel.nth(n - 2).selectOption({ index: 8 }).catch(() => {}); await sel.nth(n - 1).selectOption({ index: 11 }).catch(() => {});
    await p.locator('select').nth(n - 2).scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    await snap(p, 'welcome-feast');
  }, { noProfile: true });
  await shot('home', async p => { await snap(p, 'home'); await boxes(p, 'home', { plus: 'button[aria-label="새 글 만들기"]', stories: 'text=내 스토리', band: 'text=오늘의 기도', pray: 'button[aria-label^="기도 "]', like: 'button[aria-label^="공감 "]', cmt: 'button[aria-label^="댓글 "]' }); });
  await shot('home-tall', async p => { await expand(p); await p.evaluate(() => document.querySelector('main')?.scrollTo(0, 0)); await p.waitForTimeout(300); await snap(p, 'home-tall'); }, { tall: 2600 });
  await shot('react', async p => {
    await expand(p);
    const pray = p.locator('button[aria-label^="기도 "]').first();
    await pray.scrollIntoViewIfNeeded(); await p.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollBy(0, 120); }); await p.waitForTimeout(500);
    await boxes(p, 'react', { pray: 'button[aria-label^="기도 "]', like: 'button[aria-label^="공감 "]', cmt: 'button[aria-label^="댓글 "]' });
    await snap(p, 'react-before'); await pray.click(); await p.waitForTimeout(600); await snap(p, 'react-pray');
    await p.locator('button[aria-label^="공감 "]').first().click(); await p.waitForTimeout(700); await snap(p, 'react-both');
  });
  await shot('comments', async p => { await p.locator('text=댓글 5개 모두 보기').first().scrollIntoViewIfNeeded(); await p.locator('text=댓글 5개 모두 보기').first().click(); await p.waitForTimeout(1800); await snap(p, 'comments'); });
  await shot('story', async p => { await p.locator('text=모니카').first().click(); await p.waitForTimeout(1500); await snap(p, 'story'); });
  for (const t of ['ivory', 'navy', 'burgundy', 'charcoal']) await shot('theme-' + t, async p => { await snap(p, 'theme-' + t); }, { theme: t });
  await shot('compose-pick', async p => { await compose(p); await boxes(p, 'compose-pick', { effect: 'button[aria-label^="사진 효과"]', collage: 'button[aria-label^="콜라주 만들기"]' }); await snap(p, 'compose-pick'); });
  await shot('compose-blank', async p => { await p.locator('button[aria-label="새 글 만들기"]').click(); await p.waitForTimeout(900); await snap(p, 'compose-blank'); });
  await shot('effect', async p => {
    await compose(p); await p.locator('button[aria-label^="사진 효과"]').first().click(); await p.waitForTimeout(1500);
    await snap(p, 'effect-crop');
    await p.locator('button', { hasText: '이모티콘' }).last().click(); await p.waitForTimeout(1200); await snap(p, 'effect-panel');
    const cell = p.locator('[role=region][aria-label="이모티콘"] button[aria-label]').nth(8); await cell.click().catch(() => {}); await p.waitForTimeout(900); await snap(p, 'effect-sticker');
    await p.locator('button', { hasText: '모자이크' }).last().click(); await p.waitForTimeout(700); await p.locator('button', { hasText: '동그라미 넣기' }).click(); await p.waitForTimeout(900); await snap(p, 'effect-mosaic');
  });
  await shot('collage', async p => { await compose(p); await p.locator('button[aria-label^="콜라주 만들기"]').first().click(); await p.waitForTimeout(2000); await snap(p, 'collage'); });
  await shot('music', async p => {
    await compose(p); await p.locator('button', { hasText: '다음' }).first().click(); await p.waitForTimeout(800);
    await p.locator('textarea').first().fill('오늘 새벽 미사 다녀왔어요 ☀️ #감사'); await p.waitForTimeout(300); await snap(p, 'write');
    await p.locator('main, body').first().evaluate(() => { const s = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== 'visible' && e.closest('[role=dialog], .fixed')); if (s) s.scrollTop = s.scrollHeight; }); await p.waitForTimeout(500); await snap(p, 'write-bottom');
    await p.locator('button', { hasText: '음악 추가' }).click(); await p.waitForTimeout(1500); await snap(p, 'music');
  });
  await shot('reels', async p => { await nav(p, 1); await p.waitForTimeout(2000); await snap(p, 'reels'); });
  await shot('intentions', async p => { await p.locator('button[aria-label="오늘의 기도지향 모아 보기"]').click().catch(() => T(p, '오늘의 기도').click()); await p.waitForTimeout(1500); await snap(p, 'intentions'); });
  await shot('celebrate', async p => { await snap(p, 'celebrate'); }, { card: true });
  await shot('alerts', async p => { await p.locator('button[aria-label="알림"]').click(); await p.waitForTimeout(1500); await snap(p, 'alerts'); });
  await shot('dm', async p => { await openDm(p, nav); await snap(p, 'dm'); await boxes(p, 'dm', { send: 'button[aria-label^="보내기"]', input: '[aria-label="메시지 입력"]', emoji: 'button[aria-label="이모티콘 넣기"]' });
    await p.locator('button[aria-label="이모티콘 넣기"]').click().catch(() => {}); await p.waitForTimeout(1200); await snap(p, 'dm-stickers');
  });
  await shot('dm-quiet', async p => { await openDm(p, nav); await p.locator('[aria-label="메시지 입력"]').fill('늦은 밤이라 조용히 보내요 🌙'); await p.waitForTimeout(300);
    const s = await p.locator('button[aria-label^="보내기"]').boundingBox(); await p.mouse.move(s.x + s.width / 2, s.y + s.height / 2); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up(); await p.waitForTimeout(500); await snap(p, 'dm-quiet'); });
  await shot('msglist', async p => { await nav(p, 2); await p.waitForTimeout(1500); await snap(p, 'msglist'); await p.locator('[role=tab]', { hasText: '단체' }).click(); await p.waitForTimeout(800); await snap(p, 'msglist-group'); await T(p, '단체 채팅방 만들기').click(); await p.waitForTimeout(1200); await snap(p, 'newgroup');
    const rows = p.locator('[role=dialog] button:has(img)'); for (let i = 0; i < 3; i++) await rows.nth(i).click().catch(() => {}); await p.waitForTimeout(500); await snap(p, 'newgroup-picked'); });
  await shot('lounge', async p => { await nav(p, 2); await p.waitForTimeout(1000); await p.locator('[role=tab]', { hasText: '단체' }).click(); await p.waitForTimeout(600); await p.locator('text=모두의 사랑방').first().click(); await p.waitForTimeout(2500);
    await p.evaluate(() => { for (const el of document.querySelectorAll('span,b,p')) if (el.childNodes.length === 1 && /지금 0명/.test(el.textContent)) el.textContent = el.textContent.replace('지금 0명', '지금 12명'); }); await snap(p, 'lounge'); });
  await shot('anon', async p => { await p.locator('button[aria-label^="고민상담"]').click(); await p.waitForTimeout(1500); await snap(p, 'anon'); });
  await shot('letters', async p => { await p.locator('button[aria-label="사연 보내기"]').click(); await p.waitForTimeout(1500); await snap(p, 'letters'); });
  await shot('me', async p => { await nav(p, 4); await p.waitForTimeout(1800); await snap(p, 'me'); await boxes(p, 'me', { music: '[data-profile-music]', missa: 'text=매일미사', badges: 'text=도장' });
    await p.evaluate(() => document.querySelector('main')?.scrollBy(0, 420)); await p.waitForTimeout(600); await snap(p, 'me-scroll'); });
  await shot('stamps', async p => { await nav(p, 4); await p.waitForTimeout(1800); await p.locator('button', { hasText: '도장' }).first().click(); await p.waitForTimeout(1500); await snap(p, 'stamps'); });
  await shot('explore', async p => { await nav(p, 3); await p.waitForTimeout(1500); await snap(p, 'explore'); const s = p.locator('input[type=search]').first(); await s.fill('성서 모임'); await p.waitForTimeout(1800); await snap(p, 'explore-search'); });
  await shot('settings', async p => { await nav(p, 4); await p.waitForTimeout(1200); await T(p, '설정').click(); await p.waitForTimeout(1200); await snap(p, 'settings');
    await p.locator('button', { hasText: '아주 크게' }).first().click(); await p.waitForTimeout(800); await snap(p, 'settings-big'); });
  await shot('font-big', async p => { await p.evaluate(() => { localStorage.setItem('fontScale', 'xl'); }); await snap(p, 'font-normal'); });
  await shot('sound', async p => { await p.locator('button[aria-label="알림"]').click(); await p.waitForTimeout(1200); await p.locator('button[aria-label="알림 소리 고르기"]').click(); await p.waitForTimeout(1500); await snap(p, 'sound'); });
  await shot('postmenu', async p => { await p.locator('main button[aria-label^="더보기"]').first().click(); await p.waitForTimeout(1200); await snap(p, 'postmenu'); });
  await shot('profilecard', async p => { await p.locator('button[aria-label="모니카님 프로필"]').first().click(); await p.waitForTimeout(1500); await snap(p, 'profilecard'); });
  await shot('shareapp', async p => { await nav(p, 4); await p.waitForTimeout(1500); await T(p, '친구 초대').click(); await p.waitForTimeout(1500); await snap(p, 'shareapp'); });
};
