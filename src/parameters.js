import { createRandom } from './random.js';
import { requireValue, object, identifier } from './errors.js';

function validateValue(definition, value, id) {
  const { type, min, max, choices } = definition;
  if (type === 'number' || type === 'integer') {
    requireValue(Number.isFinite(value) && value >= min && value <= max, `Out of range: ${id}`);
    if (type === 'integer') requireValue(Number.isSafeInteger(value), `Integer required: ${id}`);
  } else if (type === 'boolean') requireValue(typeof value === 'boolean', `Boolean required: ${id}`);
  else requireValue(choices.includes(value), `Invalid choice: ${id}`);
}

export function validateParameters(definitions, values, partial = false) {
  requireValue(object(definitions) && object(values), 'Parameters must be objects');
  for (const id of Object.keys(values)) requireValue(Object.hasOwn(definitions, id), `Unknown parameter: ${id}`);
  for (const [id, definition] of Object.entries(definitions)) {
    identifier(id);
    requireValue(object(definition), `Invalid definition: ${id}`);
    const { type, min, max, choices } = definition;
    requireValue(['number', 'integer', 'boolean', 'choice'].includes(type), `Unsupported parameter type: ${id}`);
    if (type === 'number' || type === 'integer') {
      requireValue(Number.isFinite(min) && Number.isFinite(max) && min <= max && Number.isFinite(max - min), `Invalid bounds: ${id}`);
      if (type === 'integer') requireValue(Number.isSafeInteger(min) && Number.isSafeInteger(max) && max - min < 2 ** 32, `Invalid integer bounds: ${id}`);
    }
    if (type === 'choice') requireValue(Array.isArray(choices) && choices.length > 0
      && choices.every(v => ['string', 'number', 'boolean'].includes(typeof v) && (typeof v !== 'number' || Number.isFinite(v))), `Invalid choices: ${id}`);
    if (type === 'choice' && definition.weights !== undefined) {
      const weights = definition.weights;
      requireValue(Array.isArray(weights) && weights.length === choices.length
        && weights.every(w => Number.isFinite(w) && w >= 0)
        && Number.isFinite(weights.reduce((sum, w) => sum + w, 0))
        && weights.reduce((sum, w) => sum + w, 0) > 0, `Invalid choice weights: ${id}`);
    }
    if (type === 'boolean' && definition.probability !== undefined) requireValue(Number.isFinite(definition.probability)
      && definition.probability >= 0 && definition.probability <= 1, `Invalid probability: ${id}`);
    if (Object.hasOwn(definition, 'default')) validateValue(definition, definition.default, id);
    if (partial && !Object.hasOwn(values, id)) continue;
    requireValue(Object.hasOwn(values, id), `Missing parameter: ${id}`);
    validateValue(definition, values[id], id);
  }
  return Object.freeze({ ...values });
}

export function resolveParameters(definitions, seed, overrides = {}) {
  validateParameters(definitions, overrides, true);
  const random = createRandom(seed);
  const values = {};
  for (const [id, d] of Object.entries(definitions)) {
    const r = random.fork(id);
    if (Object.hasOwn(overrides, id)) values[id] = overrides[id];
    else if (Object.hasOwn(d, 'default')) values[id] = d.default;
    else if (d.type === 'boolean') values[id] = r.bool(d.probability ?? 0.5);
    else if (d.type === 'choice') values[id] = r.choice(d.choices, d.weights);
    else values[id] = d.type === 'integer' ? r.int(d.min, d.max) : r.float(d.min, d.max);
  }
  return validateParameters(definitions, values);
}

/** Small schema vocabulary for bridge operations; not a JSON Schema implementation. */
export function validateInput(schema, input) {
  requireValue(object(schema) && object(input), 'Operation input must be an object');
  for (const key of Object.keys(input)) requireValue(Object.hasOwn(schema, key), `Unknown input: ${key}`);
  for (const [key, rule] of Object.entries(schema)) {
    identifier(key);
    requireValue(object(rule) && ['number', 'string', 'boolean'].includes(rule.type), `Invalid input rule: ${key}`);
    if (!Object.hasOwn(input, key)) { requireValue(rule.optional === true, `Missing input: ${key}`); continue; }
    const value = input[key];
    requireValue(typeof value === rule.type, `Invalid type: ${key}`);
    if (rule.type === 'number') requireValue(Number.isFinite(value)
      && (rule.min === undefined || value >= rule.min) && (rule.max === undefined || value <= rule.max), `Invalid range: ${key}`);
    if (rule.type === 'string') requireValue(value.length <= (rule.maxLength ?? 4096), `Input too long: ${key}`);
    if (rule.enum) requireValue(rule.enum.includes(value), `Invalid option: ${key}`);
  }
  return Object.freeze({ ...input });
}
