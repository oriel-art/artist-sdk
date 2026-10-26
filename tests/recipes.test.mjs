import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtwork, fromRecipe, restoreRecipe, shareURL, readInputs, RANDOM_VERSION } from '../src/index.js';
import { testParameters, recipeForCase } from '../src/testing.js';

const definitions = { radius: { type: 'number', min: 0, max: 10 }, palette: { type: 'choice', choices: ['a', 'b'] } };
const context = { id: 'kepler-comparison', version: '1', validate: data =>
  Object.keys(data).length === 3 && Number.isFinite(data.elapsedSeconds) && data.elapsedSeconds >= 0
  && data.cadence > 0 && data.aspectRatio > 0 || 'Invalid comparison context' };
const moment = { elapsedSeconds: 12.5, cadence: 2, aspectRatio: 1.5 };
const resolver = { id: 'original-kepler', version: 'legacy-1', resolve: seed => ({ radius: seed.length % 10, palette: 'b' }) };
const options = { id: 'kepler-fixture', version: '1', seed: 'live', parameters: definitions, resolver, context };

test('custom resolution preserves original seed and call order, then applies explicit pins', () => {
  const calls = [];
  const custom = { ...resolver, resolve(seed) { calls.push(seed); return resolver.resolve(seed); } };
  const seeds = [' 0xa ', '0xb', ' 0xa '];
  const report = testParameters(definitions, { seeds, seedSource: 'Recorded Verse inputs', resolver: custom, overrides: { palette: 'a' } });
  assert.deepEqual(calls, seeds);
  assert.deepEqual(report.samples.map(s => s.values), seeds.map(seed => ({ ...resolver.resolve(seed), palette: 'a' })));
  assert.deepEqual(report.generator, { kind: 'artist', id: resolver.id, version: resolver.version });
  assert.deepEqual(report.source, { kind: 'explicit', label: 'Recorded Verse inputs' });
  assert.deepEqual(report, testParameters(definitions, { seeds, seedSource: 'Recorded Verse inputs', resolver, overrides: { palette: 'a' } }));
  const art = createArtwork({ ...options, seed: seeds[0], values: { palette: 'a' } });
  assert.deepEqual(art.parameters, report.samples[0].values);
});

test('reports retain warnings, failures and execution errors without dropping or resampling cases', () => {
  const report = testParameters(definitions, { seeds: ['ok', 'warn', 'fail', 'throw', 'resolve'], resolver: {
    ...resolver, resolve(seed) { if (seed === 'resolve') throw new Error('Cannot resolve'); return resolver.resolve(seed); }
  }, check(values, { seed }) {
    if (seed === 'warn') return { severity: 'warning', code: 'overlap', message: 'Inspect visually' };
    if (seed === 'fail') return [{ severity: 'warning', message: 'Crowded' }, { severity: 'failure', message: 'Out of frame' }];
    if (seed === 'throw') throw new Error('Check crashed');
    return true;
  } });
  assert.deepEqual(report.samples.map(s => s.status), ['pass', 'warning', 'failure', 'error', 'error']);
  assert.equal(report.count, 5); assert.equal(report.resolved, 4); assert.equal(report.passed, 1);
  assert.equal(report.warnings.length, 2); assert.equal(report.failures.length, 1); assert.equal(report.errors.length, 2);
  assert.equal(report.summary.palette.counts[1].count, 4);
  assert.equal(report.samples[4].values, null); assert.ok(report.samples[3].values);
  assert.equal(report.errors[1].stage, 'resolve');
  const failed = testParameters(definitions, { count: 2, resolver: { ...resolver, resolve: () => ({ radius: 99 }) } });
  assert.equal(failed.resolved, 0); assert.equal(failed.summary.radius.min, null);
  assert.deepEqual(failed.summary.radius.histogram.counts, Array(10).fill(0));
});

test('saved cases use recorded values and validate generator identity without executing the resolver', () => {
  let calls = 0;
  const custom = { ...resolver, resolve(seed) { calls++; return resolver.resolve(seed); } };
  const report = testParameters(definitions, { seeds: ['original-seed'], resolver: custom, overrides: { radius: 7 },
    artwork: { id: options.id, version: options.version }, context, contextValues: moment });
  const recipe = recipeForCase(report, 0);
  const art = fromRecipe(recipe, { ...options, resolver: custom });
  assert.equal(calls, 1); assert.equal(art.seed, 'original-seed'); assert.equal(art.parameters.radius, 7);
  assert.deepEqual(art.getRecipe(), recipe); assert.deepEqual(art.getContext(), moment);
  recipe.parameters.radius = 1; recipe.context.data.elapsedSeconds = 0;
  assert.equal(art.parameters.radius, 7); assert.deepEqual(art.getContext(), moment);
  assert.throws(() => fromRecipe(art.getRecipe(), { ...options, resolver: { ...resolver, version: '2' } }), /generator/);
  assert.throws(() => fromRecipe(art.getRecipe(), { ...options, resolver: undefined }), /generator/);
  assert.throws(() => recipeForCase(report, -1), /index/);
  const invalid = { ...report, samples: [{ seed: 'bad', values: null }] };
  assert.throws(() => recipeForCase(invalid, 0), e => e.code === 'NOT_READY');
});

test('context capture is copied, versioned and validated; import never restores a renderer implicitly', async () => {
  const art = createArtwork(options), input = { ...moment };
  const recipe = art.getRecipe({ context: input }); input.elapsedSeconds = 100;
  assert.deepEqual(recipe.context.data, moment); assert.equal(art.getContext(), null);
  const restored = fromRecipe(recipe, options); assert.deepEqual(restored.getContext(), moment);
  const returned = restored.getContext(); returned.cadence = 99;
  assert.deepEqual(restored.getContext(), moment);
  await assert.rejects(restoreRecipe(recipe, options), e => e.code === 'CONTEXT_RESTORE_REQUIRED');
  let applied = false;
  const ready = await restoreRecipe(recipe, { ...options, async restoreContext(data, { artwork }) {
    await Promise.resolve(); assert.deepEqual(data, moment); assert.equal(artwork.seed, recipe.seed); applied = true;
  } });
  assert.ok(applied); assert.deepEqual(ready.getRecipe(), recipe);
  await assert.rejects(restoreRecipe(recipe, { ...options, restoreContext: () => { throw new Error('Renderer failed'); } }), /Renderer failed/);
  for (const context of [undefined, { ...options.context, version: '2' }]) assert.throws(() => fromRecipe(recipe, { ...options, context }), /context schema/);
  assert.throws(() => art.getRecipe({ context: { ...moment, elapsedSeconds: -1 } }), /Invalid comparison/);
});

test('context rejects lossy or oversized JSON and asynchronous validation', () => {
  const art = createArtwork({ ...options, context: { ...context, validate: () => true } });
  const cycle = {}; cycle.self = cycle;
  for (const data of [{ value: undefined }, { value: NaN }, { value: Infinity }, { value: new Date() },
    { value: () => {} }, { value: 1n }, { value: 'λ'.repeat(9000) }, cycle, []])
    assert.throws(() => art.getRecipe({ context: data }), e => e.code === 'INVALID_INPUT');
  const asyncArt = createArtwork({ ...options, context: { ...context, validate: async () => true } });
  assert.throws(() => asyncArt.getRecipe({ context: moment }), /synchronous/);
});

test('legacy canonical recipes remain importable with explicit missing-context restoration defaults', async () => {
  const legacy = { format: '0.1', artworkId: options.id, artworkVersion: '1', randomVersion: RANDOM_VERSION,
    seed: 'old-seed', parameters: { radius: 4, palette: 'a' } };
  let defaults;
  const art = await restoreRecipe(legacy, { ...options, resolver: undefined,
    restoreContext(data) { defaults = data ?? { elapsedSeconds: 0, cadence: 1, aspectRatio: 1 }; } });
  assert.equal(art.getRecipe().format, '0.2'); assert.equal(art.seed, legacy.seed);
  assert.deepEqual(defaults, { elapsedSeconds: 0, cadence: 1, aspectRatio: 1 });
  assert.throws(() => fromRecipe(legacy, options), /generator/);
  assert.throws(() => fromRecipe({ ...legacy, context: { id: 'wrong', version: '1', data: moment } }, { ...options, resolver: undefined }), /context schema/);
});

test('recipe URLs carry generator and context without losing unrelated viewer fields', () => {
  const recipe = createArtwork(options).getRecipe({ context: moment });
  const url = shareURL('https://example.org/art?seed=old&params={}&viewer=verse#art', recipe);
  assert.deepEqual(readInputs(url).recipe, recipe);
  assert.equal(new URL(url).searchParams.has('seed'), false);
  assert.equal(new URL(url).searchParams.get('viewer'), 'verse');
  assert.equal(new URL(url).hash, '#art');
  const mixed = new URL(url); mixed.searchParams.set('seed', 'other');
  assert.throws(() => readInputs(mixed.href), /mixes/);
  for (const value of ['null', '[]', '{}', 'not-json']) assert.throws(() => readInputs('https://example.org/?recipe=' + encodeURIComponent(value)));
  assert.throws(() => shareURL(url, { ...recipe, context: { text: 'x'.repeat(20000) } }), /larger inputs/);
});
