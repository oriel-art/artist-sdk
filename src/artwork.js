import { createRandom, RANDOM_VERSION } from './random.js';
import { resolveWith, generatorIdentity, validateParameters, validateInput } from './parameters.js';
import { ArtworkError, requireValue, copy, identifier, object } from './errors.js';
import { RECIPE_VERSION, makeRecipe, contextEnvelope, readContext, validateGenerator } from './recipe.js';

export const SDK_VERSION = '0.1.0-alpha.3';
export { RECIPE_VERSION };

export function createArtwork({ id, version, seed, parameters = {}, values = {}, mode = 'studio', traits = () => ({}), events = [], resolver, context, contextValues }) {
  identifier(id);
  requireValue(typeof version === 'string' && version.length > 0, 'Artwork version is required');
  requireValue(['studio', 'published'].includes(mode), 'Invalid artwork mode');
  const definitions = copy(parameters);
  const eventNames = new Set(['state.changed', ...events.map(identifier)]);
  const generator = generatorIdentity(resolver);
  const savedContext = contextValues === undefined ? undefined : contextEnvelope(contextValues, context);
  validateParameters(definitions, values, true);
  // Complete values are authoritative, including imported recipes. Never regenerate them.
  let resolved = Object.keys(definitions).every(key => Object.hasOwn(values, key))
    ? validateParameters(definitions, values) : resolveWith(definitions, seed, values, resolver);
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
  const recipe = (options = {}) => makeRecipe({ id, version, seed, parameters: resolved, generator,
    context: Object.hasOwn(options, 'context') ? contextEnvelope(options.context, context) : savedContext });
  recipe(); // Validate seed even when all parameter values were supplied.
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
    getContext: () => savedContext ? copy(savedContext.data) : null,
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
        generator: copy(generator), parameters: copy(definitions), events: [...eventNames], commands: describe(commands), queries: describe(queries) };
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
  api.registerQuery('recipe', { handler: () => recipe(), description: 'Portable canonical inputs and saved optional context' });
  return Object.freeze(api);
}

/** Import requires an exact artist code version and the original parameter definitions. */
export function fromRecipe(recipe, options) {
  requireValue(object(recipe) && ['0.1', RECIPE_VERSION].includes(recipe.format) && recipe.randomVersion === RANDOM_VERSION,
    'Unsupported recipe or random algorithm version');
  requireValue(recipe.artworkId === options.id && recipe.artworkVersion === options.version, 'Recipe belongs to a different artwork version');
  validateParameters(options.parameters ?? {}, recipe.parameters);
  const expected = generatorIdentity(options.resolver);
  const generator = recipe.format === '0.1' ? generatorIdentity() : validateGenerator(recipe.generator);
  requireValue(generator.kind === expected.kind && generator.id === expected.id && generator.version === expected.version, 'Recipe generator does not match the supplied resolver');
  const context = recipe.context === undefined ? undefined : readContext(recipe.context, options.context);
  return createArtwork({ ...options, seed: recipe.seed, values: recipe.parameters, contextValues: context?.data });
}

/** Explicit renderer restoration. Core import alone never mutates an artist's renderer. */
export async function restoreRecipe(recipe, options) {
  const artwork = fromRecipe(recipe, options);
  requireValue(options.restoreContext === undefined || typeof options.restoreContext === 'function', 'restoreContext must be a function');
  requireValue(recipe.context === undefined || options.restoreContext, 'A context recipe requires restoreContext', 'CONTEXT_RESTORE_REQUIRED');
  if (options.restoreContext) await options.restoreContext(artwork.getContext(), { artwork });
  return artwork;
}
