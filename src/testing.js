import { resolveParameters, validateParameters } from './parameters.js';
import { requireValue, copy } from './errors.js';
import { RANDOM_VERSION } from './random.js';

/** Sample canonical parameter resolution without touching a running artwork. */
export function testParameters(definitions, { seeds, count = 100, prefix = 'parameter-test', overrides = {}, check } = {}) {
  validateParameters(definitions, overrides, true);
  requireValue(check === undefined || typeof check === 'function', 'check must be a synchronous function');
  if (seeds === undefined) {
    requireValue(Number.isSafeInteger(count) && count > 0 && count <= 10000, 'Sample count must be 1–10000');
    requireValue(typeof prefix === 'string' && prefix.length > 0 && prefix.length <= 4000, 'Invalid seed prefix');
    seeds = Array.from({ length: count }, (_, i) => `${prefix}:${i}`);
  }
  requireValue(Array.isArray(seeds) && seeds.length > 0 && seeds.length <= 10000, 'Provide 1–10000 seeds');
  const samples = seeds.map(seed => ({ seed, values: resolveParameters(definitions, seed, overrides) }));
  const failures = [];
  for (const sample of samples) {
    if (!check) break;
    let result;
    try { result = check(sample.values, { seed: sample.seed }); }
    catch (error) { result = String(error.message ?? error); }
    // Async checks must never silently count as passing.
    if (result?.then) { Promise.resolve(result).catch(() => {}); requireValue(false, 'check must be synchronous'); }
    requireValue(typeof result === 'boolean' || typeof result === 'string', 'check must return true, false, or a failure message');
    if (result !== true) failures.push({ seed: sample.seed, values: { ...sample.values }, message: typeof result === 'string' ? result : 'Artist check failed' });
  }
  const summary = Object.fromEntries(Object.entries(definitions).map(([id, d]) => {
    const values = samples.map(s => s.values[id]);
    if (d.type === 'number' || d.type === 'integer') {
      const bins = Array.from({ length: 10 }, () => 0);
      let min = Infinity, max = -Infinity, mean = values[0];
      for (const [i, value] of values.entries()) {
        min = Math.min(min, value); max = Math.max(max, value); mean += (value - mean) / (i + 1);
        const index = d.max === d.min ? 0 : Math.min(9, Math.floor((value - d.min) / (d.max - d.min) * 10));
        bins[index]++;
      }
      return [id, { type: d.type, min, max, mean, histogram: { min: d.min, max: d.max, counts: bins } }];
    }
    const choices = d.type === 'boolean' ? [false, true] : [...new Set(d.choices)];
    return [id, { type: d.type, counts: choices.map(value => ({ value, count: values.filter(v => v === value).length })) }];
  }));
  return { format: 'artist-parameter-report/0.1', randomVersion: RANDOM_VERSION, count: samples.length, checked: Boolean(check),
    passed: check ? samples.length - failures.length : null, definitions: copy(definitions),
    overrides: copy(overrides), summary, failures, samples };
}

/** One parameter at a time: baseline, numeric bounds, booleans, and choices. */
export function parameterCases(definitions, { seed = 'boundary-test', values = {} } = {}) {
  const baseline = resolveParameters(definitions, seed, values);
  const cases = [{ name: 'Baseline', parameter: null, seed, values: baseline }];
  const seen = new Set([JSON.stringify(baseline)]);
  for (const [id, d] of Object.entries(definitions)) {
    const alternatives = d.type === 'boolean' ? [false, true] : d.type === 'choice' ? d.choices : [d.min, d.max];
    for (const value of alternatives) {
      const next = { ...baseline, [id]: value }, key = JSON.stringify(next);
      if (seen.has(key)) continue;
      requireValue(cases.length < 1000, 'Boundary cases exceed the 1000-case limit');
      seen.add(key);
      cases.push({ name: `${id} = ${JSON.stringify(value)}`, parameter: id, seed, values: Object.freeze(next) });
    }
  }
  return cases;
}
