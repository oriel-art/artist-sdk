import { readFile } from 'node:fs/promises';
import { createArtwork } from '../../src/index.js';
import { parseDiscovery, createDiscovery, registerDiscovery } from '../../src/discovery.js';
import { validateRequest } from '../../src/capabilities.js';
import { resolveLocalizedText } from '../../src/metadata.js';

// Static inspection reads data only. No artwork module needs to be imported by a crawler.
const manifest = parseDiscovery(await readFile(new URL('./artwork.json', import.meta.url), 'utf8'));
const request = { width: 2400, height: 2400, format: 'image/png',
  print: { width: 8, height: 8, unit: 'in', dpi: 300 } };
console.log('Title:', resolveLocalizedText(manifest.metadata.project.title, 'fr'));
console.log('Static decision:', validateRequest(manifest.capabilities, request));

// Runtime evaluation is explicitly installed by the artist. A real renderer can
// check its device/memory availability here without drawing or changing state.
const discovery = createDiscovery(manifest, { evaluate: async request => ({
  supported: request.width * request.height <= 8_000_000,
  reasons: ['This example runtime has an eight-million-pixel budget.']
}) });
const art = createArtwork({ ...manifest.artwork, seed: 'edition-7' });
const unregister = registerDiscovery(art, discovery);
console.log('Runtime decision:', await discovery.evaluateRequest(request));
console.log('Bridge query title:', (await art.query('metadata')).project.title);
console.log('Artist constraint:', discovery.validateRequest({ width: 600, height: 400, format: 'image/png' }));
unregister();
