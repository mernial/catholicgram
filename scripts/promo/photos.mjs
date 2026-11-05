import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const W = 1080, H = 1350;
const scenes = {
  // 노을 성당
  sunset: `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a6b"/><stop offset=".45" stop-color="#c8607a"/><stop offset=".7" stop-color="#f6a65a"/><stop offset="1" stop-color="#ffd890"/></linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d0"/><stop offset=".6" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
    <rect width="1080" height="1350" fill="url(#s)"/>
    <circle cx="430" cy="860" r="230" fill="url(#sun)"/>
    <g fill="#ffffff" opacity=".18"><ellipse cx="260" cy="330" rx="210" ry="34"/><ellipse cx="800" cy="420" rx="260" ry="40"/><ellipse cx="620" cy="250" rx="160" ry="26"/></g>
    <path d="M0 1080 C 200 1010 380 1050 540 1020 C 720 990 880 1040 1080 1000 L1080 1350 L0 1350Z" fill="#2c1f45"/>
    <g fill="#1d1430"><rect x="640" y="760" width="190" height="300"/><polygon points="620,770 735,640 850,770"/><rect x="718" y="520" width="34" height="140"/><rect x="690" y="560" width="90" height="22"/><rect x="700" y="880" width="70" height="180" rx="35" fill="#ffcf7a" opacity=".55"/></g>
    <g fill="#fff" opacity=".9"><circle cx="160" cy="180" r="3"/><circle cx="930" cy="140" r="2.5"/><circle cx="520" cy="110" r="2"/></g>
  </svg>`,
  // 촛불
  candles: `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="bg" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#7a3e12"/><stop offset=".5" stop-color="#3a1a0a"/><stop offset="1" stop-color="#140904"/></radialGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ff9a2a" stop-opacity="0"/></radialGradient>
    <linearGradient id="wax" x1="0" x2="1"><stop offset="0" stop-color="#e9dcc6"/><stop offset=".5" stop-color="#fff8ec"/><stop offset="1" stop-color="#d9c8ac"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    ${[[300,760,360],[540,680,460],[780,800,320]].map(([x,y,h])=>`<circle cx="${x}" cy="${y-60}" r="190" fill="url(#glow)"/><rect x="${x-55}" y="${y}" width="110" height="${h}" rx="14" fill="url(#wax)"/><path d="M${x} ${y-110} C ${x+32} ${y-60} ${x+26} ${y-12} ${x} ${y-4} C ${x-26} ${y-12} ${x-32} ${y-60} ${x} ${y-110}Z" fill="#ffd36a"/><path d="M${x} ${y-70} C ${x+14} ${y-44} ${x+10} ${y-18} ${x} ${y-12} C ${x-10} ${y-18} ${x-14} ${y-44} ${x} ${y-70}Z" fill="#fff6d8"/><rect x="${x-3}" y="${y-14}" width="6" height="16" fill="#3a2a1a"/>`).join('')}
    <ellipse cx="540" cy="1200" rx="480" ry="60" fill="#000" opacity=".35"/>
  </svg>`,
  // 꽃밭
  flowers: `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3ff"/><stop offset=".55" stop-color="#eaf6ff"/><stop offset="1" stop-color="#d7f0c8"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#sky)"/>
    <g fill="#fff" opacity=".9"><ellipse cx="260" cy="260" rx="150" ry="46"/><ellipse cx="340" cy="230" rx="110" ry="60"/><ellipse cx="820" cy="360" rx="170" ry="50"/><ellipse cx="760" cy="330" rx="100" ry="60"/></g>
    <path d="M0 860 C 260 800 520 880 1080 800 L1080 1350 L0 1350Z" fill="#9fd88a"/>
    <path d="M0 980 C 300 920 700 1010 1080 940 L1080 1350 L0 1350Z" fill="#7cc46b"/>
    ${Array.from({length:26},(_,i)=>{const x=(i*137)%1040+20, y=900+((i*89)%380), c=['#ff8fb1','#ffd25a','#ffffff','#c9a4ff','#ff9f6b'][i%5], r=22+(i%3)*8; return `<g transform="translate(${x} ${y})"><rect x="-3" y="0" width="6" height="${60+r}" fill="#4f9a45"/>${[0,72,144,216,288].map(a=>`<ellipse cx="0" cy="-${r*0.8}" rx="${r*0.55}" ry="${r*0.9}" fill="${c}" transform="rotate(${a})"/>`).join('')}<circle r="${r*0.45}" fill="#ffb627"/></g>`}).join('')}
  </svg>`,
  // 바다와 하늘·십자가
  sea: `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb4ff"/><stop offset=".6" stop-color="#bfe6ff"/><stop offset="1" stop-color="#fff3d6"/></linearGradient><linearGradient id="se" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f8fd8"/><stop offset="1" stop-color="#1b5fa8"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#sk)"/>
    <circle cx="820" cy="300" r="90" fill="#fff8d9"/><circle cx="820" cy="300" r="140" fill="#fff8d9" opacity=".3"/>
    <g fill="#fff"><ellipse cx="250" cy="380" rx="170" ry="50"/><ellipse cx="320" cy="350" rx="110" ry="62"/></g>
    <rect y="820" width="1080" height="530" fill="url(#se)"/>
    <g stroke="#fff" stroke-width="6" opacity=".45" fill="none"><path d="M80 900 q40 -20 80 0 t80 0"/><path d="M640 960 q40 -20 80 0 t80 0"/><path d="M300 1060 q40 -20 80 0 t80 0"/><path d="M760 1150 q40 -20 80 0 t80 0"/></g>
    <path d="M0 1180 C 260 1120 520 1160 760 1230 C 900 1270 1000 1260 1080 1240 L1080 1350 L0 1350Z" fill="#f2d7a8"/>
    <g fill="#5a4030"><rect x="226" y="900" width="26" height="320"/><rect x="170" y="960" width="138" height="24"/></g>
  </svg>`,
  // 묵주
  rosary: `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4e2"/><stop offset="1" stop-color="#f3d9b6"/></linearGradient><radialGradient id="bead" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#e7c6ff"/><stop offset="1" stop-color="#8f5cc2"/></radialGradient></defs>
    <rect width="1080" height="1350" fill="url(#b)"/>
    <g fill="#d9b88c" opacity=".35"><rect x="80" y="980" width="520" height="280" rx="20" transform="rotate(-8 340 1120)"/></g>
    ${Array.from({length:40},(_,i)=>{const a=i/40*Math.PI*2; const x=540+Math.cos(a)*330, y=560+Math.sin(a)*300; return `<circle cx="${x}" cy="${y}" r="${i%10===0?24:17}" fill="url(#bead)"/>`}).join('')}
    ${Array.from({length:6},(_,i)=>`<circle cx="540" cy="${880+i*46}" r="17" fill="url(#bead)"/>`).join('')}
    <g fill="#b98a3c"><rect x="526" y="1150" width="28" height="150" rx="6"/><rect x="476" y="1190" width="128" height="26" rx="6"/></g>
  </svg>`,
  // 별밤 성당
  stars: `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1b4d"/><stop offset=".7" stop-color="#2c3f8f"/><stop offset="1" stop-color="#6a6fc0"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#n)"/>
    ${Array.from({length:70},(_,i)=>`<circle cx="${(i*197)%1080}" cy="${(i*113)%800}" r="${1.5+(i%4)}" fill="#fff" opacity="${0.4+(i%5)/8}"/>`).join('')}
    <circle cx="820" cy="220" r="70" fill="#fff6c8"/><circle cx="850" cy="200" r="66" fill="#0f1b4d"/>
    <path d="M0 1100 C 300 1040 700 1120 1080 1060 L1080 1350 L0 1350Z" fill="#141c3d"/>
    <g fill="#0b1029"><rect x="380" y="780" width="320" height="340"/><polygon points="360,790 540,640 720,790"/><rect x="522" y="470" width="36" height="190"/><rect x="488" y="520" width="104" height="26"/></g>
    <g fill="#ffd77a"><rect x="425" y="860" width="40" height="70" rx="20"/><rect x="615" y="860" width="40" height="70" rx="20"/><rect x="505" y="960" width="70" height="160" rx="35"/></g>
  </svg>`,
};
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H } });
for (const [name, svg] of Object.entries(scenes)) {
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${W}" height="${H}" `)}</body></html>`);
  await p.screenshot({ path: `/tmp/cgpromo/img/${name}.jpg`, type: 'jpeg', quality: 88 });
}
// 정사각형 버전 (콜라주·사진 효과용)
await b.close();
console.log('ok');
