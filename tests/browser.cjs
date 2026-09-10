const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)||name.includes('/.')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 const headersFile=path.join(root,'_headers');
 if(fs.existsSync(headersFile))for(const line of fs.readFileSync(headersFile,'utf8').split('\n')){const i=line.indexOf(':');if(line.startsWith('  ')&&i>0)res.setHeader(line.slice(0,i).trim(),line.slice(i+1).trim());}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');fs.createReadStream(file).pipe(res);
});
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
test('Blocked browser storage does not prevent wage data loading',async(p,url)=>{
 await p.evaluateOnNewDocument(()=>{Storage.prototype.getItem=()=>{throw Error('Blocked storage')};Storage.prototype.setItem=()=>{throw Error('Blocked storage')};});
 await p.goto(url);await p.waitForFunction(()=>state.areaData?.total?.emp>0,{timeout:15000});
 await p.click('#themeToggleBtn');
});
test('A cached area selection wins over an older slow response',async(p,url)=>{
 await p.goto(url);await p.waitForFunction(()=>state.mapData&&state.areaData);
 const result=await p.evaluate(async()=>{
  const original=fetch;let release;const gate=new Promise(r=>release=r);
  window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).includes('/areas/01.json'))await gate;return r;};
  const pending=loadArea('01');await loadArea('99');release();await pending;
  return {selected:state.currentAreaId,displayed:state.areaData.id};
 });assert.deepEqual(result,{selected:'99',displayed:'99'});
});
test('A cached occupation wins over an older slow response',async(p,url)=>{
 await p.goto(url);await p.waitForFunction(()=>state.mapData&&state.areaData);
 const result=await p.evaluate(async()=>{
  const jobs=state.mapData.occupations.filter(o=>o.soc!=='00-0000').slice(0,2);
  const a=jobs[0].soc,b=jobs[1].soc;await loadMapJob(b);
  const original=fetch;let release;const gate=new Promise(r=>release=r);
  window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).includes('/jobs/'+a+'.json'))await gate;return r;};
  const pending=loadMapJob(a);await loadMapJob(b);release();await pending;
  return {selected:state.activeMapSoc,displayed:state.activeJobPayload.soc};
 });assert.equal(result.selected,result.displayed);
});
test('Missing area data shows an error and preserves the displayed area',async(p,url)=>{
 await p.goto(url);await p.waitForFunction(()=>state.areaData);
 await p.evaluate(async()=>{const original=fetch;window.fetch=(...args)=>String(args[0]).includes('/areas/01.json')?Promise.resolve(new Response('',{status:503})):original(...args);await loadArea('01');});
 assert.equal(await p.evaluate(()=>state.currentAreaId), '99');
 assert.equal(await p.$eval('#dataNotice',e=>!e.hidden),true);
});
test('Failed occupation loads restore the previous selection and map',async(p,url)=>{
 await p.goto(url);await p.waitForFunction(()=>state.mapData&&state.activeJobPayload);
 await p.evaluate(async()=>{const original=fetch;window.fetch=(...args)=>String(args[0]).includes('/jobs/')?Promise.resolve(new Response('',{status:503})):original(...args);await loadMapJob('29-1242');});
 assert.deepEqual(await p.evaluate(()=>[state.activeMapSoc,state.activeJobPayload.soc]),['00-0000','00-0000']);
 assert.equal(await p.$eval('#dataNotice',e=>!e.hidden),true);
});
test('Censored wages do not produce a falsely precise national percentage',async(p,url)=>{
 await p.goto(url);await p.waitForFunction(()=>state.mapData&&state.areaData);
 await p.evaluate(async()=>{await loadArea('27');await loadMapJob('29-1242');state.activeJobPayload.nat.median=239200;renderHeroAndKPIs();});
 assert.equal(await p.$eval('#kpiMedianDelta',e=>e.textContent.includes('%')),false);
});
test('Both themes fit phone, tablet and desktop widths',async(p,url)=>{
 await p.goto(url);await p.waitForFunction(()=>state.mapData&&state.areaData);
 for(const width of [320,390,768,1024,1440])for(const dark of [false,true]){
  await p.setViewport({width,height:900});await p.evaluate(d=>applyTheme(d),dark);
  await new Promise(r=>setTimeout(r,160));
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow at '+width+' '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='absolute').slice(0,10).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right]))));
  if(process.env.AUDIT_SCREENSHOTS&&!dark){fs.mkdirSync(process.env.AUDIT_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.AUDIT_SCREENSHOTS,'bls-'+width+'.png'),fullPage:true});}
 }
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=process.env.BLS_URL||'http://127.0.0.1:'+server.address().port+'/';
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});let failures=0;
 try{for(const [name,fn] of cases){const context=await browser.createBrowserContext();const p=await context.newPage();const errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.setRequestInterception(true);
  p.on('request',r=>r.url().startsWith(url)||r.url().startsWith('data:')?r.continue():r.abort());
  try{await fn(p,url);assert.deepEqual(errors,[]);console.log('PASS',name);}catch(e){failures++;console.log('FAIL',name,e.message);if(process.env.AUDIT_SCREENSHOTS)await p.screenshot({path:path.join(process.env.AUDIT_SCREENSHOTS,'bls-failure.png'),fullPage:true});}
  await context.close();
 }}finally{await browser.close();server.close();}console.log(cases.length-failures+'/'+cases.length+' passed');process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
