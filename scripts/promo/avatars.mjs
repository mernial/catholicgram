// 예시 교우 프로필 사진 (일러스트 일부를 동그랗게 쓰도록 정사각형으로 자름 + 이모티콘 캐릭터)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400, height: 400 } });
const list = {
  joseph: { img: '/tmp/cgpromo/img/candles.jpg', pos: '50% 40%' },
  maria: { img: '/tmp/cgpromo/img/flowers.jpg', pos: '45% 80%' },
  peter: { img: '/tmp/cgpromo/img/sea.jpg', pos: '70% 30%' },
  lucia: { sticker: '/home/user/catholicgram/public/stickers/sheep/01.webp', bg: '#ffe7ef' },
  michael: { img: '/tmp/cgpromo/img/stars.jpg', pos: '50% 60%' },
  cecilia: { sticker: '/home/user/catholicgram/public/stickers/cloud/01.webp', bg: '#e6f3ff' },
  anna: { sticker: '/home/user/catholicgram/public/stickers/bell/01.webp', bg: '#fff3d1' },
  stephano: { img: '/tmp/cgpromo/img/sunset.jpg', pos: '65% 55%' },
};
for (const [k, v] of Object.entries(list)) {
  const src = f => 'data:' + (f.endsWith('.webp') ? 'image/webp' : 'image/jpeg') + ';base64,' + fs.readFileSync(f).toString('base64');
  const html = v.img
    ? `<div style="width:400px;height:400px;background:url(${src(v.img)}) ${v.pos}/250% no-repeat"></div>`
    : `<div style="width:400px;height:400px;background:${v.bg};display:flex;align-items:center;justify-content:center"><img src="${src(v.sticker)}" style="width:330px;height:330px;object-fit:contain"></div>`;
  await p.setContent(`<html><body style="margin:0">${html}</body></html>`);
  await p.waitForTimeout(100);
  await p.screenshot({ path: `/tmp/cgpromo/av/${k}.jpg`, type: 'jpeg', quality: 90 });
}
await b.close(); console.log('avatars ok');
