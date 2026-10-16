const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
export function parseMap(data) {
  const r = data.resolution;
  if (!r || !point(r.map_size) || r.map_size.x <= 0 || r.map_size.y <= 0 || !Number.isFinite(r.pixels_per_grid) || r.pixels_per_grid <= 0) throw Error('Invalid DD2VTT resolution.');
  if (typeof data.image !== 'string' || !data.image.length) throw Error('The DD2VTT file has no embedded map image.');
  const origin = r.map_origin || {x:0,y:0};
  if (!point(origin)) throw Error('Invalid map origin.');
  const convert = p => { if (!point(p)) throw Error('Invalid wall or door coordinates.'); return {x:p.x-origin.x,y:p.y-origin.y}; };
  const walls = [];
  for (const line of [...(data.line_of_sight || []), ...(data.objects_line_of_sight || [])]) {
    for (let i=1;i<line.length;i++) walls.push([convert(line[i-1]),convert(line[i])]);
  }
  const doors = (data.portals || []).map((p,i) => {
    if (!Array.isArray(p.bounds) || p.bounds.length !== 2) throw Error('A portal is missing its two bounds.');
    return {id:String(i),bounds:p.bounds.map(convert),closed:p.closed !== false};
  });
  let image = data.image;
  if (!image.startsWith('data:image/')) {
    const prefix = image.slice(0,12);
    const mime = prefix.startsWith('UklGR') ? 'webp' : prefix.startsWith('/9j/') ? 'jpeg' : 'png';
    image = `data:image/${mime};base64,${image}`;
  }
  return {width:r.map_size.x,depth:r.map_size.y,pixelsPerGrid:r.pixels_per_grid,image,walls,doors};
}
export function demoMap() {
  const canvas = document.createElement('canvas'); canvas.width=768; canvas.height=576;
  const c=canvas.getContext('2d'); c.fillStyle='#55564e';c.fillRect(0,0,768,576);
  for(let y=0;y<12;y++)for(let x=0;x<16;x++){c.fillStyle=(x+y)%2?'#626257':'#595b51';c.fillRect(x*48+1,y*48+1,46,46);}
  c.fillStyle='#333b39';c.fillRect(48,48,240,144);c.fillRect(480,336,192,144);
  return {width:16,depth:12,pixelsPerGrid:48,image:canvas.toDataURL(),walls:[[{x:0,y:0},{x:16,y:0}],[{x:16,y:0},{x:16,y:12}],[{x:16,y:12},{x:0,y:12}],[{x:0,y:12},{x:0,y:0}],[{x:8,y:0},{x:8,y:5}],[{x:8,y:7},{x:8,y:12}]],doors:[{id:'0',bounds:[{x:8,y:5},{x:8,y:7}],closed:true}]};
}
