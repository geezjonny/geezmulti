import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyMap, normalizeMap, resizeMap, doorAxis, wallEdges, toDD2VTT, starterMap, cellCount, key, MAX_LIGHTS} from '../js/map.js';
const assets = {floor: ['floor/stone.png'], wall: ['wall/brick.png'], door: ['door/wood.png']};

test('normalizeMap keeps valid cells and fills layers Firebase dropped', () => {
  const map = normalizeMap({version: 2, width: 4, depth: 3, floor: {'0_0': 'floor/stone.png'}});
  assert.deepEqual(map, {version: 2, width: 4, depth: 3, floor: {'0_0': 'floor/stone.png'}, walls: {}, doors: {}, lights: {}});
});

test('normalizeMap drops out-of-bounds, malformed and conflicting cells', () => {
  const map = normalizeMap({version: 2, width: 3, depth: 3,
    floor: {'3_0': 'floor/stone.png', '0_-1': 'floor/stone.png', 'a_b': 'floor/stone.png', '1_1': '../secret.png', '0_0': 'floor/x.jpg', '2_2': 'floor/ok tile (2).png'},
    walls: {'1_0': 'wall/brick.png'},
    doors: {'1_0': {asset: 'door/wood.png'}, '1_1': {asset: 'door/wood.png', closed: false}},
    lights: {'0_0': '#FFAA00', '0_1': 'red'}});
  assert.deepEqual(map.floor, {'2_2': 'floor/ok tile (2).png'});
  assert.deepEqual(map.doors, {'1_1': {asset: 'door/wood.png', closed: false}}, 'a door cannot share a cell with a wall');
  assert.deepEqual(map.lights, {'0_0': '#ffaa00'});
});

test('rejects old imported maps and invalid sizes', () => {
  assert.throws(() => normalizeMap({width: 10, depth: 10, image: 'data:image/png;base64,'}), /old imported map/);
  assert.throws(() => emptyMap(0, 5));
  assert.throws(() => emptyMap(101, 5));
  assert.throws(() => emptyMap(2.5, 5));
});

test('light count is capped', () => {
  const lights = Object.fromEntries(Array.from({length: 30}, (_, i) => [key(i, 0), '#ffffff']));
  assert.equal(Object.keys(normalizeMap({version: 2, width: 30, depth: 1, lights}).lights).length, MAX_LIGHTS);
});

test('resizing trims cells outside the new edge', () => {
  const map = starterMap(assets), small = resizeMap(map, 5, 5);
  assert.equal(small.width, 5);
  assert.ok(cellCount(small) < cellCount(map));
  assert.ok(Object.keys(small.walls).every(k => k.split('_').every(n => Number(n) < 5)));
});

test('door panels follow the walls around them', () => {
  const map = emptyMap(5, 5);
  map.walls[key(2, 1)] = map.walls[key(2, 3)] = 'wall/brick.png';
  assert.equal(doorAxis(map, 2, 2), 'z', 'walls above and below: panel runs along z');
  map.walls[key(1, 2)] = 'wall/brick.png';
  assert.equal(doorAxis(map, 2, 2), 'x', 'any side wall wins');
  assert.equal(doorAxis(emptyMap(3, 3), 1, 1), 'x', 'free-standing defaults to x');
});

test('wall outline merges straight runs', () => {
  const map = emptyMap(5, 5);
  for (const x of [1, 2, 3]) map.walls[key(x, 1)] = 'wall/brick.png';
  const edges = wallEdges(map);
  assert.equal(edges.length, 4, 'a 3x1 bar is one rectangle');
  assert.deepEqual(edges.find(([a, b]) => a.y === 1 && b.y === 1), [{x: 1, y: 1}, {x: 4, y: 1}]);
});

test('DD2VTT export describes walls, portals and lights in grid units', () => {
  const map = starterMap(assets), out = toDD2VTT(map, 'iVBORw0KGgo', 64);
  assert.deepEqual(out.resolution, {map_origin: {x: 0, y: 0}, map_size: {x: 16, y: 12}, pixels_per_grid: 64});
  assert.equal(out.portals.length, 1);
  assert.deepEqual(out.portals[0].bounds, [{x: 8.5, y: 6}, {x: 8.5, y: 7}], 'door in a vertical wall spans the cell vertically');
  assert.equal(out.lights.length, 2);
  assert.equal(out.lights[0].color, 'ffffb35c');
  assert.ok(out.line_of_sight.length > 0);
  for (const [a, b] of out.line_of_sight) assert.ok(a.x === b.x || a.y === b.y, 'grid walls are axis-aligned');
  assert.equal(out.image, 'iVBORw0KGgo');
});

test('starter map needs one asset of each kind', () => {
  assert.throws(() => starterMap({floor: [], wall: ['wall/a.png'], door: ['door/a.png']}), /assets/);
});
