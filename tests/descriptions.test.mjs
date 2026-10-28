import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getCapabilities, createCapabilities, validateRequest, evaluateRequest } from '../src/capabilities.js';
import { getMetadata, getProvenanceReferences, createMetadata, resolveLocalizedText } from '../src/metadata.js';
import { parseDiscovery, serializeDiscovery, createDiscovery, registerDiscovery } from '../src/discovery.js';
import { createArtwork } from '../src/index.js';
import { data, parseJSONData } from '../src/description-data.js';

const example = JSON.parse(await readFile(new URL('../examples/discovery/artwork.json', import.meta.url), 'utf8'));
const caps = () => structuredClone(example.capabilities);
const metadata = () => structuredClone(example.metadata);
const request = { width: 2400, height: 2400, format: 'image/png', print: { width: 8, height: 8, unit: 'in', dpi: 300 } };
const code = expected => error => error.code === expected;

test('incremental JSON budgets match UTF-8 serialization at exact boundaries', () => {
  const strings = ['', 'plain', 'é漢😀', '\u2028\u2029', '"\\\b\t\n\f\r\u0000\u001f', '\ud800', '\udc00', '\ud800x\udc00', '\ud83d\ude00'];
  const values = [null, true, false, 0, -0, 1e21, 1e-7, Number.MAX_VALUE, Number.MIN_VALUE,
    {}, [], ...strings, strings, Object.fromEntries(strings.map((key, i) => [key, strings[i]])),
    { nested: [1, { text: 'é', same: 'é' }, false] }];
  for (const value of values) {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    assert.deepEqual(data(value, bytes), JSON.parse(JSON.stringify(value)));
    assert.throws(() => data(value, bytes - 1), code('LIMIT'));
  }
});

test('bounded JSON ingress rejects oversized text before parsing, including UTF-8 expansion', t => {
  const original = JSON.parse;
  let calls = 0;
  t.mock.method(JSON, 'parse', (...args) => { calls++; return original(...args); });
  for (const text of [' '.repeat(20481), JSON.stringify('é'.repeat(11000))]) {
    assert.throws(() => parseJSONData(text, 20480), code('LIMIT'));
  }
  assert.equal(calls, 0);
  assert.deepEqual(parseJSONData('{"zero":-0,"text":"é"}', 24), { zero: 0, text: 'é' });
  assert.equal(calls, 1);
  assert.throws(() => parseJSONData('{broken', 100), code('INVALID_INPUT'));
});

test('wide enumerable objects fail before explicit own-key materialization', t => {
  const wide = {};
  for (let i = 0; i < 100000; i++) wide[`key${i}`] = 0;
  const ownKeys = Reflect.ownKeys;
  let enumeratedWide = false;
  t.mock.method(Reflect, 'ownKeys', value => {
    if (value === wide) enumeratedWide = true;
    return ownKeys(value);
  });
  assert.throws(() => data(wide, 8192), code('LIMIT'));
  assert.equal(enumeratedWide, false);
});

test('enumeration hardening still rejects hidden, symbol, unsafe, accessor and sparse data', () => {
  let invoked = 0;
  const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
  const symbol = { [Symbol('hidden')]: 1 };
  const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { invoked++; return 1; } });
  const array = [1]; Object.defineProperty(array, 'hidden', { value: 2 });
  for (const value of [hidden, symbol, getter, array, [, 1], JSON.parse('{"__proto__":1}')]) {
    assert.throws(() => data(value), code('INVALID_INPUT'));
  }
  assert.equal(invoked, 0);
  const plain = Object.assign(Object.create(null), { value: 1 });
  assert.deepEqual(data(plain), { value: 1 });
});

test('oversized strings, keys and repeated values fail before visiting later fields', () => {
  const later = value => Object.defineProperty(value, 'later', { enumerable: true, get() { throw new Error('Must not execute'); } });
  // The later accessor would yield INVALID_INPUT if traversal continued past the budget.
  assert.throws(() => data(later({ huge: 'x'.repeat(65536) })), code('LIMIT'));
  assert.throws(() => data(later({ ['k'.repeat(65536)]: 1 })), code('LIMIT'));
  const shared = 'x'.repeat(1024);
  const repeated = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`key${i}`, shared]));
  assert.throws(() => data(later(repeated)), code('LIMIT'));
  assert.throws(() => parseDiscovery(' '.repeat(1_000_000)), code('LIMIT'));
  assert.throws(() => parseDiscovery('é'.repeat(30000)), code('LIMIT'));
});

test('static negotiation separates technical, artist and malformed-request failures', () => {
  assert.equal(validateRequest(caps(), request).status, 'requires-evaluation');
  const description = caps(); delete description.evaluation;
  assert.equal(validateRequest(description, request).status, 'supported');
  const artist = validateRequest(description, { width: 600, height: 400, format: 'image/png' });
  assert.deepEqual(artist.issues.map(i => [i.source, i.code]), [['artist', 'ASPECT_RATIO']]);
  const oversized = validateRequest(description, { width: 8193, height: 8193, format: 'image/jpeg' });
  assert.equal(oversized.status, 'unsupported');
  assert.ok(oversized.issues.some(i => i.source === 'technical' && i.code === 'PIXEL_LIMIT'));
  assert.ok(oversized.issues.some(i => i.code === 'FORMAT'));
  for (const invalid of [null, {}, { ...request, width: NaN }, { ...request, height: 1.2 },
    { ...request, width: Number.MAX_SAFE_INTEGER + 1 }, { ...request, format: '' }, { ...request, unknown: true },
    { ...request, print: { ...request.print, unit: 'meters' } }]) {
    assert.equal(validateRequest(description, invalid).issues[0].code, 'INVALID_REQUEST');
  }
});

test('print conversion, DPI, tiling and pixel consistency are enforced', () => {
  for (const [unit, width] of [['in', 8], ['cm', 20.32], ['mm', 203.2]]) {
    assert.equal(validateRequest(caps(), { ...request, print: { width, height: width, unit, dpi: 300 } }).status, 'requires-evaluation');
  }
  for (const [patch, expected] of [[{ tiled: true }, 'TILING'], [{ width: 9 }, 'PRINT_RESOLUTION'], [{ dpi: 600 }, 'OUT_OF_RANGE']]) {
    assert.ok(validateRequest(caps(), { ...request, print: { ...request.print, ...patch } }).issues.some(i => i.code === expected));
  }
  const undeclared = caps(); delete undeclared.technical.print;
  assert.ok(validateRequest(undeclared, request).issues.some(i => i.code === 'UNDECLARED'));
  const boundary = { width: 300, height: 300, format: 'image/png', print: { width: 1, height: 1, unit: 'in', dpi: 300 } };
  assert.equal(validateRequest(caps(), boundary).status, 'requires-evaluation');
});

test('undeclared or false requested features fail; false requests impose no requirement', () => {
  for (const feature of [{ interaction: { keyboard: true } }, { animation: { seek: true } }, { state: { save: true } }]) {
    const c = caps(); delete c.technical.state;
    assert.equal(validateRequest(c, { ...request, ...feature }).status, 'unsupported');
  }
  assert.equal(validateRequest(caps(), { ...request, interaction: { keyboard: false }, animation: { pause: true }, state: { restore: true } }).status, 'requires-evaluation');
});

test('descriptions reject unknown versions, malformed ranges and unsupported fields', () => {
  for (const mutate of [c => c.schemaVersion = '2', c => c.extra = true,
    c => c.technical.rendering.width = { min: 20, max: 10 }, c => c.technical.rendering.formats = [],
    c => c.technical.rendering.maxPixels = Infinity, c => c.technical.rendering.aspectRatios = [0],
    c => c.technical.rendering.formats = ['png'], c => c.technical.state.save = 'yes', c => c.evaluation = 'maybe',
    c => c.technical.animation.supported = false]) {
    const c = caps(); mutate(c); assert.throws(() => getCapabilities(c));
  }
});

test('providers snapshot inputs and return independent data', () => {
  const c = caps(), m = metadata();
  const cp = createCapabilities(c), mp = createMetadata(m);
  c.technical.rendering.width.max = 1; m.project.title.en = 'Mutated';
  cp.getCapabilities().technical.rendering.width.max = 2;
  mp.getMetadata().project.title.en = 'Changed';
  mp.getProvenanceReferences()[0].uri = 'https://example.com/changed';
  assert.equal(cp.getCapabilities().technical.rendering.width.max, 8192);
  assert.equal(mp.getMetadata().project.title.en, 'Tidal Lines');
  assert.equal(mp.getProvenanceReferences()[0].uri, example.metadata.provenance[0].uri);
  assert.equal(cp.evaluateRequest, undefined);
});

test('runtime decisions cannot override static limits, and evaluation is explicit', async () => {
  let calls = 0;
  const evaluate = async () => { calls++; return { supported: true }; };
  assert.equal((await evaluateRequest(caps(), { ...request, width: 99999 }, evaluate)).status, 'unsupported');
  assert.equal((await evaluateRequest(caps(), {}, evaluate)).status, 'unsupported');
  assert.equal(calls, 0);
  assert.equal((await evaluateRequest(caps(), request)).status, 'requires-evaluation');
  assert.equal((await evaluateRequest(caps(), request, evaluate)).status, 'supported');
  assert.equal(calls, 1);
  const rejected = await createCapabilities(caps(), { evaluate: () => ({ supported: false, reasons: ['GPU budget'] }) }).evaluateRequest(request);
  assert.equal(rejected.status, 'unsupported'); assert.equal(rejected.issues[0].source, 'runtime');
  assert.equal((await evaluateRequest(caps(), request, () => ({ supported: false, reasons: [] }))).issues.length, 1);
  await assert.rejects(evaluateRequest(caps(), request, () => ({ supported: 'yes' })), code('INVALID_INPUT'));
  await assert.rejects(evaluateRequest(caps(), request, () => { throw new Error('device lost'); }), /device lost/);
});

test('evaluation supports cancellation, timeout and isolated simultaneous requests', async () => {
  await assert.rejects(evaluateRequest(caps(), request, () => ({ supported: true }), { signal: AbortSignal.abort() }), code('CANCELLED'));
  let signal;
  await assert.rejects(evaluateRequest(caps(), request, (_, context) => { signal = context.signal; return new Promise(() => {}); }, { timeout: 5 }), code('TIMEOUT'));
  assert.equal(signal.aborted, true);
  const controller = new AbortController();
  let called = false;
  const pending = evaluateRequest(caps(), request, () => { called = true; return new Promise(() => {}); }, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, code('CANCELLED'));
  assert.equal(called, false);
  const original = structuredClone(request);
  const provider = createCapabilities(caps(), { evaluate: (r, ctx) => {
    r.width = 1; ctx.capabilities.technical.rendering.width.max = 1; return { supported: true };
  } });
  const results = await Promise.all([provider.evaluateRequest(request), provider.evaluateRequest(request)]);
  assert.ok(results.every(r => r.status === 'supported'));
  assert.deepEqual(request, original); assert.equal(provider.getCapabilities().technical.rendering.width.max, 8192);
});

test('overdue synchronous and microtask-bound hooks cannot return supported', async () => {
  for (const microtasks of [false, true]) {
    let signal;
    await assert.rejects(evaluateRequest(caps(), request, async (_, context) => {
      signal = context.signal;
      const end = performance.now() + 15;
      while (performance.now() < end) { if (microtasks) await Promise.resolve(); }
      return { supported: true };
    }, { timeout: 5 }), code('TIMEOUT'));
    assert.equal(signal.aborted, true);
  }
});

test('evaluation slots remain occupied after timeout or abort until the hook settles', async () => {
  for (const cancel of [false, true]) {
    const deferred = [], controllers = [];
    let started = 0;
    let allStarted;
    const ready = new Promise(resolve => { allStarted = resolve; });
    const evaluate = () => new Promise((resolve, reject) => {
      deferred.push({ resolve, reject });
      if (++started === 4) allStarted();
    });
    const provider = createCapabilities(caps(), { evaluate });
    const otherProvider = createCapabilities(caps(), { evaluate });
    const pending = Array.from({ length: 4 }, () => {
      const controller = new AbortController(); controllers.push(controller);
      return provider.evaluateRequest(request, { timeout: cancel ? 5000 : 20, signal: controller.signal });
    });
    const completed = Promise.allSettled(pending);
    await ready;
    if (cancel) controllers.forEach(controller => controller.abort());
    const results = await completed;
    assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === (cancel ? 'CANCELLED' : 'TIMEOUT')));
    try {
      // Same hook cannot bypass its capacity via a new provider or standalone API.
      await assert.rejects(otherProvider.evaluateRequest(request), code('BUSY'));
      await assert.rejects(evaluateRequest(caps(), request, evaluate), code('BUSY'));
      assert.equal(started, 4);
      // An unrelated evaluator still runs.
      assert.equal((await evaluateRequest(caps(), request, () => ({ supported: true }))).status, 'supported');
      deferred[0].reject(new Error('Late failure after timeout'));
      await new Promise(resolve => setImmediate(resolve));
      const recovered = provider.evaluateRequest(request);
      await Promise.resolve();
      assert.equal(started, 5);
      deferred[4].resolve({ supported: true });
      assert.equal((await recovered).status, 'supported');
    } finally {
      deferred.forEach(({ resolve }) => resolve({ supported: true }));
      await new Promise(resolve => setImmediate(resolve));
    }
  }
});

test('synchronous evaluator failures release capacity', async () => {
  let fail = true;
  const provider = createCapabilities(caps(), { evaluate: () => {
    if (fail) throw new Error('Device unavailable');
    return { supported: true };
  } });
  for (let i = 0; i < 8; i++) await assert.rejects(provider.evaluateRequest(request), /Device unavailable/);
  fail = false;
  assert.equal((await provider.evaluateRequest(request)).status, 'supported');
});

test('metadata retains project, edition, license, translations and unverified references', () => {
  assert.deepEqual(getMetadata(metadata()), example.metadata);
  assert.equal(resolveLocalizedText(metadata().project.title, 'fr-CA', 'en'), 'Lignes de marée');
  assert.equal(resolveLocalizedText(metadata().project.title, 'de', 'en'), 'Tidal Lines');
  assert.equal(resolveLocalizedText({ fr: 'Bonjour' }), 'Bonjour');
  assert.equal(getProvenanceReferences(metadata())[0].kind, 'archive');
  const m = metadata(); delete m.provenance;
  assert.deepEqual(getProvenanceReferences(m), []);
  m.provenance = []; m.project.creators[0].references = [];
  assert.deepEqual(getProvenanceReferences(m), []);
  m.provenance = [{ kind: 'blockchain', uri: 'urn:example:chain:token' }, { kind: 'archive', uri: 'ipfs://example-cid' }];
  assert.equal(getMetadata(m).provenance.length, 2);
});

test('metadata rejects invalid dates, edition numbers, locales, and active reference URLs', () => {
  for (const mutate of [m => m.project.title = '', m => m.project.creators = [], m => m.edition.number = 101,
    m => m.project.date = '2025-02-29', m => m.project.date = '2026-13', m => m.project.date = 'yesterday',
    m => m.defaultLocale = 'not_a_locale', m => m.project.title = { 'bad_locale': 'Title' },
    m => m.provenance[0].verified = true, m => m.provenance[0].uri = 'javascript:alert(1)',
    m => m.provenance[0].uri = 'file:///etc/passwd', m => m.provenance[0].uri = 'https://user:password@example.com']) {
    const m = metadata(); mutate(m); assert.throws(() => getMetadata(m));
  }
  const leap = metadata(); leap.project.date = '2024-02-29'; assert.equal(getMetadata(leap).project.date, '2024-02-29');
});

test('static parsing rejects executable, polluted, cyclic, oversized and deeply nested data', () => {
  let executed = false;
  const accessor = {}; Object.defineProperty(accessor, 'schemaVersion', { enumerable: true, get() { executed = true; } });
  assert.throws(() => parseDiscovery(accessor)); assert.equal(executed, false);
  const hook = { toJSON() { executed = true; return example; } };
  assert.throws(() => parseDiscovery(hook)); assert.equal(executed, false);
  for (const input of ['not json', '{"__proto__":{}}', '{"constructor":{}}', { ...example, schemaVersion: '2' },
    { ...example, extra: () => {} }, { ...example, extra: new Date() }, { ...example, extra: [,,] }]) assert.throws(() => parseDiscovery(input));
  const circular = {}; circular.self = circular; assert.throws(() => parseDiscovery(circular));
  let nested = {}; for (let i = 0; i < 25; i++) nested = { nested };
  assert.throws(() => parseDiscovery(nested), code('LIMIT'));
  assert.throws(() => parseDiscovery(' '.repeat(49153)), code('LIMIT'));
  const large = metadata(); large.project.description = 'é'.repeat(20000); assert.throws(() => getMetadata(large), code('LIMIT'));
  assert.equal({}.polluted, undefined);
});

test('discovery has deterministic static round trips and escapes embedded script endings', () => {
  assert.deepEqual(parseDiscovery(serializeDiscovery(example)), example);
  const manifest = structuredClone(example); manifest.metadata.project.description = '</script><script>alert(1)</script>';
  const json = serializeDiscovery(manifest); assert.ok(!json.includes('<'));
  assert.deepEqual(parseDiscovery(json), manifest);
  manifest.metadata.project.description = '<'.repeat(9000);
  assert.throws(() => serializeDiscovery(manifest), code('LIMIT'));
  const provider = createDiscovery(example);
  provider.getDiscovery().artwork.id = 'changed'; assert.equal(provider.getDiscovery().artwork.id, example.artwork.id);
});

test('existing artworks remain unchanged; opt-in discovery queries support cleanup and identity checks', async () => {
  const art = createArtwork({ ...example.artwork, seed: 'sample' });
  const original = art.manifest(); const recipe = art.getRecipe();
  assert.deepEqual(Object.keys(original.queries), ['state', 'recipe']);
  const unregister = registerDiscovery(art, createDiscovery(example));
  for (const [query, expected] of [['discovery', example], ['metadata', example.metadata], ['capabilities', example.capabilities], ['provenance', example.metadata.provenance]]) {
    assert.deepEqual(await art.query(query), expected);
  }
  assert.throws(() => registerDiscovery(art, createDiscovery(example)), /Duplicate/);
  assert.deepEqual(art.getRecipe(), recipe);
  unregister(); unregister(); assert.deepEqual(art.manifest(), original);
  assert.throws(() => registerDiscovery(createArtwork({ id: 'different', version: '1', seed: 'sample' }), createDiscovery(example)), /different artwork/);
  const conflict = art.registerQuery('metadata', { handler: () => ({}) });
  assert.throws(() => registerDiscovery(art, createDiscovery(example)), /Duplicate/);
  assert.ok(!art.manifest().queries.discovery); conflict();
});

test('both standalone packages load through their public workspace exports', async () => {
  const capabilityPackage = await import('@oriel-art/capabilities');
  const metadataPackage = await import('@oriel-art/metadata');
  assert.deepEqual(capabilityPackage.getCapabilities(caps()), caps());
  assert.deepEqual(metadataPackage.getMetadata(metadata()), metadata());
  const sdkDiscovery = await import('@oriel-art/artist-sdk/discovery');
  assert.deepEqual(sdkDiscovery.parseDiscovery(example), example);
});
