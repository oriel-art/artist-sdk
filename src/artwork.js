import { createRandom, RANDOM_VERSION } from './random.js';
import { resolveParameters, validateParameters, validateInput } from './parameters.js';
import { ArtworkError, requireValue, copy, identifier, object } from './errors.js';

export const SDK_VERSION = '0.1.0-alpha.1';
export const RECIPE_VERSION = '0.1';

export function createArtwork({ id, version, seed, parameters = {}, values = {}, mode = 'studio', traits = () => ({}), events = [] }) {
  identifier(id);
  requireValue(typeof version === 'string' && version.length > 0, 'Artwork version is required');
  requireValue(['studio', 'published'].includes(mode), 'Invalid artwork mode');
  const definitions = copy(parameters);
  const eventNames = new Set(['state.changed', ...events.map(identifier)]);
  let resolved = resolveParameters(definitions, seed, values);
  let revision = 0;
  const listeners = new Set();
  const commands = new Map();
  const queries = new Map();
  const traitValues = values => {
    const result = traits(values);
    requireValue(object(result) && Object.values(result).every(v =>
      ['string', 'boolean'].includes(typeof v) || typeof v === 'number' && Number.isFinite(v)), 'Traits must be finite numbers, strings, or booleans');
    return copy(result);
  };
  let computedTraits = traitValues(resolved);
  const recipe = () => ({ format: RECIPE_VERSION, artworkId: id, artworkVersion: version,
    randomVersion: RANDOM_VERSION, seed, parameters: { ...resolved } });
  const state = () => ({ revision, mode, parameters: { ...resolved }, traits: copy(computedTraits) });
  const emit = (type, detail = {}) => {
    identifier(type);
    requireValue(eventNames.has(type), `Undeclared event: ${type}`);
    const event = { type, revision, detail: copy(detail) };
    for (const listener of listeners) {
      try { listener(copy(event)); } catch (error) { console.error('Artwork event listener failed', error); }
    }
  };
  const register = (map, name, definition) => {
    identifier(name);
    requireValue(!map.has(name) && typeof definition?.handler === 'function', `Invalid or duplicate operation: ${name}`);
    map.set(name, { description: definition.description ?? name, input: copy(definition.input ?? {}), handler: definition.handler });
    return () => map.delete(name);
  };
  const api = {
    id, version, seed, mode,
    get parameters() { return resolved; },
    get revision() { return revision; },
    random: stream => createRandom(seed, stream),
    getState: state,
    getRecipe: recipe,
    setParameters(patch) {
      requireValue(mode === 'studio', 'Parameters are locked in published mode', 'FORBIDDEN');
      validateParameters(definitions, patch, true);
      const next = validateParameters(definitions, { ...resolved, ...patch });
      const nextTraits = traitValues(next);
      resolved = next;
      computedTraits = nextTraits;
      revision++;
      emit('state.changed', state());
      return state();
    },
    manifest() {
      const describe = map => Object.fromEntries([...map].map(([name, d]) => [name, { description: d.description, input: copy(d.input) }]));
      return { protocol: 'artist-bridge/0.1', sdkVersion: SDK_VERSION, id, version, mode,
        parameters: copy(definitions), events: [...eventNames], commands: describe(commands), queries: describe(queries) };
    },
    registerCommand: (name, definition) => register(commands, name, definition),
    registerQuery: (name, definition) => register(queries, name, definition),
    async command(name, input = {}) {
      const d = commands.get(name);
      if (!d) throw new ArtworkError('UNSUPPORTED', `Unknown command: ${name}`);
      return await d.handler(validateInput(d.input, input));
    },
    async query(name, input = {}) {
      const d = queries.get(name);
      if (!d) throw new ArtworkError('UNSUPPORTED', `Unknown query: ${name}`);
      return await d.handler(validateInput(d.input, input));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    emit,
    changed(detail = {}) { revision++; emit('state.changed', detail); }
  };
  api.registerQuery('state', { handler: state, description: 'Current parameters, traits, and revision' });
  api.registerQuery('recipe', { handler: recipe, description: 'Portable canonical inputs' });
  return Object.freeze(api);
}

/** Import requires an exact artist code version and the original parameter definitions. */
export function fromRecipe(recipe, options) {
  requireValue(object(recipe) && recipe.format === RECIPE_VERSION && recipe.randomVersion === RANDOM_VERSION,
    'Unsupported recipe or random algorithm version');
  requireValue(recipe.artworkId === options.id && recipe.artworkVersion === options.version, 'Recipe belongs to a different artwork version');
  validateParameters(options.parameters ?? {}, recipe.parameters);
  return createArtwork({ ...options, seed: recipe.seed, values: recipe.parameters });
}
