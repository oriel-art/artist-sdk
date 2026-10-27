import { resolveWith, generatorIdentity, resolveParameters, validateParameters } from './parameters.js';
import { requireValue, copy, object, seedValue, synchronous, identifier } from './errors.js';
import { RANDOM_VERSION } from './random.js';
import { makeRecipe, contextEnvelope, jsonContext } from './recipe.js';

/** Parse pasted exact seeds without trimming, deduplicating or discarding lines. */
export function parseSeedLines(text) {
  requireValue(typeof text === 'string', 'Seed input must be text');
  const seeds = text.split(/\r\n|\r|\n/);
  seeds.forEach((seed, index) => {
    requireValue(seed.length > 0, `Blank seed on line ${index + 1}. Remove empty lines or enter a seed.`);
    requireValue(seed.length <= 4096, `Seed on line ${index + 1} has ${seed.length} characters; the maximum is 4096.`);
  });
  requireValue(seeds.length <= 10000, 'Provide at most 10000 seed lines');
  return seeds;
}

/** Isolated parameter sampling; artist callbacks must also avoid captured live state. */
export function testParameters(definitions, { seeds, count = 100, prefix = 'parameter-test', seedSource,
  overrides = {}, check, resolver, artwork, context, contextValues } = {}) {
  validateParameters(definitions, overrides, true);
  const generator = generatorIdentity(resolver);
  requireValue(check === undefined || typeof check === 'function', 'check must be a synchronous function');
  requireValue(seedSource === undefined || typeof seedSource === 'string' && seedSource.length <= 1000, 'Invalid seed source label');
  const source = seeds === undefined ? { kind: 'prefix', prefix } : { kind: 'explicit', ...(seedSource === undefined ? {} : { label: seedSource }) };
  if (seeds === undefined) {
    requireValue(Number.isSafeInteger(count) && count > 0 && count <= 10000, 'Sample count must be 1–10000');
    requireValue(typeof prefix === 'string' && prefix.length > 0 && prefix.length <= 4000, 'Invalid seed prefix');
    seeds = Array.from({ length: count }, (_, i) => `${prefix}:${i}`);
  }
  requireValue(Array.isArray(seeds) && seeds.length > 0 && seeds.length <= 10000, 'Provide 1–10000 seeds');
  seeds.forEach(seedValue);
  const snapshot = contextValues === undefined ? undefined : contextEnvelope(contextValues, context);
  const warnings = [], failures = [], errors = [], samples = [];
  for (const seed of seeds) {
    const sample = { seed, values: null, status: check ? 'pass' : 'unchecked', issues: [] };
    samples.push(sample);
    const issue = (severity, message, stage, code) => {
      const finding = { severity, message, stage, ...(code === undefined ? {} : { code }) };
      sample.issues.push(finding);
      ({ warning: warnings, failure: failures, error: errors })[severity].push({ seed, values: sample.values, ...finding });
    };
    try { sample.values = resolveWith(definitions, seed, overrides, resolver); }
    catch (error) { issue('error', String(error.message ?? error), 'resolve'); sample.status = 'error'; continue; }
    if (!check) continue;
    let result;
    try { result = check(sample.values, { seed }); }
    catch (error) { issue('error', String(error.message ?? error), 'check'); sample.status = 'error'; continue; }
    synchronous(result, 'check');
    if (result === true) continue;
    if (result === false || typeof result === 'string') result = [{ severity: 'failure', message: typeof result === 'string' ? result : 'Artist check failed' }];
    else if (!Array.isArray(result)) result = [result];
    requireValue(result.every(r => object(r) && ['warning', 'failure'].includes(r.severity)
      && typeof r.message === 'string' && r.message.length > 0 && (r.code === undefined || typeof r.code === 'string')),
    'check must return true, false, a failure message, or warning/failure findings');
    for (const r of result) issue(r.severity, r.message, 'check', r.code);
    sample.status = sample.issues.some(r => r.severity === 'failure') ? 'failure' : sample.issues.length ? 'warning' : 'pass';
  }
  const resolved = samples.filter(s => s.values !== null);
  const summary = Object.fromEntries(Object.entries(definitions).map(([id, d]) => {
    const values = resolved.map(s => s.values[id]);
    if (d.type === 'number' || d.type === 'integer') {
      const bins = Array.from({ length: 10 }, () => 0);
      let min = Infinity, max = -Infinity, mean = values[0];
      for (const [i, value] of values.entries()) {
        min = Math.min(min, value); max = Math.max(max, value); mean += (value - mean) / (i + 1);
        const index = d.max === d.min ? 0 : Math.min(9, Math.floor((value - d.min) / (d.max - d.min) * 10));
        bins[index]++;
      }
      return [id, { type: d.type, min: values.length ? min : null, max: values.length ? max : null,
        mean: mean ?? null, histogram: { min: d.min, max: d.max, counts: bins } }];
    }
    const choices = d.type === 'boolean' ? [false, true] : [...new Set(d.choices)];
    return [id, { type: d.type, counts: choices.map(value => ({ value, count: values.filter(v => v === value).length })) }];
  }));
  const counts = Object.fromEntries(['unchecked', 'pass', 'warning', 'failure', 'error'].map(status => [status, samples.filter(s => s.status === status).length]));
  return { format: 'artist-parameter-report/0.2', randomVersion: RANDOM_VERSION, generator, source,
    ...(artwork === undefined ? {} : { artwork: copy(artwork) }), ...(snapshot === undefined ? {} : { context: snapshot }),
    count: samples.length, resolved: resolved.length, checked: Boolean(check), passed: check ? counts.pass : null,
    counts, definitions: copy(definitions), overrides: copy(overrides), summary, warnings, failures, errors, samples };
}

/** Export the recorded case, never resample it or reuse the current live seed. */
export function recipeForCase(report, index) {
  requireValue(report?.format === 'artist-parameter-report/0.2' && report.randomVersion === RANDOM_VERSION, 'Unsupported parameter report');
  requireValue(Number.isSafeInteger(index) && index >= 0 && index < report.samples?.length, 'Invalid case index');
  requireValue(object(report.artwork), 'Report needs artwork id and version to save recipes');
  const sample = report.samples[index];
  requireValue(sample.values !== null, 'This case has no resolved values', 'NOT_READY');
  validateParameters(report.definitions, sample.values);
  let context;
  if (report.context !== undefined) {
    requireValue(object(report.context) && typeof report.context.version === 'string'
      && report.context.version.length > 0 && report.context.version.length <= 100, 'Invalid report context');
    identifier(report.context.id);
    context = { id: report.context.id, version: report.context.version, data: jsonContext(report.context.data) };
  }
  return makeRecipe({ id: report.artwork.id, version: report.artwork.version, seed: sample.seed,
    parameters: sample.values, generator: report.generator, context });
}

/** One parameter at a time: baseline, numeric bounds, booleans, and choices. */
export function parameterCases(definitions, { seed = 'boundary-test', values = {} } = {}) {
  const baseline = resolveParameters(definitions, seed, values);
  const cases = [{ name: 'Baseline', parameter: null, label: 'Starting values', seed, values: baseline }];
  const seen = new Set([JSON.stringify(baseline)]);
  for (const [id, d] of Object.entries(definitions)) {
    const alternatives = d.type === 'boolean' ? [false, true] : d.type === 'choice' ? d.choices : [d.min, d.max];
    for (const value of alternatives) {
      const next = { ...baseline, [id]: value }, key = JSON.stringify(next);
      if (seen.has(key)) continue;
      requireValue(cases.length < 1000, 'Boundary cases exceed the 1000-case limit');
      seen.add(key);
      const label = d.label ?? id;
      cases.push({ name: `${label} = ${JSON.stringify(value)}`, parameter: id, label, seed, values: Object.freeze(next) });
    }
  }
  return cases;
}
