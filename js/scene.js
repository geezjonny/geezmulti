import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export class World {
  constructor(element,viewer=false) {
    this.element=element;this.viewer=viewer;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#101813');
    this.camera=new THREE.PerspectiveCamera(viewer?75:50,1,0.025,2000);
    this.camera.position.set(14,20,22);
    this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;element.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xe5f5df,0x3b4236,2.4));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(10,30,15);this.scene.add(light);
    this.mapGroup=new THREE.Group();this.tokenGroup=new THREE.Group();this.scene.add(this.mapGroup,this.tokenGroup);
    this.doorMeshes=new Map();this.tokenMeshes=new Map();this.yaw=0;this.pitch=0;this.heading=0;this.eyeHeight=1.1;
    if(!viewer){this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(8,0,6);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI/2-0.04;}
    this.resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/Math.max(h,1);this.camera.updateProjectionMatrix();});this.resize.observe(element);
    this.renderer.setAnimationLoop(()=>{this.controls?.update();if(viewer)this.updateEye();this.renderer.render(this.scene,this.camera);});
  }
  clear(group){for(const child of [...group.children]){group.remove(child);child.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});}}
  async loadMap(map,height=2.5) {
    const generation=(this.generation || 0)+1;this.generation=generation;
    if(!map){this.clear(this.mapGroup);this.floor=null;this.map=null;this.doorMeshes.clear();return;}
    const texture=await new THREE.TextureLoader().loadAsync(map.image);
    if(this.generation!==generation){texture.dispose();return;}
    this.clear(this.mapGroup);this.doorMeshes.clear();this.map=map;
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
    this.floor=new THREE.Mesh(new THREE.PlaneGeometry(map.width,map.depth),new THREE.MeshStandardMaterial({map:texture,roughness:1}));
    this.floor.rotation.x=-Math.PI/2;this.floor.position.set(map.width/2,0,map.depth/2);this.mapGroup.add(this.floor);
    for(const pair of map.walls || [])this.segment(pair,height,0x8b9588,0.09);
    for(const door of map.doors || []){const mesh=this.segment(door.bounds,height*.9,0x9b6b3f,0.13);if(mesh){mesh.visible=door.closed;this.doorMeshes.set(door.id,mesh);}}
    if(!this.viewer){const size=Math.max(map.width,map.depth);this.controls.target.set(map.width/2,0,map.depth/2);this.camera.position.set(map.width/2+size*.6,size*1.1,map.depth/2+size*.8);this.camera.far=Math.max(2000,size*10);this.camera.updateProjectionMatrix();}
  }
  segment([a,b],height,color,thickness) {
    const dx=b.x-a.x,dz=b.y-a.y,length=Math.hypot(dx,dz);if(length<0.0001)return null;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(length,height,thickness),new THREE.MeshStandardMaterial({color,roughness:.9}));
    mesh.position.set((a.x+b.x)/2,height/2,(a.y+b.y)/2);mesh.rotation.y=-Math.atan2(dz,dx);this.mapGroup.add(mesh);return mesh;
  }
  updateDoors(states={}){for(const [id,mesh] of this.doorMeshes){mesh.visible=states[id] ?? this.map?.doors.find(d=>d.id===id)?.closed ?? true;}}
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
  pick(event){const rect=this.renderer.domElement.getBoundingClientRect();const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);const token=ray.intersectObjects(this.tokenGroup.children,true)[0];if(token){let o=token.object;while(o&&!o.userData.token)o=o.parent;return{token:o?.userData.token};}const hit=this.floor&&ray.intersectObject(this.floor)[0];return hit?{x:hit.point.x,z:hit.point.z}:null;}
  enableDragLook(){let previous=null;const el=this.renderer.domElement;el.addEventListener('pointerdown',e=>{previous={x:e.clientX,y:e.clientY};el.setPointerCapture(e.pointerId);});el.addEventListener('pointermove',e=>{if(!previous)return;this.yaw-=(e.clientX-previous.x)*.006;this.pitch=THREE.MathUtils.clamp(this.pitch-(e.clientY-previous.y)*.006,-1.45,1.45);previous={x:e.clientX,y:e.clientY};});const end=()=>previous=null;el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);}
  setOrientation(event){if(event.alpha===null||event.beta===null||event.gamma===null)return;const r=THREE.MathUtils.degToRad;const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(r(event.beta),r(event.alpha),-r(event.gamma),'YXZ'));q.multiply(new THREE.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2));q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-r(screen.orientation?.angle ?? window.orientation ?? 0)));this.rawSensor=q;this.sensorQuaternion=q;}
  recenter(){this.pitch=0;const t=this.tokens?.[this.followId];if(this.rawSensor){const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.rawSensor);this.yaw=Math.atan2(forward.x,-forward.z);}else this.yaw=0;this.heading=t?.heading||0;}
}
