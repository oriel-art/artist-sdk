import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtwork, fromRecipe, createRandom, resolveParameters, readInputs, shareURL } from '../src/index.js';
import { checkExportSize } from '../src/webgl.js';

const parameters = {
  density: { type: 'integer', min: 0, max: 50, label: 'Density' },
  enabled: { type: 'boolean' },
  palette: { type: 'choice', choices: ['ink', 'clay'], weights: [1, 0] },
  phase: { type: 'number', min: -1, max: 1, default: 0 }
};
const options = { id: 'test-work', version: '1', seed: 'test-seed', parameters,
  traits: p => ({ Density: p.density > 25 ? 'Dense' : 'Sparse', Palette: p.palette }) };
const code = expected => error => error.code === expected;

test('versioned random sequence has a fixed reference vector', () => {
  const r = createRandom('mihira-pilot-001');
  assert.deepEqual(Array.from({ length: 6 }, () => r.next()), [
    0.02644622977823019, 0.927307554287836, 0.5256725717335939,
    0.6416423104237765, 0.9249386519659311, 0.2097060780506581
  ]);
});

test('full seed, stream identity and independent consumption affect only intended choices', () => {
  const seed = '0x' + 'a'.repeat(63);
  assert.notEqual(createRandom(seed + '1').next(), createRandom(seed + '2').next());
  const a = createRandom(seed), b = createRandom(seed);
  for (let i = 0; i < 100; i++) a.fork('texture').next();
  assert.equal(a.fork('composition').next(), b.fork('composition').next());
  assert.notEqual(a.fork('composition').next(), a.fork('texture').next());
  a.next(); a.next();
  assert.equal(a.fork('composition').next(), b.fork('composition').next());
});

test('distributions validate bounds and zero-probability choices', () => {
  const r = createRandom('sample');
  for (let i = 0; i < 100; i++) {
    assert.equal(r.choice(['never', 'always', 'never'], [0, 4, 0]), 'always');
    assert.ok([-1, 0, 1].includes(r.int(-1, 1)));
    assert.equal(r.bool(0), false); assert.equal(r.bool(1), true);
    assert.equal(r.normal(5, 0), 5);
    const f = r.float(-2, 2); assert.ok(f >= -2 && f < 2);
  }
  for (const call of [() => r.int(2, 1), () => r.float(0, Infinity), () => r.bool(-1),
    () => r.choice([], []), () => r.choice([1], [0]), () => r.choice([1], [NaN]),
    () => r.normal(0, -1), () => createRandom('')]) assert.throws(call, code('INVALID_INPUT'));
});

test('parameter identities survive labels, order and independent additions', () => {
  const a = resolveParameters(parameters, 'seed');
  const changed = { extra: { type: 'number', min: 0, max: 1 }, ...Object.fromEntries(Object.entries(parameters).reverse()) };
  changed.density = { ...changed.density, label: 'New label' };
  const b = resolveParameters(changed, 'seed');
  for (const key of Object.keys(a)) assert.equal(a[key], b[key]);
  assert.equal(a.palette, 'ink'); assert.equal(a.phase, 0);
});

test('explicit zero and false are preserved; invalid overrides fail before mutation', () => {
  const art = createArtwork({ ...options, values: { density: 0, enabled: false } });
  assert.equal(art.parameters.density, 0); assert.equal(art.parameters.enabled, false);
  const before = art.getState();
  for (const patch of [{ density: -1 }, { density: 2.5 }, { unknown: 1 }, { palette: 'bad' }, { enabled: 0 }, { phase: NaN }]) {
    assert.throws(() => art.setParameters(patch), code('INVALID_INPUT'));
    assert.deepEqual(art.getState(), before);
  }
  assert.throws(() => { art.parameters.density = 4; }, TypeError);
  assert.throws(() => resolveParameters(JSON.parse('{"constructor":{"type":"boolean"}}'), 's'), code('INVALID_INPUT'));
});

test('recipe round-trip restores canonical inputs and rejects incompatible or incomplete recipes', () => {
  const art = createArtwork(options);
  art.setParameters({ density: 42, enabled: false });
  const recipe = JSON.parse(JSON.stringify(art.getRecipe()));
  const restored = fromRecipe(recipe, options);
  assert.deepEqual(restored.getRecipe(), recipe);
  assert.deepEqual(restored.getState().traits, art.getState().traits);
  assert.equal(restored.revision, 0);
  for (const patch of [{ format: '99' }, { randomVersion: 'other' }, { artworkId: 'wrong' },
    { artworkVersion: '2' }, { parameters: { density: 42 } }, { seed: '' }]) {
    assert.throws(() => fromRecipe({ ...recipe, ...patch }, options), code('INVALID_INPUT'));
  }
});

test('published parameters are locked and events reflect completed updates', () => {
  const published = createArtwork({ ...options, mode: 'published' });
  assert.throws(() => published.setParameters({ density: 10 }), code('FORBIDDEN'));
  const art = createArtwork(options), events = [];
  const unsubscribe = art.subscribe(e => events.push(e));
  const result = art.setParameters({ density: 50 });
  assert.equal(result.traits.Density, 'Dense'); assert.equal(result.revision, 1);
  assert.equal(events[0].detail.parameters.density, 50);
  unsubscribe(); art.setParameters({ density: 0 }); assert.equal(events.length, 1);
  assert.throws(() => art.emit('undeclared'), code('INVALID_INPUT'));
});

test('state reads do not reevaluate traits and invalid traits cannot partially commit a parameter update', async () => {
  let evaluations = 0;
  const art = createArtwork({ ...options, values: { density: 10 }, traits: p => {
    evaluations++; return { Count: p.density === 13 ? NaN : p.density };
  } });
  const before = art.getState();
  await art.query('state'); art.getState();
  assert.equal(evaluations, 1);
  assert.throws(() => art.setParameters({ density: 13 }), code('INVALID_INPUT'));
  assert.deepEqual(art.getState(), before);
  art.setParameters({ density: 14 });
  assert.equal(art.getState().traits.Count, 14); assert.equal(art.revision, 1);
});

test('queries leave canonical state and PRNG streams intact; commands validate before calling handlers', async () => {
  const art = createArtwork(options), stream = art.random('marks'), reference = art.random('marks');
  stream.next(); reference.next();
  const before = art.getState();
  assert.deepEqual(await art.query('state'), before);
  assert.deepEqual(await art.query('recipe'), art.getRecipe());
  assert.equal(stream.next(), reference.next()); assert.deepEqual(art.getState(), before);
  let called = 0;
  art.registerCommand('regions.activate', { input: { region: { type: 'string', enum: ['north', 'south'] } },
    handler: ({ region }) => { called++; art.changed({ region }); return region; } });
  for (const input of [{}, { region: 'east' }, { region: 'north', extra: true }])
    await assert.rejects(art.command('regions.activate', input), code('INVALID_INPUT'));
  assert.equal(called, 0);
  assert.equal(await art.command('regions.activate', { region: 'north' }), 'north');
  assert.equal(called, 1); assert.equal(art.revision, 1);
  await assert.rejects(art.query('missing'), code('UNSUPPORTED'));
  await assert.rejects(art.command('state'), code('UNSUPPORTED'));
});

test('URL helpers round-trip special characters while preserving unrelated URL fields', () => {
  const recipe = { seed: 'a + # / λ', parameters: { value: 0, enabled: false } };
  const url = shareURL('https://example.org/work?viewer=gallery#caption', recipe);
  assert.deepEqual(readInputs(url), { seed: recipe.seed, values: recipe.parameters });
  assert.equal(new URL(url).searchParams.get('viewer'), 'gallery');
  assert.equal(new URL(url).hash, '#caption');
  assert.deepEqual(readInputs('https://example.org/'), { seed: null, values: {} });
  for (const query of ['seed=', 'params=not-json', 'params=[]', 'params=null'])
    assert.throws(() => readInputs(`https://example.org/?${query}`), code('INVALID_INPUT'));
});

test('export preflight respects every device dimension and the pixel budget', () => {
  const gl = { MAX_VIEWPORT_DIMS: 1, MAX_TEXTURE_SIZE: 2, MAX_RENDERBUFFER_SIZE: 3,
    getParameter: key => ({ 1: [4096, 2048], 2: 8192, 3: 4096 })[key] };
  assert.equal(checkExportSize(gl, 1024, 1024).estimatedBytes, 16_777_216);
  assert.throws(() => checkExportSize(gl, 4096, 4096), code('EXPORT_LIMIT'));
  assert.throws(() => checkExportSize(gl, 1024, 1024, 1000), code('EXPORT_LIMIT'));
  assert.throws(() => checkExportSize(gl, -1, 20), code('INVALID_INPUT'));
});
