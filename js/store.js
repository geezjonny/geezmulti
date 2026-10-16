import {firebaseConfig} from '../firebase-config.js';
export const localMode = !firebaseConfig.apiKey;
const makeId = () => crypto.randomUUID();
export async function connect() {
  if (localMode) return localStore();
  const [app,auth,db] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js')
  ]);
  const instance=app.initializeApp(firebaseConfig), a=auth.getAuth(instance), database=db.getDatabase(instance);
  await auth.setPersistence(a,auth.browserLocalPersistence);
  await a.authStateReady();
  const user=a.currentUser || (await auth.signInAnonymously(a)).user;
  return {uid:user.uid,
    get:async path=>(await db.get(db.ref(database,path))).val(),
    put:(path,value)=>db.set(db.ref(database,path),value),
    patch:(path,value)=>db.update(db.ref(database,path),value),
    watch:(path,callback,error)=>db.onValue(db.ref(database,path),s=>callback(s.val()),error)
  };
}
async function localStore() {
  let uid=localStorage.getItem('multi-vtt-uid');
  if(!uid){uid=makeId();localStorage.setItem('multi-vtt-uid',uid);}
  const database=await new Promise((resolve,reject)=>{const req=indexedDB.open('multi-vtt',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const read=()=>new Promise((resolve,reject)=>{const req=database.transaction('data').objectStore('data').get('root');req.onsuccess=()=>resolve(req.result || {});req.onerror=()=>reject(req.error);});
  const channel=new BroadcastChannel('multi-vtt'); const listeners=new Set();
  const at=(root,path)=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],root) ?? null;
  const notify=async()=>{const root=await read();listeners.forEach(l=>l.callback(at(root,l.path)));};
  channel.onmessage=notify;
  const mutate=(path,value,patch=false)=>new Promise((resolve,reject)=>{
    const transaction=database.transaction('data','readwrite'), table=transaction.objectStore('data'), request=table.get('root');
    request.onsuccess=()=>{const root=request.result || {};const keys=path.split('/').filter(Boolean);let node=root;for(const key of keys.slice(0,-1))node=node[key] ||= {};const key=keys.at(-1);if(patch)node[key]={...node[key],...value};else if(value===null)delete node[key];else node[key]=value;table.put(root,'root');};
    transaction.oncomplete=()=>{channel.postMessage('changed');notify();resolve();};transaction.onerror=()=>reject(transaction.error);
  });
  return {uid,get:async path=>at(await read(),path),put:mutate,patch:(p,v)=>mutate(p,v,true),watch:(path,callback,error)=>{const l={path,callback};listeners.add(l);read().then(root=>callback(at(root,path))).catch(error);return()=>listeners.delete(l);}};
}
