import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrintWorkflow, PRINT_JOB_VERSION } from '../src/capabilities.js';

const ratio = 1512 / 803;
const artwork = { id: 'pilot', version: '1' };
const capabilities = () => ({ schemaVersion: '1.0', technical: {
  rendering: { width: { min: 1, max: 8192 }, height: { min: 1, max: 8192 },
    maxPixels: 16777216, formats: ['image/png'], aspectRatios: [ratio, 1] },
  print: { width: { min: 1, max: 24 }, height: { min: 1, max: 24 }, dpi: { min: 72, max: 600 } }
}, artist: { rendering: { aspectRatios: [ratio, 1] } } });
const captured = () => ({ recipe: { artworkId: 'pilot', artworkVersion: '1', seed: 'saved', parameters: { grain: 0.5 } },
  frame: { aspectRatio: ratio, elapsedSeconds: 12.5, cadence: 1 }, uniforms: { time: 12.5, grain: 0.5 } });
const input = () => ({ id: 'print-1', request: { width: 2048, height: 1088, format: 'image/png',
  print: { width: 8, height: 4.25, unit: 'in', dpi: 256 } }, specification: {
  paper: 'Fixture paper', printer: 'Fixture printer', colourProfile: 'Fixture profile',
  renderingIntent: 'relative-colorimetric', grain: 'Fixture grain criterion', lineWeight: 'Fixture line criterion'
} });
const passed = () => ({ grain: { passed: true }, lineWeight: { passed: true }, colour: { passed: true } });
const workflow = (options = {}) => createPrintWorkflow({ artwork, capabilities: capabilities(), capture: captured, ...options });
const code = expected => error => error.code === expected;

test('capture binds recipe, frame, uniforms, policy and print conditions before asynchronous screening', async () => {
  const live = captured(), declared = capabilities(), request = input();
  let capturedCount = 0, received;
  const flow = workflow({ capabilities: declared, capture: (art, context) => {
    assert.equal(art, artwork); assert.deepEqual(context.request, request.request);
    context.specification.paper = 'callback mutation'; capturedCount++; return live;
  }, inspect: async job => {
    received = structuredClone(job);
    job.capture.recipe.seed = 'inspector mutation'; job.specification.paper = 'inspector mutation';
    return passed();
  } });
  const job = flow.captureJob(request), saved = job.getJob();
  assert.equal(capturedCount, 1);
  const pending = job.screen();
  live.recipe.seed = 'later'; live.frame.elapsedSeconds = 99; live.uniforms.time = 99;
  declared.technical.rendering.maxPixels = 1;
  request.specification.paper = 'later'; request.request.width = 1;
  const report = await pending;
  assert.equal(report.job.schemaVersion, PRINT_JOB_VERSION);
  assert.deepEqual(report.job, saved); assert.deepEqual(received, saved);
  assert.equal(report.screening.status, 'supported');
  assert.equal(report.printApproval, 'not-granted');
  assert.deepEqual(report.checks, passed());
  report.job.capture.frame.elapsedSeconds = 777;
  assert.deepEqual(job.getJob(), saved);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), saved);
});

test('physical screening remains required with no inspector, even for an optional policy', async () => {
  const job = workflow().captureJob(input());
  assert.equal(job.validate().status, 'requires-evaluation');
  const report = await job.screen();
  assert.equal(report.screening.status, 'requires-evaluation');
  assert.equal(report.checks, undefined); assert.equal(report.printApproval, 'not-granted');
});

test('unsupported and invalid requests fail before capture, including undeclared print support', () => {
  let calls = 0;
  const capture = () => { calls++; return captured(); };
  for (const change of [c => delete c.technical.print, c => { c.technical.rendering.maxPixels = 1; },
    c => { c.artist.print = { dpi: { min: 300, max: 600 } }; }]) {
    const c = capabilities(); change(c);
    assert.throws(() => workflow({ capabilities: c, capture }).captureJob(input()), code('UNSUPPORTED'));
  }
  const flow = workflow({ capture });
  const invalid = input(); invalid.request.print.width = 7;
  assert.throws(() => flow.captureJob(invalid), code('UNSUPPORTED'));
  delete invalid.request.print;
  assert.throws(() => flow.captureJob(invalid), /Print dimensions/);
  invalid.request.extra = true;
  assert.throws(() => flow.captureJob(invalid), code('INVALID_REQUEST'));
  assert.equal(calls, 0);
});

test('capture cannot widen artist or technical ratio policy and output must match the saved frame', () => {
  for (const source of ['technical', 'artist']) {
    const c = capabilities(); c[source].rendering.aspectRatios = [1];
    const square = input(); square.request.height = 2048; square.request.print.height = 8;
    assert.throws(() => workflow({ capabilities: c }).captureJob(square), code('ASPECT_RATIO'));
  }
  const square = input(); square.request.height = 2048; square.request.print.height = 8;
  assert.throws(() => workflow().captureJob(square), code('ASPECT_RATIO'));
  const strict = capabilities(); strict.artist.rendering.aspectRatioRounding = 'strict';
  assert.throws(() => workflow({ capabilities: strict }).captureJob(input()), code('UNSUPPORTED'));
});

test('request, specification, capture and check data reject accessors, oversized data and invalid shapes', async () => {
  let getters = 0, captures = 0;
  const flow = workflow({ capture: () => { captures++; return captured(); } });
  const accessor = input(); Object.defineProperty(accessor.request, 'width', { enumerable: true, get() { getters++; return 2048; } });
  assert.throws(() => flow.captureJob(accessor), code('INVALID_INPUT'));
  const huge = input(); huge.specification.notes = 'x'.repeat(8192);
  assert.throws(() => flow.captureJob(huge), code('LIMIT'));
  const typed = input(); typed.request.extra = new Uint8Array(8 * 1024 * 1024);
  assert.throws(() => flow.captureJob(typed), code('INVALID_INPUT'));
  const badSpec = input(); badSpec.specification.renderingIntent = 'automatic';
  assert.throws(() => flow.captureJob(badSpec), code('INVALID_INPUT'));
  assert.equal(captures, 0);
  const state = captured(); Object.defineProperty(state.frame, 'aspectRatio', { enumerable: true, get() { getters++; return ratio; } });
  assert.throws(() => workflow({ capture: () => state }).captureJob(input()), code('INVALID_INPUT'));
  const tooLarge = captured(); tooLarge.recipe.extra = 'x'.repeat(65536);
  assert.throws(() => workflow({ capture: () => tooLarge }).captureJob(input()), code('LIMIT'));
  const mismatch = captured(); mismatch.recipe.artworkId = 'another-artwork';
  assert.throws(() => workflow({ capture: () => mismatch }).captureJob(input()), /identify this artwork/);
  const checks = passed(); Object.defineProperty(checks.grain, 'passed', { enumerable: true, get() { getters++; return true; } });
  await assert.rejects(workflow({ inspect: () => checks }).captureJob(input()).screen(), code('INVALID_INPUT'));
  await assert.rejects(workflow({ inspect: () => ({ grain: true }) }).captureJob(input()).screen(), code('INVALID_INPUT'));
  assert.equal(getters, 0);
});

test('asynchronous capture is rejected and does not inspect', () => {
  let inspections = 0;
  assert.throws(() => workflow({ capture: async () => captured(), inspect: () => { inspections++; return passed(); } }).captureJob(input()), /must be synchronous/);
  assert.equal(inspections, 0);
});

test('concurrent screens retain their own check evidence and never grant proof approval', async () => {
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  let calls = 0;
  const job = workflow({ inspect: () => gates[calls++].promise }).captureJob(input());
  const one = job.screen(), two = job.screen();
  await new Promise(resolve => setImmediate(resolve));
  const failed = passed(); failed.colour = { passed: false, notes: 'x'.repeat(2000) };
  gates[1].resolve(failed); gates[0].resolve(passed());
  const [a, b] = await Promise.all([one, two]);
  assert.deepEqual(a.checks, passed()); assert.equal(a.screening.status, 'supported');
  assert.deepEqual(b.checks, failed); assert.equal(b.screening.status, 'unsupported');
  assert.deepEqual(b.screening.issues.map(i => i.source), ['runtime']);
  assert.equal(a.printApproval, 'not-granted'); assert.equal(b.printApproval, 'not-granted');
});

test('a stable inspector shares four slots across workflows and retains them after timeout or cancellation', async t => {
  for (const stop of ['timeout', 'cancel']) await t.test(stop, async t => {
    const gate = Promise.withResolvers(); t.after(() => gate.resolve(passed()));
    let active = 0, peak = 0, calls = 0;
    const inspect = async () => {
      active++; calls++; peak = Math.max(peak, active);
      try { return await gate.promise; } finally { active--; }
    };
    const makeJob = () => workflow({ inspect }).captureJob(input());
    const controllers = Array.from({ length: 20 }, () => new AbortController());
    const pending = Promise.allSettled(controllers.map(controller => makeJob().screen({
      timeout: stop === 'timeout' ? 200 : 5000, signal: controller.signal
    })));
    await new Promise(resolve => setImmediate(resolve));
    if (stop === 'cancel') controllers.slice(0, 4).forEach(controller => controller.abort());
    const results = await pending;
    assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'BUSY').length, 16);
    assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === (stop === 'timeout' ? 'TIMEOUT' : 'CANCELLED')).length, 4);
    assert.deepEqual({ active, peak, calls }, { active: 4, peak: 4, calls: 4 });
    await assert.rejects(makeJob().screen(), code('BUSY'));
    gate.resolve(passed()); await new Promise(resolve => setImmediate(resolve));
    assert.equal((await makeJob().screen()).screening.status, 'supported');
    assert.equal(active, 0);
  });
});

test('inspection failures release slots, and pre-cancelled screens never inspect', async () => {
  let calls = 0;
  const inspect = () => { calls++; if (calls <= 6) throw new Error('renderer failed'); return passed(); };
  const makeJob = () => workflow({ inspect }).captureJob(input());
  await assert.rejects(makeJob().screen({ signal: AbortSignal.abort() }), code('CANCELLED'));
  assert.equal(calls, 0);
  for (let i = 0; i < 6; i++) await assert.rejects(makeJob().screen(), /renderer failed/);
  assert.equal((await makeJob().screen()).screening.status, 'supported');
});

test('structured print conditions are validated and preserved without changing image dimensions', async () => {
  const candidate = input();
  Object.assign(candidate.specification, {
    media: { manufacturer: 'Fixture', stock: 'Fixture stock', finish: 'matte', weightGsm: 300,
      inkSet: 'Fixture ink', settings: { quality: 'fixture-quality', platenGap: 2 } },
    iccProfile: { name: 'fixture.icc', sha256: 'a'.repeat(64) }, blackPointCompensation: false,
    borders: { unit: 'mm', top: 10, right: 5, bottom: 10, left: 0 },
    colourCriteria: [{ metric: 'fixture-metric', maximum: 0, unit: 'fixture-unit', method: 'fixture-method' }],
    extensions: { 'art.kepler.print.v1': { provisional: true, operatorPreset: 'fixture' } }
  });
  const expected = structuredClone(candidate);
  let received;
  const job = workflow({ inspect: saved => { received = saved; return passed(); } }).captureJob(candidate);
  candidate.specification.media.settings.quality = 'later';
  const report = await job.screen();
  assert.deepEqual(received.specification, expected.specification);
  assert.deepEqual(report.job.specification, expected.specification);
  assert.deepEqual(report.job.request, expected.request);
  assert.equal(report.printApproval, 'not-granted');
});

test('invalid structured settings and extension payloads reject before capture', () => {
  let captures = 0, getters = 0;
  const flow = workflow({ capture: () => { captures++; return captured(); } });
  const extensionAccessor = Object.defineProperty({}, 'value', { enumerable: true, get() { getters++; return 1; } });
  for (const extension of [
    { media: { weightGsm: -1 } }, { media: { settings: [] } }, { media: { unknown: true } },
    { iccProfile: { name: 'x', sha256: 'not-a-digest' } }, { blackPointCompensation: 'automatic' },
    { borders: { unit: 'px', top: 0, right: 0, bottom: 0, left: 0 } },
    { borders: { unit: 'mm', top: -1, right: 0, bottom: 0, left: 0 } },
    { borders: { unit: 'mm', top: 0, right: 0, bottom: 0 } },
    { colourCriteria: [{ metric: 'metric', maximum: -1, unit: 'unit', method: 'method' }] },
    { extensions: [] }, { extensions: { 'art.kepler.print.v1': extensionAccessor } }
  ]) {
    const candidate = input(); Object.assign(candidate.specification, extension);
    assert.throws(() => flow.captureJob(candidate), code('INVALID_INPUT'));
  }
  const huge = input(); huge.specification.extensions = { 'art.kepler.print.v1': 'x'.repeat(8192) };
  assert.throws(() => flow.captureJob(huge), code('LIMIT'));
  assert.equal(captures, 0); assert.equal(getters, 0);
});

test('unassessed quality remains pending, failure dominates pending, and legacy outcomes remain compatible', async () => {
  const cases = [
    [['passed', 'passed', 'passed'], 'supported'],
    [['passed', 'not-assessed', 'passed'], 'requires-evaluation'],
    [['not-assessed', 'not-assessed', 'not-assessed'], 'requires-evaluation'],
    [['passed', 'failed', 'passed'], 'unsupported'],
    [['failed', 'not-assessed', 'passed'], 'unsupported']
  ];
  for (const [statuses, expected] of cases) {
    const checks = Object.fromEntries(['grain', 'lineWeight', 'colour'].map((name, i) => [name, { status: statuses[i] }]));
    const report = await workflow({ inspect: () => checks }).captureJob(input()).screen();
    assert.equal(report.screening.status, expected);
    assert.deepEqual(report.checks, checks);
    assert.equal(report.screening.issues.filter(issue => issue.code === 'NOT_ASSESSED').length, statuses.filter(status => status === 'not-assessed').length);
    assert.equal(report.printApproval, 'not-granted');
  }
  const legacy = passed(); legacy.colour.passed = false;
  const report = await workflow({ inspect: () => legacy }).captureJob(input()).screen();
  assert.deepEqual(report.checks, legacy);
  assert.equal(report.screening.status, 'unsupported');
  assert.equal(report.screening.issues[0].path, 'checks.colour');
  for (const bad of [{ status: 'unknown' }, { status: 'passed', passed: false }, {}]) {
    await assert.rejects(workflow({ inspect: () => ({ ...passed(), grain: bad }) }).captureJob(input()).screen(), code('INVALID_INPUT'));
  }
});

test('capture rejections preserve actionable sources, paths and constraint codes', () => {
  let calls = 0;
  const c = capabilities(); c.technical.rendering.maxPixels = 1;
  c.artist.print = { dpi: { min: 300, max: 600 } };
  const flow = workflow({ capabilities: c, capture: () => { calls++; return captured(); } });
  assert.throws(() => flow.captureJob(input()), error => {
    assert.equal(error.code, 'UNSUPPORTED');
    assert.deepEqual(error.issues.map(issue => [issue.source, issue.code, issue.path]), [
      ['technical', 'PIXEL_LIMIT', 'width'], ['artist', 'OUT_OF_RANGE', 'print.dpi']
    ]);
    error.issues[0].code = 'caller mutation';
    return true;
  });
  assert.throws(() => flow.captureJob(input()), error => error.issues[0].code === 'PIXEL_LIMIT');
  assert.equal(calls, 0);
  const invalid = input(); invalid.request.extra = true;
  assert.throws(() => workflow().captureJob(invalid), error => error.code === 'INVALID_REQUEST' && error.issues[0].source === 'request');
  const square = input(); square.request.height = 2048; square.request.print.height = 8;
  assert.throws(() => workflow().captureJob(square), error => error.code === 'ASPECT_RATIO'
    && error.issues.every(issue => issue.code === 'ASPECT_RATIO'));
  const wrongFrame = captured(); wrongFrame.frame.aspectRatio = 3;
  assert.throws(() => workflow({ capture: () => wrongFrame }).captureJob(input()), error => error.issues[0].path === 'capture.frame.aspectRatio');
});

test('external print JSON is bounded before parsing or capture and shares policy validation', t => {
  const flow = workflow();
  assert.deepEqual(flow.captureJob(JSON.stringify(input())).getJob(), flow.captureJob(input()).getJob());
  const huge = input(); huge.specification.extensions = Object.fromEntries(Array.from({ length: 10000 }, (_, i) => [`k${i}`, 0]));
  const text = JSON.stringify(huge);
  let parsed = 0, captures = 0;
  const original = JSON.parse;
  t.mock.method(JSON, 'parse', (...args) => { parsed++; return original(...args); });
  const guarded = workflow({ capture: () => { captures++; return captured(); } });
  assert.throws(() => guarded.captureJob(text), code('LIMIT'));
  assert.equal(parsed, 0); assert.equal(captures, 0);
  assert.throws(() => guarded.captureJob('{broken'), code('INVALID_INPUT'));
  assert.throws(() => guarded.captureJob('{"id":"x","request":{},"specification":{},"extra":1}'), code('INVALID_INPUT'));
  const bad = input(); bad.request.width = 99999;
  assert.throws(() => guarded.captureJob(JSON.stringify(bad)), code('UNSUPPORTED'));
  // Raw text can fit the envelope while a component exceeds its own 8 KiB budget.
  const component = input(); component.specification.notes = 'x'.repeat(9000);
  assert.throws(() => guarded.captureJob(JSON.stringify(component)), code('LIMIT'));
  assert.equal(captures, 0);
});

test('signed zero is normalized before inspection and survives report JSON replay unchanged', async () => {
  const snapshot = captured(); snapshot.uniforms.offset = -0;
  snapshot.frame.elapsedSeconds = -0; snapshot.recipe.parameters = { zero: -0 };
  const candidate = input(); candidate.specification.extensions = { 'art.test': { zero: -0 } };
  let inspected;
  const job = workflow({ capture: () => snapshot, inspect: record => { inspected = record; return passed(); } }).captureJob(candidate);
  const report = await job.screen();
  assert.equal(Object.is(snapshot.uniforms.offset, -0), true); // Caller state is untouched.
  assert.equal(Object.is(inspected.capture.uniforms.offset, -0), false);
  assert.deepEqual(inspected, JSON.parse(JSON.stringify(report)).job);
  assert.deepEqual(report, JSON.parse(JSON.stringify(report)));
});
