import {World} from './scene.js';
import {connect,localMode} from './store.js';
import {parseMap,demoMap} from './map.js';
import {$,action,message,fail,validRoom,listenConnection,element} from './ui.js';
let store,room='',map=null,tokens={},players={},doorStates={},selected='',height=2.5,stops=[],currentMapKey='';
const world=new World($('stage'));
const ready=connect().then(s=>{store=s;store.local=localMode;listenConnection(store);}).catch(fail);
const path=s=>`sessions/${room}/${s}`;
function requireRoom(){if(!store)throw Error('Connection is not ready.');if(!room)throw Error('Create or open a session first.');}
async function openRoom(code){
  await ready;if(!store)throw Error('Firebase connection failed. Check configuration and Anonymous Authentication.');
  code=validRoom(code);const meta=await store.get(`sessions/${code}/meta`);
  if(!meta)throw Error('Session not found.');if(meta.owner!==store.uid)throw Error('This session belongs to another GM. Use the original browser to open it.');
  stops.forEach(stop=>stop());stops=[];room=code;$('room').value=code;localStorage.setItem('multi-vtt-gm-room',code);$('session-info').textContent=`Session: ${code} · ${localMode?'Local demo':'Live Firebase'}`;
  currentMapKey='';map=null;tokens={};players={};selected='';doorStates={};await world.loadMap(null);world.setTokens({});
  stops.push(store.watch(path('scene'),async scene=>{try{const sceneKey=scene?.revision || '';height=scene?.height||2.5;$('height').value=height;map=scene?.map||null;if(sceneKey!==currentMapKey){currentMapKey=sceneKey;await world.loadMap(map,height);world.updateDoors(doorStates);}$('map-info').textContent=map?`${map.width} × ${map.depth} grid · ${(map.walls||[]).length} walls · ${(map.doors||[]).length} doors`:'No map loaded.';renderDoors();}catch(e){fail(e);}},fail));
  stops.push(store.watch(path('tokens'),value=>{tokens=value||{};if(!tokens[selected])selected='';world.setTokens(tokens,selected);renderTokens();},fail));
  stops.push(store.watch(path('players'),value=>{players=value||{};renderTokens();},fail));
  stops.push(store.watch(path('doors'),value=>{doorStates=value||{};world.updateDoors(doorStates);renderDoors();},fail));
}
action('create',async()=>{await ready;if(!store)throw Error('Connection failed.');const code=crypto.randomUUID().replaceAll('-','').slice(0,12);await store.put(`sessions/${code}`,{meta:{owner:store.uid,createdAt:Date.now()}});await openRoom(code);message('Session created. Import a map or load the demo.');});
action('open',()=>openRoom($('room').value));
action('invite',async()=>{requireRoom();const url=new URL('viewer.html',location.href);url.searchParams.set('room',room);try{await navigator.clipboard.writeText(url.href);message('Player invite copied.');}catch{$('session-info').textContent=url.href;message('Invite link is shown in the session panel.');}});
async function saveMap(next){requireRoom();if(Object.keys(tokens).length&&!confirm('Replace this map and remove its tokens and door states?'))return;const scene={map:next,height,revision:crypto.randomUUID()};if(new TextEncoder().encode(JSON.stringify(scene)).length>12*1024*1024)throw Error('This map is too large for the 12 MB import limit. Export a smaller image resolution.');await store.patch(`sessions/${room}`,{scene,tokens:null,doors:null});message('Map saved.');}
$('file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{requireRoom();if(file.size>14*1024*1024)throw Error('Map exceeds the 14 MB source-file limit. Export a lower-resolution image.');await saveMap(parseMap(JSON.parse(await file.text())));}catch(e){fail(e);}finally{e.target.value='';}});
action('demo',()=>saveMap(demoMap()));
$('height').addEventListener('change',async()=>{try{requireRoom();if(!map)throw Error('Load a map first.');const value=Number($('height').value);if(!Number.isFinite(value)||value<.2||value>10)throw Error('Wall height must be between 0.2 and 10.');await store.patch(path('scene'),{height:value,revision:crypto.randomUUID()});}catch(e){fail(e);}});
action('add',async()=>{requireRoom();if(!map)throw Error('Load a map first.');const id=crypto.randomUUID();selected=id;const colors=['#b9f778','#78c6f7','#e9a47b','#c89ef3','#f0d878'];await store.put(path(`tokens/${id}`),{name:`Character ${Object.keys(tokens).length+1}`,x:map.width/2,z:map.depth/2,heading:0,color:colors[Object.keys(tokens).length%colors.length],assignedTo:''});message('Token added. Click the floor to place it.');});
function renderTokens(){const container=$('tokens');container.replaceChildren();for(const [id,t]of Object.entries(tokens)){
  const card=element('div',undefined,'token-card'+(id===selected?' active':''));const head=element('div',undefined,'token-head');const dot=element('span',undefined,'dot');dot.style.background=t.color;head.append(dot,element('strong',t.name));card.append(head);
  const name=element('input');name.value=t.name;name.maxLength=60;name.setAttribute('aria-label','Character name');name.onchange=()=>store.patch(path(`tokens/${id}`),{name:name.value.trim()||'Character'}).catch(fail);card.append(name);
  const assign=element('select');assign.setAttribute('aria-label','Assigned player');assign.append(new Option('Unassigned',''));for(const [uid,p]of Object.entries(players))assign.append(new Option(`${p.name} · ${uid.slice(0,6)}`,uid));if(t.assignedTo&&!players[t.assignedTo])assign.append(new Option(`Player ${t.assignedTo.slice(0,6)}`,t.assignedTo));assign.value=t.assignedTo||'';assign.onchange=()=>store.patch(path(`tokens/${id}`),{assignedTo:assign.value}).catch(fail);card.append(assign);
  const row=element('div',undefined,'row');const select=element('button',id===selected?'Selected':'Select / move');select.onclick=()=>{selected=id;world.setTokens(tokens,selected);renderTokens();};const remove=element('button','Remove');remove.onclick=()=>{if(confirm(`Remove ${t.name}?`))store.put(path(`tokens/${id}`),null).catch(fail);};row.append(select,remove);card.append(row);
  const label=element('label','Facing (degrees)');const facing=element('input');facing.type='number';facing.step='15';facing.value=Math.round((t.heading||0)*180/Math.PI);facing.setAttribute('aria-label','Facing in degrees');facing.onchange=()=>{const angle=Number(facing.value);if(Number.isFinite(angle))store.patch(path(`tokens/${id}`),{heading:angle*Math.PI/180}).catch(fail);};card.append(label,facing);container.append(card);
}}
function renderDoors(){const container=$('doors');container.replaceChildren();for(const d of map?.doors||[]){const closed=doorStates[d.id]??d.closed;const button=element('button',`Door ${Number(d.id)+1} · ${closed?'Closed':'Open'}`,'full');button.style.marginBottom='6px';button.onclick=()=>store.put(path(`doors/${d.id}`),!closed).catch(fail);container.append(button);}if(!map?.doors?.length)container.append(element('p','No doors in this map.','small'));}
let down=null;world.renderer.domElement.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});world.renderer.domElement.addEventListener('pointerup',async e=>{if(!down||e.button!==0||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;down=null;try{if(!room)return;const hit=world.pick(e);if(hit?.token){selected=hit.token;world.setTokens(tokens,selected);renderTokens();}else if(hit&&selected){await store.patch(path(`tokens/${selected}`),{x:Math.max(.05,Math.min(map.width-.05,hit.x)),z:Math.max(.05,Math.min(map.depth-.05,hit.z))});}}catch(e){fail(e);}});
const previous=localStorage.getItem('multi-vtt-gm-room');if(previous)ready.then(()=>openRoom(previous)).catch(fail);
