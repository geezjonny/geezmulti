// Writes assets/assets.json listing every PNG in assets/floor, assets/wall and assets/door.
// GitHub Pages cannot list folders, so the editor reads this manifest. Rerun after adding PNGs.
import {readdirSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..', 'assets');
const manifest = {};
for (const layer of ['floor', 'wall', 'door']) {
  const dir = resolve(root, layer);
  manifest[layer] = existsSync(dir) ? readdirSync(dir).filter(f => /\.png$/i.test(f)).sort().map(f => `${layer}/${f}`) : [];
}
writeFileSync(resolve(root, 'assets.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(Object.entries(manifest).map(([k, v]) => `${k}: ${v.length}`).join(' · '));
