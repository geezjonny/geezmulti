// Optional Windows smoke check using the installed Edge; no npm dependencies.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const root=resolve(import.meta.dirname,'..');
// Start from a clean profile so a session saved by a previous run is not auto-reopened mid-test.
await rm(resolve(root,'.qa-profile'),{recursive:true,force:true});
const server=spawn('python',['-m','http.server','8094','--bind','127.0.0.1'],{cwd:root,windowsHide:true,stdio:'ignore'});
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=9229',`--user-data-dir=${resolve(root,'.qa-profile')}`,'--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{windowsHide:true,stdio:'ignore'});
const sockets=[];let browserSocket;
const timedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(2500)});
async function until(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch{}await delay(150);}throw Error('Timed out: '+label);}
async function session(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});sockets.push(ws);let sequence=0;const pending=new Map();const errors=[];ws.onmessage=({data})=>{const event=JSON.parse(data);if(event.id){const p=pending.get(event.id);pending.delete(event.id);event.error?p?.reject(Error(event.error.message)):p?.resolve(event.result);}if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.text+' '+(event.params.exceptionDetails.exception?.description||''));};return{errors,call:(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));})};}
async function page(url){const target=await(await timedFetch('http://127.0.0.1:9229/json/new?about:blank',{method:'PUT'})).json();const client=await session(target.webSocketDebuggerUrl);await client.call('Runtime.enable');await client.call('Page.enable');
  // Substitute configuration only in this test browser, preserving the user's file
  // and preventing the smoke check from writing anything to live Firebase.
  const socket=sockets.at(-1);socket.addEventListener('message',({data})=>{const e=JSON.parse(data);if(e.method==='Fetch.requestPaused')client.call('Fetch.fulfillRequest',{requestId:e.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from('export const firebaseConfig = {apiKey:""};').toString('base64')}).catch(console.error);});
  await client.call('Fetch.enable',{patterns:[{urlPattern:'*/firebase-config.js',requestStage:'Request'}]});
  await client.call('Page.navigate',{url});return{...client,eval:async expression=>{const r=await client.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}};}
try{
  console.log('Starting isolated headless Edge and static server…');
  const info=await until(async()=>{const response=await timedFetch('http://127.0.0.1:9229/json/version');return response.json();},'Edge debug endpoint');browserSocket=await session(info.webSocketDebuggerUrl);
  await until(async()=>(await timedFetch('http://127.0.0.1:8094')).ok,'static server');
  console.log('Checking GM and player workflow…');
  const gm=await page('http://127.0.0.1:8094/dd2vtt.html');
  await until(()=>gm.eval("document.querySelector('#status').textContent.includes('LOCAL DEMO')"),'GM imports and WebGL').catch(async e=>{console.log('Browser errors:',gm.errors);console.log('Page:',await gm.eval("JSON.stringify({url:location.href,status:document.querySelector('#status')?.textContent,canvas:document.querySelectorAll('canvas').length,body:document.body?.innerText.slice(0,400)})"));console.log('Imports:',await gm.eval("Promise.race([import('./js/gm.js').then(()=> 'loaded').catch(e=>e.stack),new Promise(r=>setTimeout(()=>r('import timed out'),8000))])"));console.log('CDN check:',await gm.eval("fetch('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',{signal:AbortSignal.timeout(5000)}).then(r=>r.status).catch(e=>e.message)"));throw e;});
  await gm.eval("document.querySelector('#create').click()");
  const room=await until(()=>gm.eval("document.querySelector('#room').value"),'create session');
  await until(()=>gm.eval("document.querySelectorAll('#palette .tile').length>0"),'asset palette');
  const cell=await gm.eval("(()=>{const r=document.querySelector('.editor-canvas').getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+r.height*.5};})()");
  await gm.call('Input.dispatchMouseEvent',{type:'mousePressed',...cell,button:'left',buttons:1,clickCount:1});
  await gm.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:cell.x+60,y:cell.y,button:'left',buttons:1});
  await gm.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:cell.x+60,y:cell.y,button:'left',clickCount:1});
  await until(()=>gm.eval("/ [2-9]\d* floor .*unpublished/.test(document.querySelector('#map-info').textContent)"),'floor painting stroke');
  await gm.eval("window.confirm=()=>true;document.querySelector('#starter').click()");
  await until(()=>gm.eval("document.querySelector('#map-info').textContent.includes('16 × 12')&&!document.querySelector('#map-info').textContent.includes('unpublished')"),'starter map publish');
  await gm.eval("document.querySelector('#mode-draw').click();document.querySelector('[data-tool=light]').click()");await delay(400);
  await mkdir(resolve(root,'.qa-output'),{recursive:true});await writeFile(resolve(root,'.qa-output','editor.png'),Buffer.from((await gm.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await gm.eval("document.querySelector('[data-tool=floor]').click();document.querySelector('#mode-3d').click()");
  await gm.eval("document.querySelector('#add').click()");await until(()=>gm.eval("document.querySelectorAll('.token-card').length===1"),'token creation');
  const viewer=await page('http://127.0.0.1:8094/viewer.html?room='+room);
  await until(()=>viewer.eval("document.querySelector('#status').textContent.includes('LOCAL DEMO')"),'viewer imports');
  await viewer.eval("document.querySelector('#name').value='Smoke Player';document.querySelector('#join').click()");
  await until(()=>gm.eval("document.querySelector('.token-card select').options.length===2"),'player registration sync');
  await gm.eval("const s=document.querySelector('.token-card select');s.selectedIndex=1;s.dispatchEvent(new Event('change'))");
  await until(()=>viewer.eval("document.querySelector('#token').value.length>0"),'token assignment sync');
  await viewer.eval("document.querySelector('#enter').click()");
  await until(()=>viewer.eval("document.querySelector('#panel').classList.contains('hidden')"),'first person entry');
  const point=await gm.eval("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+r.height*.74};})()");
  await gm.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await gm.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  await until(()=>gm.eval(`(async()=>{const {connect}=await import('./js/store.js');const data=await (await connect()).get('sessions/${room}/tokens');return Object.values(data).some(t=>Math.abs(t.x-8)>.01||Math.abs(t.z-6)>.01);})()`),'click-to-move persistence');
  await gm.eval("const n=document.querySelector('.token-card input');n.value='Synced Ranger';n.dispatchEvent(new Event('change'))");
  await until(()=>viewer.eval("document.querySelector('#view-info').textContent.includes('SYNCED RANGER')"),'token rename sync');
  await gm.eval("document.querySelector('#doors button').click()");
  await until(()=>gm.eval("document.querySelector('#doors button').textContent.includes('Open')"),'door toggle');
  await gm.eval("const h=document.querySelector('#height');h.value='3.5';h.dispatchEvent(new Event('change'))");
  await until(()=>gm.eval("document.querySelector('#height').value==='3.5'"),'wall height');
  const state=await gm.eval(`(async()=>{const {connect}=await import('./js/store.js');return (await connect()).get('sessions/${room}');})()`);
  if(state.scene.height!==3.5||state.doors['8_6']!==false||state.scene.map.version!==2||!Object.values(state.tokens).every(t=>t.name==='Synced Ranger'))throw Error('Persisted state mismatch');
  await mkdir(resolve(root,'.qa-output'),{recursive:true});
  for(const [name,client]of [['gm',gm],['viewer',viewer]]){const shot=await client.call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(root,'.qa-output',name+'.png'),Buffer.from(shot.data,'base64'));}
  if(gm.errors.length||viewer.errors.length)throw Error([...gm.errors,...viewer.errors].join('\n'));
  await viewer.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await viewer.eval("document.querySelector('#motion').click()");
  await until(()=>viewer.eval("document.querySelector('#motion').textContent==='Disable motion'"),'motion toggle');
  await viewer.eval("window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:35,beta:90,gamma:0}));document.querySelector('#recenter').click()");
  await viewer.eval("document.querySelector('#motion').click()");
  await until(()=>viewer.eval("document.querySelector('#motion').textContent==='Enable motion'"),'motion disable');
  console.log('PASS: GM tile painting, map publish, token creation and movement, player registration, assignment, first-person entry, rename sync, doors, height, IndexedDB persistence and mobile motion UI.');
  console.log('Screenshots: .qa-output/editor.png, gm.png and viewer.png');
}finally{if(browserSocket)await Promise.race([browserSocket.call('Browser.close').catch(()=>{}),delay(2000)]);sockets.forEach(ws=>ws.close());browser.kill();server.kill();}
