// Lists the PNG tiles in assets/floor, assets/wall and assets/door.
// A local dev server's folder listing is read first so new PNGs appear on reload;
// otherwise (GitHub Pages) assets/assets.json is used — rebuild it with `npm run assets`.
const LAYERS = ['floor', 'wall', 'door'];
async function fromListing(layer) {
  const response = await fetch(`assets/${layer}/`, {cache: 'no-store'});
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return null;
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const names = [...doc.querySelectorAll('a[href]')].map(a => decodeURIComponent(a.getAttribute('href'))).filter(h => /^[^/?#]+\.png$/i.test(h));
  return names.length ? names.sort().map(n => `${layer}/${n}`) : null;
}
export async function listAssets() {
  let manifest = {};
  try { manifest = await (await fetch('assets/assets.json', {cache: 'no-store'})).json(); } catch {}
  const result = {};
  for (const layer of LAYERS) {
    let listed = null;
    try { listed = await fromListing(layer); } catch {}
    result[layer] = listed || manifest[layer] || [];
  }
  return result;
}
export const assetUrl = path => `assets/${path.split('/').map(encodeURIComponent).join('/')}`;
export const assetLabel = path => path.split('/').pop().replace(/\.png$/i, '').replace(/[-_]+/g, ' ');
