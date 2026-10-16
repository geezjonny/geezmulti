// Drawn maps: a grid of cells, each layer keyed by "x_y" (x = column, y = row; row becomes 3D z).
//   floor/walls: {key: 'floor/stone.png'}  doors: {key: {asset, closed}}  lights: {key: '#ffaa55'}
export const MAX_SIZE = 100, MAX_LIGHTS = 16, LAYERS = ['floor', 'walls', 'doors', 'lights'];
export const key = (x, y) => `${x}_${y}`;
export const unkey = k => { const [x, y] = k.split('_').map(Number); return {x, y}; };
const asset = v => typeof v === 'string' && /^(floor|wall|door)\/[^/\\]+\.png$/i.test(v);
const color = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const size = v => Number.isInteger(v) && v >= 1 && v <= MAX_SIZE;

export function emptyMap(width = 20, depth = 15) {
  if (!size(width) || !size(depth)) throw Error(`Map size must be 1–${MAX_SIZE} cells per side.`);
  return {version: 2, width, depth, floor: {}, walls: {}, doors: {}, lights: {}};
}

// Validates and copies a map, dropping out-of-bounds or malformed cells. Firebase omits empty objects,
// so missing layers are normal.
export function normalizeMap(source) {
  if (!source || source.version !== 2) throw Error('This session has an old imported map. Draw a new map and publish it.');
  const map = emptyMap(source.width, source.depth);
  const inside = k => { const {x, y} = unkey(k); return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.depth; };
  for (const [k, v] of Object.entries(source.floor || {})) if (inside(k) && asset(v)) map.floor[k] = v;
  for (const [k, v] of Object.entries(source.walls || {})) if (inside(k) && asset(v)) map.walls[k] = v;
  for (const [k, v] of Object.entries(source.doors || {})) if (inside(k) && !map.walls[k] && asset(v?.asset)) map.doors[k] = {asset: v.asset, closed: v.closed !== false};
  for (const [k, v] of Object.entries(source.lights || {})) if (inside(k) && color(v) && Object.keys(map.lights).length < MAX_LIGHTS) map.lights[k] = v.toLowerCase();
  return map;
}

export const resizeMap = (map, width, depth) => normalizeMap({...map, width, depth});

export const cellCount = map => LAYERS.reduce((n, layer) => n + Object.keys(map[layer] || {}).length, 0);

// A door panel spans its cell along x unless walls/doors sit only above or below it.
export function doorAxis(map, x, y) {
  const solid = (i, j) => !!(map.walls?.[key(i, j)] || map.doors?.[key(i, j)]);
  const sides = solid(x - 1, y) || solid(x + 1, y), ends = solid(x, y - 1) || solid(x, y + 1);
  return ends && !sides ? 'z' : 'x';
}

// Outline of all wall cells as merged straight segments, in grid units.
export function wallEdges(map) {
  const wall = (x, y) => !!map.walls[key(x, y)];
  const rows = new Map(), cols = new Map();
  const add = (bucket, line, from) => { if (!bucket.has(line)) bucket.set(line, []); bucket.get(line).push(from); };
  for (const k of Object.keys(map.walls)) {
    const {x, y} = unkey(k);
    if (!wall(x, y - 1)) add(rows, y, x);
    if (!wall(x, y + 1)) add(rows, y + 1, x);
    if (!wall(x - 1, y)) add(cols, x, y);
    if (!wall(x + 1, y)) add(cols, x + 1, y);
  }
  const segments = [];
  const merge = (bucket, toPoints) => {
    for (const [line, starts] of bucket) {
      starts.sort((a, b) => a - b);
      let begin = starts[0], end = begin + 1;
      for (const s of starts.slice(1)) { if (s === end) end++; else { segments.push(toPoints(line, begin, end)); begin = s; end = s + 1; } }
      segments.push(toPoints(line, begin, end));
    }
  };
  merge(rows, (y, a, b) => [{x: a, y}, {x: b, y}]);
  merge(cols, (x, a, b) => [{x, y: a}, {x, y: b}]);
  return segments;
}

// Universal VTT / DD2VTT export. imageBase64 is a baked PNG (no data: prefix) at pixelsPerGrid.
export function toDD2VTT(map, imageBase64, pixelsPerGrid) {
  return {
    format: 0.3,
    resolution: {map_origin: {x: 0, y: 0}, map_size: {x: map.width, y: map.depth}, pixels_per_grid: pixelsPerGrid},
    line_of_sight: wallEdges(map),
    objects_line_of_sight: [],
    portals: Object.entries(map.doors).map(([k, d]) => {
      const {x, y} = unkey(k), along = doorAxis(map, x, y) === 'x';
      return {
        position: {x: x + .5, y: y + .5},
        bounds: along ? [{x, y: y + .5}, {x: x + 1, y: y + .5}] : [{x: x + .5, y}, {x: x + .5, y: y + 1}],
        rotation: along ? 0 : Math.PI / 2, closed: d.closed, freestanding: false
      };
    }),
    environment: {baked_lighting: false, ambient_light: Object.keys(map.lights).length ? 'ff404040' : 'ffffffff'},
    lights: Object.entries(map.lights).map(([k, c]) => { const {x, y} = unkey(k); return {position: {x: x + .5, y: y + .5}, range: 6, intensity: 1, color: 'ff' + c.slice(1), shadows: true}; }),
    image: imageBase64
  };
}

// A 16 x 12 two-room dungeon drawn from the first available assets.
export function starterMap(assets) {
  const map = emptyMap(16, 12), floor = assets.floor[0], wall = assets.wall[0], door = assets.door[0];
  if (!floor || !wall || !door) throw Error('Add at least one floor, wall and door PNG to assets/ first.');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    const border = x === 0 || y === 0 || x === 15 || y === 11;
    if (border || x === 8) map.walls[key(x, y)] = wall; else map.floor[key(x, y)] = floor;
  }
  delete map.walls[key(8, 6)];
  map.floor[key(8, 6)] = floor;
  map.doors[key(8, 6)] = {asset: door, closed: true};
  map.lights[key(3, 3)] = '#ffb35c';
  map.lights[key(12, 8)] = '#7fb8ff';
  return map;
}
