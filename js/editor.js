// Top-down painter for drawn maps. Left-drag paints the active layer, right-drag (or erase mode) clears it,
// wheel zooms, middle-drag or Alt-drag pans.
import {emptyMap, key, unkey, doorAxis, MAX_LIGHTS} from './map.js';
import {assetUrl} from './assets.js';
const LAYER = {floor: 'floor', wall: 'walls', door: 'doors', light: 'lights'};
export class MapEditor {
  constructor(stage, {onEdit, onError}) {
    this.canvas = document.createElement('canvas'); this.canvas.className = 'editor-canvas'; stage.append(this.canvas);
    this.ctx = this.canvas.getContext('2d'); this.onEdit = onEdit; this.onError = onError;
    this.map = emptyMap(); this.tool = 'floor'; this.assets = {floor: '', wall: '', door: ''}; this.lightColor = '#ffb35c'; this.erase = false;
    this.images = new Map(); this.view = {scale: 32, ox: 0, oy: 0}; this.hover = null; this.stroke = null; this.pan = null;
    new ResizeObserver(() => this.fit()).observe(this.canvas);
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => this.down(e));
    c.addEventListener('pointermove', e => this.move(e));
    for (const type of ['pointerup', 'pointercancel']) c.addEventListener(type, () => this.up());
    c.addEventListener('pointerleave', () => { this.hover = null; this.render(); });
    c.addEventListener('wheel', e => this.zoom(e), {passive: false});
  }
  image(path) {
    if (!this.images.has(path)) { const img = new Image(); img.onload = () => this.render(); img.src = assetUrl(path); this.images.set(path, img); }
    return this.images.get(path);
  }
  setMap(map) { this.map = map; this.fit(); }
  fit() {
    const {clientWidth: w, clientHeight: h} = this.canvas; if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio, 2); this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    const scale = Math.max(4, Math.min((w - 48) / this.map.width, (h - 96) / this.map.depth, 96));
    this.view = {scale, ox: (w - this.map.width * scale) / 2, oy: (h - this.map.depth * scale) / 2 + 12};
    this.render();
  }
  cellAt(e) {
    const r = this.canvas.getBoundingClientRect(), {scale, ox, oy} = this.view;
    const x = Math.floor((e.clientX - r.left - ox) / scale), y = Math.floor((e.clientY - r.top - oy) / scale);
    return x >= 0 && y >= 0 && x < this.map.width && y < this.map.depth ? {x, y} : null;
  }
  down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.altKey) { this.pan = {x: e.clientX, y: e.clientY}; return; }
    if (e.button !== 0 && e.button !== 2) return;
    this.stroke = {erase: e.button === 2 || this.erase, last: null, changed: false};
    this.move(e);
  }
  move(e) {
    if (this.pan) { this.view.ox += e.clientX - this.pan.x; this.view.oy += e.clientY - this.pan.y; this.pan = {x: e.clientX, y: e.clientY}; this.render(); return; }
    const cell = this.cellAt(e); this.hover = cell;
    if (this.stroke && cell && !(this.stroke.last && this.tool === 'light')) {
      // Fill every cell between pointer samples so fast drags leave no gaps.
      const from = this.stroke.last || cell, steps = Math.max(Math.abs(cell.x - from.x), Math.abs(cell.y - from.y), 1);
      try { for (let i = 0; i <= steps; i++) this.stroke.changed = this.paint(Math.round(from.x + (cell.x - from.x) * i / steps), Math.round(from.y + (cell.y - from.y) * i / steps), this.stroke.erase) || this.stroke.changed; }
      catch (error) { this.stroke = null; this.onError(error); }
      if (this.stroke) this.stroke.last = cell;
    }
    this.render();
  }
  up() {
    if (this.stroke?.changed) this.onEdit(this.map);
    this.stroke = null; this.pan = null;
  }
  zoom(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, v = this.view;
    const scale = Math.max(4, Math.min(160, v.scale * Math.exp(-e.deltaY * .0015)));
    v.ox = px - (px - v.ox) * scale / v.scale; v.oy = py - (py - v.oy) * scale / v.scale; v.scale = scale;
    this.render();
  }
  // Returns true when the cell changed.
  paint(x, y, erase) {
    const k = key(x, y), layer = this.map[LAYER[this.tool]];
    if (erase) { if (!(k in layer)) return false; delete layer[k]; return true; }
    if (this.tool === 'light') {
      if (layer[k] === this.lightColor) return false;
      if (!(k in layer) && Object.keys(layer).length >= MAX_LIGHTS) throw Error(`Maps are limited to ${MAX_LIGHTS} lights so phones stay smooth.`);
      layer[k] = this.lightColor; return true;
    }
    const asset = this.assets[this.tool];
    if (!asset) throw Error(`Choose a ${this.tool} tile first.`);
    if (this.tool === 'door') {
      if (layer[k]?.asset === asset) return false;
      delete this.map.walls[k]; layer[k] = {asset, closed: true}; return true;
    }
    if (layer[k] === asset) return false;
    if (this.tool === 'wall') delete this.map.doors[k];
    layer[k] = asset; return true;
  }
  draw(ctx, map, scale, ox, oy, overlay) {
    const rect = k => { const {x, y} = unkey(k); return [ox + x * scale, oy + y * scale]; };
    const tile = (path, x, y, w, h) => { const img = this.image(path); if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h); else { ctx.fillStyle = '#4b544c'; ctx.fillRect(x, y, w, h); } };
    // Overdraw tiles by a hair so the canvas never shows seams between neighbouring cells.
    const pad = overlay ? .5 : 0;
    for (const [k, path] of Object.entries(map.floor)) { const [x, y] = rect(k); tile(path, x, y, scale + pad, scale + pad); }
    for (const [k, path] of Object.entries(map.walls)) {
      const [x, y] = rect(k); tile(path, x, y, scale + pad, scale + pad);
      if (overlay) { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, scale - 1, scale - 1); }
    }
    for (const [k, door] of Object.entries(map.doors)) {
      const {x: cx, y: cy} = unkey(k), [x, y] = rect(k), t = scale * .3;
      if (doorAxis(map, cx, cy) === 'x') tile(door.asset, x, y + (scale - t) / 2, scale, t); else tile(door.asset, x + (scale - t) / 2, y, t, scale);
      if (overlay) { ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 2, y + 2, scale - 4, scale - 4); }
    }
    if (!overlay) return;
    for (const [k, c] of Object.entries(map.lights)) {
      const [x, y] = rect(k), mx = x + scale / 2, my = y + scale / 2, glow = ctx.createRadialGradient(mx, my, 0, mx, my, scale * 3);
      glow.addColorStop(0, c + '66'); glow.addColorStop(1, c + '00'); ctx.fillStyle = glow; ctx.fillRect(mx - scale * 3, my - scale * 3, scale * 6, scale * 6);
      ctx.beginPath(); ctx.arc(mx, my, Math.max(3, scale * .18), 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  render() {
    const ctx = this.ctx, dpr = this.canvas.width / Math.max(this.canvas.clientWidth, 1), {scale, ox, oy} = this.view, m = this.map;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = scale < 64;
    ctx.fillStyle = '#0d120f'; ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    ctx.fillStyle = '#18201b'; ctx.fillRect(ox, oy, m.width * scale, m.depth * scale);
    this.draw(ctx, m, scale, ox, oy, true);
    if (scale >= 8) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
      for (let x = 0; x <= m.width; x++) { ctx.moveTo(Math.round(ox + x * scale) + .5, oy); ctx.lineTo(Math.round(ox + x * scale) + .5, oy + m.depth * scale); }
      for (let y = 0; y <= m.depth; y++) { ctx.moveTo(ox, Math.round(oy + y * scale) + .5); ctx.lineTo(ox + m.width * scale, Math.round(oy + y * scale) + .5); }
      ctx.stroke();
    }
    ctx.strokeStyle = '#3d4a41'; ctx.lineWidth = 1; ctx.strokeRect(ox - .5, oy - .5, m.width * scale + 1, m.depth * scale + 1);
    if (this.hover) {
      ctx.strokeStyle = this.erase ? '#f08a8a' : this.tool === 'light' ? this.lightColor : '#b9f778'; ctx.lineWidth = 2;
      ctx.strokeRect(ox + this.hover.x * scale + 1, oy + this.hover.y * scale + 1, scale - 2, scale - 2);
    }
  }
  // Flattens floor, walls and doors into one PNG for DD2VTT export; returns base64 without the data: prefix.
  async bake(pixelsPerGrid = 64) {
    const m = this.map, paths = new Set([...Object.values(m.floor), ...Object.values(m.walls), ...Object.values(m.doors).map(d => d.asset)]);
    await Promise.all([...paths].map(p => this.image(p).decode().catch(() => {})));
    const canvas = document.createElement('canvas'); canvas.width = m.width * pixelsPerGrid; canvas.height = m.depth * pixelsPerGrid;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#18201b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.draw(ctx, m, pixelsPerGrid, 0, 0, false);
    return canvas.toDataURL('image/png').split(',')[1];
  }
}
