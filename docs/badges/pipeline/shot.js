const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const jobs=JSON.parse(process.argv[2]);
for(const j of jobs){const p=await b.newPage({viewport:{width:j.size||512,height:j.size||512}});
p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CON',m.text())});
await p.goto('http://localhost:8765/'+(j.page||'scene.html')+'?'+j.q);await p.waitForFunction(()=>window.ready,null,{timeout:60000});
fs.mkdirSync(j.out,{recursive:true});
for(const i of j.frames){const d=await p.evaluate(i=>window.renderFrame(i),i);fs.writeFileSync(`${j.out}/${String(i).padStart(3,'0')}.png`,Buffer.from(d.split(',')[1],'base64'));}
await p.close();}
await b.close();})();
