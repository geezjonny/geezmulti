import {World} from './scene.js';
import {connect,localMode} from './store.js';
import {$,action,message,fail,validRoom,listenConnection} from './ui.js';
let store,room='',tokens={},selected='',stops=[],sceneKey='',doorStates={},motion=false;
const world=new World($('stage'),true);world.enableDragLook();
const ready=connect().then(s=>{store=s;store.local=localMode;listenConnection(store);$('identity').textContent=`Your player ID: ${store.uid.slice(0,8)} · Give your name to the GM for assignment.`;}).catch(fail);
$('room').value=new URLSearchParams(location.search).get('room')||'';$('name').value=localStorage.getItem('multi-vtt-player-name')||'';
action('join',async()=>{
  await ready;if(!store)throw Error('Connection failed. Check Firebase setup.');const code=validRoom($('room').value),name=$('name').value.trim();if(!name)throw Error('Enter your player name.');
  const meta=await store.get(`sessions/${code}/meta`);if(!meta)throw Error('Session not found. Check the invite code.');
  await store.put(`sessions/${code}/players/${store.uid}`,{name:name.slice(0,40),joinedAt:Date.now()});localStorage.setItem('multi-vtt-player-name',name);
  stops.forEach(stop=>stop());stops=[];room=code;selected='';sceneKey='';doorStates={};tokens={};world.follow('');await world.loadMap(null);world.setTokens({});
  stops.push(store.watch(`sessions/${room}/scene`,async scene=>{try{if((scene?.revision||'')!==sceneKey){sceneKey=scene?.revision||'';await world.loadMap(scene?.map||null,scene?.height||2.5);world.updateDoors(doorStates);}}catch(e){fail(e);}},fail));
  stops.push(store.watch(`sessions/${room}/tokens`,value=>{tokens=value||{};const assigned=Object.entries(tokens).filter(([,t])=>t.assignedTo===store.uid);const old=selected;$('token').replaceChildren(new Option(assigned.length?'Choose your character':'Waiting for GM assignment…',''));for(const [id,t]of assigned)$('token').append(new Option(t.name,id));selected=assigned.some(([id])=>id===old)?old:(assigned.length===1?assigned[0][0]:'');$('token').value=selected;world.setTokens(tokens);applySelection();},fail));
  stops.push(store.watch(`sessions/${room}/doors`,value=>{doorStates=value||{};world.updateDoors(doorStates);},fail));
  message('Joined. Ask the GM to assign your character.');
});
function applySelection(){world.follow(selected);const t=tokens[selected];$('view-info').textContent=t?`${t.name.toUpperCase()} / ${room}`:'WAITING FOR CHARACTER';if(!t){$('panel').classList.remove('hidden');world.camera.position.set(0,-100,0);}else world.updateEye();}
$('token').addEventListener('change',()=>{selected=$('token').value;world.recenter();applySelection();});
action('enter',()=>{if(!selected)throw Error('The GM must assign a token to your player identity first.');$('panel').classList.add('hidden');world.recenter();});
action('menu',()=>$('panel').classList.toggle('hidden'));
const orientation=e=>world.setOrientation(e);
action('motion',async()=>{
  if(motion){window.removeEventListener('deviceorientation',orientation);world.sensorQuaternion=null;world.rawSensor=null;motion=false;$('motion').textContent='Enable motion';return;}
  if(!window.isSecureContext)throw Error('Motion requires HTTPS. Use the GitHub Pages URL on your phone.');
  if(!window.DeviceOrientationEvent)throw Error('Motion sensors are unavailable. Drag to look around.');
  if(typeof DeviceOrientationEvent.requestPermission==='function'){const permission=await DeviceOrientationEvent.requestPermission();if(permission!=='granted')throw Error('Motion permission was denied. You can still drag to look around.');}
  let received=false;const first=e=>{if(e.alpha===null)return;received=true;world.setOrientation(e);world.recenter();window.removeEventListener('deviceorientation',first);};window.addEventListener('deviceorientation',first);
  window.addEventListener('deviceorientation',orientation);motion=true;$('motion').textContent='Disable motion';message('Motion enabled. Hold your phone up, then tap Recenter.');
  setTimeout(()=>{window.removeEventListener('deviceorientation',first);if(motion&&!received)message('No sensor data received. Check browser permissions or use drag to look.',true);},5000);
});
action('recenter',()=>world.recenter());
action('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else message('Fullscreen is unavailable in this browser. Add to Home Screen for a larger view.');});
