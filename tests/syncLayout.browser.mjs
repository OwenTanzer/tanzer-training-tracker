// Run from the repo root with Playwright Chromium/WebKit available.
// Synthetic transport only. Sample real DOM geometry across pending/upload/ack.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
const root=process.cwd();
const vite=await createServer({root,server:{host:'127.0.0.1',port:0,hmr:false,ws:false},define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify('https://layout-test.invalid')}});
const {emptyDatabase}=await vite.ssrLoadModule('/src/data/db.ts');
const stamp='2026-07-01T12:00:00.000Z';
const session={token:'synthetic',instructorId:'fixture',name:'Synthetic Trainer',profilePhotoUrl:null,trainerSince:'2026-01-01',createdAt:stamp};
const db=emptyDatabase();db.folders=[{id:'folder',name:'Test dogs',parentFolderId:null,sortOrder:0,createdDate:stamp,updatedDate:stamp}];db.dogs=[{id:'dog',name:'Layout dog',folderId:'folder',currentPhase:'Phase 1',sortOrder:0,profilePhoto:null,graduated:false,released:false,passBackCopies:[],passBackSource:null,createdDate:stamp,updatedDate:stamp}];
const results=[];
try {await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
for(const engine of ['chromium','webkit'])for(const width of [320,390])for(const quota of [false,true]){
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome'}:{})});
try{const context=await browser.newContext({viewport:{width,height:844}});let remote=structuredClone(db),revision=1;
await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.hostname!=='layout-test.invalid')return route.abort();let body;if(url.pathname.includes('account'))body=session;else if(req.method()==='PUT'){await new Promise(r=>setTimeout(r,300));remote=req.postDataJSON().blob;body={updatedAt:String(++revision)};}else {await new Promise(r=>setTimeout(r,150));body={blob:remote,updatedAt:String(revision),sharedReports:[]};}await route.fulfill({json:body});});
await context.addInitScript(({session,quota})=>{sessionStorage.setItem('ttt:landing-seen','1');localStorage.setItem('abbys-dog-chej:session',JSON.stringify(session));if(quota){const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.includes(':outbox:')||k.includes(':server-cache:'))throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v);};}},{session,quota});
const page=await context.newPage();await page.goto(origin+'/dog/dog');const box=page.getByRole('checkbox',{name:'Responds to Name',exact:true});await box.waitFor();await box.scrollIntoViewIfNeeded();await box.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-200));
await page.evaluate(()=>{window.layoutFrames=[];window.sampleUntil=performance.now()+2200;function sample(){const box=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Responds to Name');const h=document.querySelector('header');const r=box.getBoundingClientRect();window.layoutFrames.push({header:h.getBoundingClientRect().height,rowTop:r.top,rowHeight:r.height,documentTop:r.top+scrollY,scrollY,status:document.querySelector('[role=status]')?.textContent});if(performance.now()<window.sampleUntil)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
await box.check();await page.waitForFunction(()=>performance.now()>window.sampleUntil);const frames=await page.evaluate(()=>window.layoutFrames);const distinct=frames.filter((x,i)=>!i||JSON.stringify({...x})!==JSON.stringify(frames[i-1]));const result={engine,width,quota,states:distinct};results.push(result);
assert(frames.some(f=>f.status?.includes('Syncing')), 'Must observe the actual sync transition');
for(const metric of ['header','documentTop','rowTop','rowHeight','scrollY']) {
 const values=frames.map(f=>f[metric]);
 assert(Math.max(...values)-Math.min(...values)<0.5, `${engine} ${width} quota=${quota}: ${metric} moved`);
}
await page.screenshot({path:`/tmp/dog-sync-layout-${engine}-${width}-${quota}.png`,fullPage:true});
console.log('PASS',engine,width,'quota='+quota,'header, row and scroll remain stable through sync');
}finally{await browser.close();}}
}finally{await vite.close();if(process.env.LAYOUT_RESULTS)fs.writeFileSync(process.env.LAYOUT_RESULTS,JSON.stringify(results,null,2));}
