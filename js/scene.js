import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {normalizeMap,doorAxis,key,unkey} from './map.js';
import {assetUrl} from './assets.js';
export class World {
  constructor(element,viewer=false) {
    this.element=element;this.viewer=viewer;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#101813');
    this.camera=new THREE.PerspectiveCamera(viewer?75:50,1,0.025,2000);
    this.camera.position.set(14,20,22);
    this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;element.append(this.renderer.domElement);
    this.hemi=new THREE.HemisphereLight(0xe5f5df,0x3b4236,2.4);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xffffff,2);this.sun.position.set(10,30,15);this.scene.add(this.sun);
    this.mapGroup=new THREE.Group();this.tokenGroup=new THREE.Group();this.scene.add(this.mapGroup,this.tokenGroup);
    this.doorMeshes=new Map();this.textures=new Map();this.doorStates={};this.tokenMeshes=new Map();this.yaw=0;this.pitch=0;this.heading=0;this.eyeHeight=1.1;
    if(!viewer){this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(8,0,6);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI/2-0.04;}
    this.resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/Math.max(h,1);this.camera.updateProjectionMatrix();});this.resize.observe(element);
    this.renderer.setAnimationLoop(()=>{this.controls?.update();if(viewer)this.updateEye();this.renderer.render(this.scene,this.camera);});
  }
  clear(group){for(const child of [...group.children]){group.remove(child);child.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}o.dispose?.();});}}
  // Tile textures are cached for the page's lifetime and shared between instanced meshes.
  texture(path){if(!this.textures.has(path))this.textures.set(path,new THREE.TextureLoader().loadAsync(assetUrl(path)).then(t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=this.renderer.capabilities.getMaxAnisotropy();return t;}).catch(()=>null));return this.textures.get(path);}
  async loadMap(source,height=2.5) {
    const generation=(this.generation || 0)+1;this.generation=generation;
    const map=source?normalizeMap(source):null;
    const paths=map?[...new Set([...Object.values(map.floor),...Object.values(map.walls),...Object.values(map.doors).map(d=>d.asset)])]:[];
    const textures=new Map(await Promise.all(paths.map(async p=>[p,await this.texture(p)])));
    if(this.generation!==generation)return;
    this.clear(this.mapGroup);this.doorMeshes.clear();this.map=map;
    const lit=map&&Object.keys(map.lights).length>0;this.hemi.intensity=lit?.35:2.4;this.sun.intensity=lit?.15:2;
    if(!map)return;
    const material=path=>{const map=textures.get(path);return new THREE.MeshStandardMaterial(map?{map,roughness:.95}:{color:0x6b746c,roughness:.95});};
    const base=new THREE.Mesh(new THREE.PlaneGeometry(map.width,map.depth),new THREE.MeshStandardMaterial({color:0x151b17,roughness:1}));
    base.rotation.x=-Math.PI/2;base.position.set(map.width/2,-.01,map.depth/2);this.mapGroup.add(base);
    const floorGeometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
    // Wall sides repeat the texture once per grid unit of height instead of stretching it.
    const wallGeometry=new THREE.BoxGeometry(1,height,1),uv=wallGeometry.attributes.uv;
    for(const face of [0,1,4,5])for(let i=face*4;i<face*4+4;i++)uv.setY(i,uv.getY(i)*height);
    this.instances(map.floor,(path,count)=>new THREE.InstancedMesh(floorGeometry.clone(),material(path),count),0);
    this.instances(map.walls,(path,count)=>new THREE.InstancedMesh(wallGeometry.clone(),material(path),count),height/2);
    floorGeometry.dispose();wallGeometry.dispose();
    const doorHeight=Math.min(height,2.2);
    for(const [id,door] of Object.entries(map.doors)){
      const {x,y}=unkey(id),alongX=doorAxis(map,x,y)==='x';
      // The panel hangs from a hinge on the cell edge so opening swings it 90° instead of hiding it.
      const pivot=new THREE.Group();pivot.position.set(alongX?x:x+.5,0,alongX?y+.5:y);pivot.userData.base=alongX?0:-Math.PI/2;
      const panel=new THREE.Mesh(new THREE.BoxGeometry(.96,doorHeight,.1),material(door.asset));panel.position.set(.5,doorHeight/2,0);pivot.add(panel);
      this.mapGroup.add(pivot);this.doorMeshes.set(id,pivot);
      const lintelAsset=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([i,j])=>map.walls[key(i,j)]).find(Boolean);
      if(height>doorHeight+.01&&lintelAsset){const lintel=new THREE.Mesh(new THREE.BoxGeometry(1,height-doorHeight,1),material(lintelAsset));lintel.position.set(x+.5,(height+doorHeight)/2,y+.5);this.mapGroup.add(lintel);}
    }
    for(const [id,color] of Object.entries(map.lights)){
      const {x,y}=unkey(id),lift=Math.min(height*.8,1.8);
      const light=new THREE.PointLight(color,9,8,1.3);light.position.set(x+.5,lift,y+.5);this.mapGroup.add(light);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.07,12,8),new THREE.MeshBasicMaterial({color}));bulb.position.copy(light.position);this.mapGroup.add(bulb);
    }
    this.updateDoors(this.doorStates);
    if(!this.viewer){const size=Math.max(map.width,map.depth);this.controls.target.set(map.width/2,0,map.depth/2);this.camera.position.set(map.width/2+size*.6,size*1.1,map.depth/2+size*.8);this.camera.far=Math.max(2000,size*10);this.camera.updateProjectionMatrix();}
  }
  // One InstancedMesh per texture keeps a 100x100 map to a handful of draw calls.
  instances(layer,make,lift){
    const groups=new Map();for(const [id,path] of Object.entries(layer)){if(!groups.has(path))groups.set(path,[]);groups.get(path).push(unkey(id));}
    const matrix=new THREE.Matrix4();
    for(const [path,cells] of groups){const mesh=make(path,cells.length);cells.forEach(({x,y},i)=>mesh.setMatrixAt(i,matrix.makeTranslation(x+.5,lift,y+.5)));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.mapGroup.add(mesh);}
  }
  updateDoors(states={}){this.doorStates=states;for(const [id,pivot] of this.doorMeshes){const closed=states[id] ?? this.map?.doors[id]?.closed ?? true;pivot.rotation.y=pivot.userData.base+(closed?0:-Math.PI/2);}}
  setTokens(tokens={},selected='') {
    this.tokens=tokens;this.clear(this.tokenGroup);this.tokenMeshes.clear();
    for(const [id,t] of Object.entries(tokens)){
      const group=new THREE.Group();group.position.set(t.x,0,t.z);group.userData.token=id;
      const material=new THREE.MeshStandardMaterial({color:t.color || '#b9f778'});
      const body=new THREE.Mesh(new THREE.CylinderGeometry(.19,.28,.65,16),material);body.position.y=.4;group.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.2,16,12),material.clone());head.position.y=.94;group.add(head);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.34,.4,32),new THREE.MeshBasicMaterial({color:id===selected?'#ffffff':t.color,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.015;group.add(ring);
      const nose=new THREE.Mesh(new THREE.ConeGeometry(.1,.28,8),material.clone());nose.rotation.x=-Math.PI/2;nose.position.set(0,.85,-.28);group.add(nose);
      group.rotation.y=t.heading || 0;this.tokenGroup.add(group);this.tokenMeshes.set(id,group);
    }
    this.follow(this.followId);
  }
  follow(id){this.followId=id;for(const [key,group]of this.tokenMeshes)group.visible=!(this.viewer&&key===id);}
  updateEye(){const t=this.tokens?.[this.followId];if(!t)return;this.camera.position.set(t.x,this.eyeHeight,t.z);if(this.sensorQuaternion){this.camera.quaternion.copy(this.sensorQuaternion);this.camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(t.heading||0)+this.yaw));}else{this.camera.rotation.set(this.pitch,(t.heading||0)+this.yaw,0,'YXZ');}}
  pick(event){const rect=this.renderer.domElement.getBoundingClientRect();const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);const token=ray.intersectObjects(this.tokenGroup.children,true)[0];if(token){let o=token.object;while(o&&!o.userData.token)o=o.parent;return{token:o?.userData.token};}const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());return point&&this.map&&point.x>=0&&point.z>=0&&point.x<=this.map.width&&point.z<=this.map.depth?{x:point.x,z:point.z}:null;}
  enableDragLook(){let previous=null;const el=this.renderer.domElement;el.addEventListener('pointerdown',e=>{previous={x:e.clientX,y:e.clientY};el.setPointerCapture(e.pointerId);});el.addEventListener('pointermove',e=>{if(!previous)return;this.yaw-=(e.clientX-previous.x)*.006;this.pitch=THREE.MathUtils.clamp(this.pitch-(e.clientY-previous.y)*.006,-1.45,1.45);previous={x:e.clientX,y:e.clientY};});const end=()=>previous=null;el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);}
  setOrientation(event){if(event.alpha===null||event.beta===null||event.gamma===null)return;const r=THREE.MathUtils.degToRad;const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(r(event.beta),r(event.alpha),-r(event.gamma),'YXZ'));q.multiply(new THREE.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2));q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-r(screen.orientation?.angle ?? window.orientation ?? 0)));this.rawSensor=q;this.sensorQuaternion=q;}
  recenter(){this.pitch=0;const t=this.tokens?.[this.followId];if(this.rawSensor){const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.rawSensor);this.yaw=Math.atan2(forward.x,-forward.z);}else this.yaw=0;this.heading=t?.heading||0;}
}
