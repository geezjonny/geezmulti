import {World} from './scene.js';
import {connect,localMode} from './store.js';
import {emptyMap,normalizeMap,resizeMap,starterMap,toDD2VTT,cellCount,unkey,MAX_SIZE} from './map.js';
import {MapEditor} from './editor.js';
import {listAssets,assetUrl,assetLabel} from './assets.js';
import {$,action,message,fail,validRoom,listenConnection,element} from './ui.js';
let store,room='',published=null,tokens={},players={},doorStates={},selected='',height=2.5,stops=[],sceneKey='',dirty=false,firstScene=true;
let assets={floor:[],wall:[],door:[]};
const world=new World($('stage'));
const editor=new MapEditor($('stage'),{onEdit:()=>{dirty=true;updateInfo();},onError:fail});
const ready=connect().then(s=>{store=s;store.local=localMode;listenConnection(store);}).catch(fail);
const path=s=>`sessions/${room}/${s}`;
function requireRoom(){if(!store)throw Error('Connection is not ready.');if(!room)throw Error('Create or open a session first.');}

// ---- Draw / 3D modes ----
let mode='draw';
function setMode(next){
  mode=next;$('stage').dataset.mode=mode;$('mode-draw').classList.toggle('active',mode==='draw');$('mode-3d').classList.toggle('active',mode==='3d');
  $('stage-help').textContent=mode==='draw'?'Left-drag paints · Right-drag erases · Scroll zooms · Middle- or Alt-drag pans':'Drag to orbit · Scroll to zoom · Right-drag to pan · Select a token, then click the floor to move it';
  if(mode==='3d')refreshWorld();else editor.fit();
}
const refreshWorld=()=>world.loadMap(editor.map,height).then(()=>world.updateDoors(doorStates)).catch(fail);
$('mode-draw').onclick=()=>setMode('draw');$('mode-3d').onclick=()=>setMode('3d');
setMode('draw');

// ---- Tools and tile palette ----
function setTool(tool){editor.tool=tool;for(const b of document.querySelectorAll('[data-tool]'))b.classList.toggle('active',b.dataset.tool===tool);renderPalette();}
for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
function renderPalette(){
  const container=$('palette'),tool=editor.tool;container.replaceChildren();
  if(tool==='light'){
    const picker=element('input');picker.type='color';picker.value=editor.lightColor;picker.setAttribute('aria-label','Light color');picker.oninput=()=>{editor.lightColor=picker.value;renderPalette();};
    container.append(picker);
    for(const [name,c] of [['Torch','#ffb35c'],['Candle','#ffe08a'],['Moon','#7fb8ff'],['Arcane','#c58bff'],['Poison','#7dff8a'],['Hellfire','#ff4b3a']]){
      const swatch=element('button',undefined,'swatch'+(editor.lightColor===c?' active':''));swatch.style.background=c;swatch.title=name;swatch.setAttribute('aria-label',`${name} light`);swatch.onclick=()=>{editor.lightColor=c;renderPalette();};container.append(swatch);
    }
    return;
  }
  const list=assets[tool];
  if(!list.length){container.append(element('p',`No PNGs found in assets/${tool}/. Add some and reload.`,'small'));return;}
  for(const file of list){
    const tile=element('button',undefined,'tile'+(editor.assets[tool]===file?' active':''));tile.title=assetLabel(file);
    const img=element('img');img.src=assetUrl(file);img.alt='';tile.append(img,element('span',assetLabel(file)));
    tile.onclick=()=>{editor.assets[tool]=file;renderPalette();};container.append(tile);
  }
}
listAssets().then(found=>{assets=found;for(const tool of ['floor','wall','door'])editor.assets[tool]=found[tool][0]||'';setTool('floor');}).catch(fail);
$('erase').onchange=()=>{editor.erase=$('erase').checked;};

// ---- Map editing actions ----
function updateInfo(){
  const m=editor.map,n=layer=>Object.keys(m[layer]).length;
  $('map-info').textContent=`${m.width} × ${m.depth} grid · ${n('floor')} floor · ${n('walls')} wall · ${n('doors')} doors · ${n('lights')} lights`+(dirty?' · unpublished changes':'');
  $('map-info').classList.toggle('pending',dirty);$('map-width').value=m.width;$('map-depth').value=m.depth;
}
function replaceDrawing(map){editor.setMap(map);dirty=true;updateInfo();if(mode==='3d')refreshWorld();}
async function publish(){
  requireRoom();const map=normalizeMap(editor.map);
  await store.put(path('scene'),{map,height,revision:crypto.randomUUID()});
  // Forget open/closed overrides for doors that were painted over.
  const stale=Object.keys(doorStates).filter(id=>doorStates[id]!==null&&!map.doors[id]);
  if(stale.length)await store.patch(path('doors'),Object.fromEntries(stale.map(id=>[id,null])));
  dirty=false;updateInfo();message('Map published to players.');
}
action('publish',publish);
action('starter',async()=>{if(cellCount(editor.map)&&!confirm('Replace the current drawing with the starter room?'))return;replaceDrawing(starterMap(assets));if(room)await publish();setMode('3d');});
action('clear',()=>{if(cellCount(editor.map)&&!confirm('Erase the whole drawing? Players keep the published map until you publish again.'))return;replaceDrawing(emptyMap(editor.map.width,editor.map.depth));});
action('resize',()=>{
  const w=Number($('map-width').value),d=Number($('map-depth').value);
  if(!Number.isInteger(w)||!Number.isInteger(d)||w<1||d<1||w>MAX_SIZE||d>MAX_SIZE)throw Error(`Map size must be 1–${MAX_SIZE} cells per side.`);
  const next=resizeMap(editor.map,w,d);
  if(cellCount(next)<cellCount(editor.map)&&!confirm('Shrinking the map deletes tiles outside the new edge. Continue?'))return;
  replaceDrawing(next);
});
action('export',async()=>{
  const map=normalizeMap(editor.map);if(!cellCount(map))throw Error('Draw something before exporting.');
  const file=JSON.stringify(toDD2VTT(map,await editor.bake(64),64));
  const link=element('a');link.href=URL.createObjectURL(new Blob([file],{type:'application/json'}));link.download=`${room||'map'}.dd2vtt`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
});
$('height').addEventListener('change',async()=>{try{
  const value=Number($('height').value);if(!Number.isFinite(value)||value<.2||value>10)throw Error('Wall height must be between 0.2 and 10.');
  height=value;if(room&&published)await store.patch(path('scene'),{height,revision:crypto.randomUUID()});else refreshWorld();
}catch(e){fail(e);}});
addEventListener('beforeunload',e=>{if(dirty)e.preventDefault();});

// ---- Session ----
async function openRoom(code){
  await ready;if(!store)throw Error('Firebase connection failed. Check configuration and Anonymous Authentication.');
  code=validRoom(code);const meta=await store.get(`sessions/${code}/meta`);
  if(!meta)throw Error('Session not found.');if(meta.owner!==store.uid)throw Error('This session belongs to another GM. Use the original browser to open it.');
  if(dirty&&!confirm('Discard your unpublished drawing and open this session?'))return;
  stops.forEach(stop=>stop());stops=[];room=code;$('room').value=code;localStorage.setItem('multi-vtt-gm-room',code);$('session-info').textContent=`Session: ${code} · ${localMode?'Local demo':'Live Firebase'}`;
  sceneKey='';published=null;dirty=false;firstScene=true;tokens={};players={};selected='';doorStates={};world.setTokens({});
  stops.push(store.watch(path('scene'),async scene=>{try{
    height=scene?.height||2.5;$('height').value=height;
    const revision=scene?.revision||'';
    if(revision!==sceneKey){
      sceneKey=revision;
      try{published=scene?.map?normalizeMap(scene.map):null;}catch(e){published=null;fail(e);}
      if(!dirty)editor.setMap(published?structuredClone(published):emptyMap());
      await refreshWorld();
    }
    if(firstScene){firstScene=false;setMode(published&&cellCount(published)?'3d':'draw');}
    updateInfo();renderDoors();
  }catch(e){fail(e);}},fail));
  stops.push(store.watch(path('tokens'),value=>{tokens=value||{};if(!tokens[selected])selected='';world.setTokens(tokens,selected);renderTokens();},fail));
  stops.push(store.watch(path('players'),value=>{players=value||{};renderTokens();},fail));
  stops.push(store.watch(path('doors'),value=>{doorStates=value||{};world.updateDoors(doorStates);renderDoors();},fail));
}
action('create',async()=>{await ready;if(!store)throw Error('Connection failed.');const code=crypto.randomUUID().replaceAll('-','').slice(0,12);await store.put(`sessions/${code}`,{meta:{owner:store.uid,createdAt:Date.now()}});await openRoom(code);message('Session created. Paint a map, then publish it.');});
action('open',()=>openRoom($('room').value));
action('invite',async()=>{requireRoom();const url=new URL('viewer.html',location.href);url.searchParams.set('room',room);try{await navigator.clipboard.writeText(url.href);message('Player invite copied.');}catch{$('session-info').textContent=url.href;message('Invite link is shown in the session panel.');}});

// ---- Tokens ----
action('add',async()=>{requireRoom();const m=editor.map,id=crypto.randomUUID();selected=id;const colors=['#b9f778','#78c6f7','#e9a47b','#c89ef3','#f0d878'];await store.put(path(`tokens/${id}`),{name:`Character ${Object.keys(tokens).length+1}`,x:m.width/2,z:m.depth/2,heading:0,color:colors[Object.keys(tokens).length%colors.length],assignedTo:''});setMode('3d');message('Token added. Click the floor to place it.');});
function renderTokens(){const container=$('tokens');container.replaceChildren();for(const [id,t]of Object.entries(tokens)){
  const card=element('div',undefined,'token-card'+(id===selected?' active':''));const head=element('div',undefined,'token-head');const dot=element('span',undefined,'dot');dot.style.background=t.color;head.append(dot,element('strong',t.name));card.append(head);
  const name=element('input');name.value=t.name;name.maxLength=60;name.setAttribute('aria-label','Character name');name.onchange=()=>store.patch(path(`tokens/${id}`),{name:name.value.trim()||'Character'}).catch(fail);card.append(name);
  const assign=element('select');assign.setAttribute('aria-label','Assigned player');assign.append(new Option('Unassigned',''));for(const [uid,p]of Object.entries(players))assign.append(new Option(`${p.name} · ${uid.slice(0,6)}`,uid));if(t.assignedTo&&!players[t.assignedTo])assign.append(new Option(`Player ${t.assignedTo.slice(0,6)}`,t.assignedTo));assign.value=t.assignedTo||'';assign.onchange=()=>store.patch(path(`tokens/${id}`),{assignedTo:assign.value}).catch(fail);card.append(assign);
  const row=element('div',undefined,'row');const select=element('button',id===selected?'Selected':'Select / move');select.onclick=()=>{selected=id;world.setTokens(tokens,selected);renderTokens();setMode('3d');};const remove=element('button','Remove');remove.onclick=()=>{if(confirm(`Remove ${t.name}?`))store.put(path(`tokens/${id}`),null).catch(fail);};row.append(select,remove);card.append(row);
  const label=element('label','Facing (degrees)');const facing=element('input');facing.type='number';facing.step='15';facing.value=Math.round((t.heading||0)*180/Math.PI);facing.setAttribute('aria-label','Facing in degrees');facing.onchange=()=>{const angle=Number(facing.value);if(Number.isFinite(angle))store.patch(path(`tokens/${id}`),{heading:angle*Math.PI/180}).catch(fail);};card.append(label,facing);container.append(card);
}}

// ---- Doors (live open/close of the published map) ----
function renderDoors(){
  const container=$('doors');container.replaceChildren();const doors=Object.entries(published?.doors||{});
  doors.forEach(([id,d],i)=>{const {x,y}=unkey(id);const closed=doorStates[id]??d.closed;const button=element('button',`Door ${i+1} (${x+1}, ${y+1}) · ${closed?'Closed':'Open'}`,'full');button.style.marginBottom='6px';button.onclick=()=>store.put(path(`doors/${id}`),!closed).catch(fail);container.append(button);});
  if(!doors.length)container.append(element('p',published?'No doors in the published map.':'Publish a map to control its doors.','small'));
}

// ---- Click-to-move in 3D ----
let down=null;world.renderer.domElement.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});world.renderer.domElement.addEventListener('pointerup',async e=>{if(!down||e.button!==0||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;down=null;try{if(!room)return;const hit=world.pick(e),m=editor.map;if(hit?.token){selected=hit.token;world.setTokens(tokens,selected);renderTokens();}else if(hit&&selected){await store.patch(path(`tokens/${selected}`),{x:Math.max(.05,Math.min(m.width-.05,hit.x)),z:Math.max(.05,Math.min(m.depth-.05,hit.z))});}}catch(e){fail(e);}});
updateInfo();
const previous=localStorage.getItem('multi-vtt-gm-room');if(previous)ready.then(()=>openRoom(previous)).catch(fail);
