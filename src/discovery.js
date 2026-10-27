import { requireValue } from './errors.js';
import { data, fields, text } from './description-data.js';
import { getCapabilities, createCapabilities } from './capabilities.js';
import { getMetadata, createMetadata } from './metadata.js';

export const DISCOVERY_VERSION = 'oriel-artwork/1.0';
export const DISCOVERY_MEDIA_TYPE = 'application/vnd.oriel.artwork+json';

/** Accept plain JSON or its parsed data; never imports or executes artwork code. */
export function parseDiscovery(input) {
  if (typeof input === 'string') {
    // UTF-16 length is a lower bound on UTF-8 bytes; reject huge strings before encoding.
    requireValue(input.length <= 49152, 'Discovery exceeds byte limit', 'LIMIT');
    requireValue(new TextEncoder().encode(input).length <= 49152, 'Discovery exceeds byte limit', 'LIMIT');
    try { input = JSON.parse(input); } catch { requireValue(false, 'Invalid discovery JSON'); }
  }
  const value = data(input, 49152);
  fields(value, ['schemaVersion', 'artwork', 'metadata', 'capabilities'], 'discovery');
  requireValue(value.schemaVersion === DISCOVERY_VERSION, 'Unsupported discovery schema version');
  fields(value.artwork, ['id', 'version'], 'artwork');
  text(value.artwork.id, 'artwork id', 100); text(value.artwork.version, 'artwork version', 300);
  requireValue(value.metadata !== undefined || value.capabilities !== undefined, 'Discovery requires metadata or capabilities');
  if (value.metadata !== undefined) value.metadata = getMetadata(value.metadata);
  if (value.capabilities !== undefined) value.capabilities = getCapabilities(value.capabilities);
  return value;
}
export function serializeDiscovery(input) {
  // Also safe to embed inside a non-executable application/json script element.
  const json = JSON.stringify(parseDiscovery(input)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  requireValue(new TextEncoder().encode(json).length <= 49152, 'Serialized discovery exceeds byte limit', 'LIMIT');
  return json;
}
export function createDiscovery(description, options) {
  const manifest = parseDiscovery(description);
  requireValue(!options?.evaluate || manifest.capabilities !== undefined, 'Evaluation requires capabilities');
  return Object.freeze({ getDiscovery: () => data(manifest, 49152),
    ...(manifest.metadata ? createMetadata(manifest.metadata) : {}),
    ...(manifest.capabilities ? createCapabilities(manifest.capabilities, options) : {}) });
}

/** Opt-in queries use the existing bridge and its origin/session/size checks. */
export function registerDiscovery(artwork, discovery) {
  const manifest = parseDiscovery(discovery.getDiscovery());
  requireValue(manifest.artwork.id === artwork.id && manifest.artwork.version === artwork.version, 'Discovery belongs to a different artwork version');
  // Capture validated data; a caller cannot inject handlers through a provider.
  const provider = createDiscovery(manifest);
  const queries = { discovery: provider.getDiscovery,
    ...(manifest.metadata ? { metadata: provider.getMetadata, provenance: provider.getProvenanceReferences } : {}),
    ...(manifest.capabilities ? { capabilities: provider.getCapabilities } : {}) };
  const current = artwork.manifest().queries;
  for (const name of Object.keys(queries)) requireValue(!Object.hasOwn(current, name), `Duplicate discovery query: ${name}`);
  const remove = [];
  try {
    for (const [name, handler] of Object.entries(queries)) remove.push(artwork.registerQuery(name, { description: `Oriel ${name} (1.0)`, handler }));
  } catch (error) { remove.forEach(fn => fn()); throw error; }
  let active = true;
  return () => { if (active) { active = false; remove.forEach(fn => fn()); } };
}
