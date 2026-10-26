import { RANDOM_VERSION } from './random.js';
import { copy, identifier, object, requireValue, seedValue, synchronous } from './errors.js';

export const RECIPE_VERSION = '0.2';

// Artist context is data, never executable code. Reject lossy JSON conversions.
export function jsonContext(data) {
  const visit = (value, depth) => {
    requireValue(depth <= 16, 'Recipe context is too deeply nested');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { requireValue(Number.isFinite(value), 'Recipe context numbers must be finite'); return; }
    requireValue(Array.isArray(value) || object(value), 'Recipe context must contain only JSON data');
    requireValue(Object.getOwnPropertySymbols(value).length === 0, 'Recipe context cannot contain symbol keys');
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, depth + 1);
  };
  requireValue(object(data), 'Recipe context data must be an object');
  visit(data, 0);
  requireValue(new TextEncoder().encode(JSON.stringify(data)).length <= 16384, 'Recipe context exceeds 16 KiB');
  return copy(data);
}

export function contextEnvelope(data, contract) {
  requireValue(object(contract) && typeof contract.validate === 'function', 'Recipe context requires an artist validation contract');
  identifier(contract.id);
  requireValue(typeof contract.version === 'string' && contract.version.length > 0 && contract.version.length <= 100, 'Context version is required');
  const snapshot = jsonContext(data);
  const result = synchronous(contract.validate(copy(snapshot)), 'Context validation');
  requireValue(result === true, typeof result === 'string' ? result : 'Invalid artwork recipe context');
  return { id: contract.id, version: contract.version, data: snapshot };
}

export function readContext(envelope, contract) {
  requireValue(object(envelope) && envelope.id === contract?.id && envelope.version === contract?.version,
    'Unsupported recipe context schema or version');
  return contextEnvelope(envelope.data, contract);
}

export function validateGenerator(generator) {
  requireValue(object(generator) && ['sdk', 'artist'].includes(generator.kind), 'Invalid recipe generator');
  identifier(generator.id);
  requireValue(typeof generator.version === 'string' && generator.version.length > 0 && generator.version.length <= 100, 'Invalid generator version');
  if (generator.kind === 'sdk') requireValue(generator.id === 'artist-sdk-parameters' && generator.version === RANDOM_VERSION, 'Unsupported SDK generator');
  return { kind: generator.kind, id: generator.id, version: generator.version };
}

export function makeRecipe({ id, version, seed, parameters, generator, context }) {
  identifier(id); seedValue(seed);
  requireValue(typeof version === 'string' && version.length > 0, 'Artwork version is required');
  return { format: RECIPE_VERSION, artworkId: id, artworkVersion: version, randomVersion: RANDOM_VERSION,
    generator: validateGenerator(generator), seed, parameters: copy(parameters), ...(context === undefined ? {} : { context: copy(context) }) };
}
