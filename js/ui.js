export const $=id=>document.getElementById(id);
let timer;
export function message(text,error=false){let el=$('message');if(!el){el=document.createElement('div');el.id='message';el.setAttribute('role','status');document.body.append(el);}el.className='message'+(error?' error':'');el.textContent=text;el.hidden=false;clearTimeout(timer);timer=setTimeout(()=>el.hidden=true,error?10000:4500);}
export const fail=e=>{console.error(e);message(e.message || String(e),true);};
export function action(id,fn){$(id).addEventListener('click',async()=>{const button=$(id);button.disabled=true;try{await fn();}catch(e){fail(e);}finally{button.disabled=false;}});}
export function validRoom(value){const room=value.trim();if(!/^[a-zA-Z0-9_-]{4,48}$/.test(room))throw Error('Use a session code of 4–48 letters, digits, underscores or dashes.');return room;}
export function listenConnection(store){if(store.local){$('status').textContent='LOCAL DEMO · same browser only';return;}store.watch('.info/connected',connected=>{$('status').textContent=connected?'FIREBASE · connected':'FIREBASE · offline / reconnecting';},fail);}
export function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
