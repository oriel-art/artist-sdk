import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderSession } from '../src/renderers.js';

const document = { createElement() {} };
const frame = () => ({ width: 32, height: 16, state: { seed: 'saved', parameters: { density: 3 }, time: 1 } });
const code = expected => error => error.code === expected;
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ create, draw, encode, check } = {}) {
  const targets = [];
  const renderer = createRenderSession({ document, maxPixels: 4096, maxDimension: 128, createTarget: async context => {
    const target = { purpose: context.purpose, released: 0, removed: 0,
      canvas: { width: 1, height: 1, remove() { target.removed++; }, toBlob(callback) {
        if (encode) encode(callback, target);
        else callback(new Blob(['png'], { type: 'image/png' }));
      } },
      async draw(snapshot) {
        target.canvas.width = snapshot.width; target.canvas.height = snapshot.height;
        target.received = structuredClone(snapshot);
        if (draw) await draw(snapshot, target);
      }, check() { check?.(target); }, dispose() { target.released++; } };
    targets.push(target);
    if (create) await create(target);
    return target;
  } });
  return { renderer, targets };
}

test('snapshot capture precedes async work and callback/caller edits cannot change saved state', async () => {
  const gate = Promise.withResolvers();
  const { renderer } = fixture({ draw: async snapshot => { await gate.promise; snapshot.state.seed = 'callback'; } });
  const input = frame(); const pending = renderer.render(input);
  input.state.parameters.density = 99;
  await assert.rejects(renderer.render(frame()), code('BUSY'));
  gate.resolve();
  const result = await pending;
  assert.equal(result.state.seed, 'saved'); assert.equal(result.state.parameters.density, 3);
  result.state.seed = 'returned copy';
  assert.equal(renderer.getSnapshot().state.seed, 'saved');
  renderer.dispose();
});

test('exports use isolated captured targets while later preview renders proceed', async () => {
  const gate = Promise.withResolvers();
  const { renderer, targets } = fixture({ draw: async (_, target) => { if (target.purpose === 'export') await gate.promise; } });
  await renderer.render(frame());
  const exported = renderer.exportPNG({ width: 64, height: 32 });
  const next = frame(); next.state.seed = 'later';
  await renderer.render(next);
  await assert.rejects(renderer.exportPNG(), code('BUSY'));
  gate.resolve(); await exported;
  assert.equal(targets.length, 2);
  assert.equal(targets[1].received.state.seed, 'saved'); assert.equal(targets[1].received.width, 64);
  assert.equal(targets[1].released, 1); assert.equal(targets[0].released, 0);
  assert.equal(renderer.getSnapshot().state.seed, 'later');
  renderer.dispose(); renderer.dispose(); assert.equal(targets[0].released, 1);
});

test('size, state and cancellation failures reject before any target allocation', async () => {
  const { renderer, targets } = fixture();
  for (const overrides of [{ width: 0 }, { width: 129 }, { width: 128, height: 128 }, { height: 1.5 }]) {
    await assert.rejects(renderer.render({ ...frame(), ...overrides }));
  }
  let reads = 0;
  const state = Object.defineProperty({}, 'seed', { enumerable: true, get() { reads++; return 'no'; } });
  await assert.rejects(renderer.render({ ...frame(), state }), code('INVALID_INPUT'));
  await assert.rejects(renderer.render({ ...frame(), state: { value: 'x'.repeat(65536) } }), code('LIMIT'));
  await assert.rejects(renderer.render({ ...frame(), signal: AbortSignal.abort() }), code('CANCELLED'));
  await assert.rejects(renderer.exportPNG(), code('NOT_READY'));
  await assert.rejects(renderer.exportPNG({ snapshot: frame(), width: 129 }), code('EXPORT_LIMIT'));
  assert.equal(reads, 0); assert.equal(targets.length, 0);
});

test('explicit saved snapshots export without a preview and normalize signed zero', async () => {
  const { renderer, targets } = fixture();
  const saved = frame(); saved.state.time = -0;
  await renderer.exportPNG({ snapshot: saved });
  assert.equal(renderer.canvas, null); assert.equal(renderer.getSnapshot(), null);
  assert.equal(Object.is(targets[0].received.state.time, -0), false);
  assert.equal(Object.is(saved.state.time, -0), true);
  assert.equal(targets[0].released, 1);
});

test('cancelled encoding retains its slot and resources until settlement, then recovers', async () => {
  let finish;
  const { renderer, targets } = fixture({ encode: callback => { finish = callback; } });
  await renderer.render(frame());
  const abort = new AbortController();
  const pending = renderer.exportPNG({ signal: abort.signal });
  const rejected = assert.rejects(pending, code('CANCELLED'));
  await tick(); abort.abort();
  await assert.rejects(renderer.exportPNG(), code('BUSY'));
  assert.equal(targets[1].released, 0);
  finish(new Blob(['png'], { type: 'image/png' })); await rejected;
  assert.equal(targets[1].released, 1);
  const recovered = renderer.exportPNG(); await tick();
  finish(new Blob(['png'], { type: 'image/png' })); await recovered;
  renderer.dispose();
});

test('disposal during target creation releases late resources exactly once', async () => {
  const gate = Promise.withResolvers();
  const { renderer, targets } = fixture({ create: () => gate.promise });
  const pending = renderer.render(frame());
  const rejected = assert.rejects(pending, code('DISPOSED'));
  await tick(); renderer.dispose();
  assert.equal(targets[0].released, 0);
  gate.resolve(); await rejected;
  assert.equal(targets[0].released, 1);
  await assert.rejects(renderer.exportPNG({ snapshot: frame() }), code('DISPOSED'));
});

test('draw and encoder failures release resources and allow recovery', async () => {
  let failDraw = true, failEncode = true;
  const { renderer, targets } = fixture({ draw: () => { if (failDraw) throw new Error('draw failed'); },
    encode: callback => callback(failEncode ? null : new Blob(['png'], { type: 'image/png' })) });
  await assert.rejects(renderer.render(frame()), /draw failed/);
  assert.equal(targets[0].released, 1);
  failDraw = false; await renderer.render(frame());
  await assert.rejects(renderer.exportPNG(), code('ENCODE_FAILED'));
  assert.equal(targets[2].released, 1);
  failEncode = false; await renderer.exportPNG();
  assert.equal(targets[3].released, 1);
  renderer.dispose();
});

test('post-encode target validation rejects lost contexts and releases the export', async () => {
  const { renderer, targets } = fixture({ check: () => { throw new Error('context lost'); } });
  await assert.rejects(renderer.exportPNG({ snapshot: frame() }), /context lost/);
  assert.equal(targets[0].released, 1);
});

test('a custom export factory cannot reuse or dispose the preview canvas', async () => {
  let releases = 0;
  const target = { canvas: { width: 32, height: 16, remove() {}, toBlob() {} }, draw() {}, dispose() { releases++; } };
  const renderer = createRenderSession({ document, createTarget: () => target });
  await renderer.render(frame());
  await assert.rejects(renderer.exportPNG(), code('INVALID_TARGET'));
  assert.equal(releases, 0); assert.equal(renderer.canvas, target.canvas);
  renderer.dispose(); assert.equal(releases, 1);
});

test('p5 initialization before window load rejects instead of deadlocking module evaluation', async () => {
  const { createP5Renderer } = await import('../src/renderers.js');
  let calls = 0;
  const renderer = createP5Renderer({ document: { ...document, readyState: 'loading' }, p5: class { constructor() { calls++; } }, draw() {} });
  await assert.rejects(renderer.render(frame()), code('NOT_READY'));
  assert.equal(calls, 0);
});

for (const operation of ['render', 'exportPNG']) for (const action of ['abort', 'dispose']) {
  test(`${operation}: ${action} between target creation and drawing releases without drawing`, async () => {
    const targets = [], contexts = [], appended = [];
    let draws = 0;
    const renderer = createRenderSession({ document, container: { ownerDocument: document, append: target => appended.push(target) },
      // Synchronous factory places the queued action after make's check, before its caller resumes.
      createTarget(context) {
        contexts.push(context);
        const target = { released: 0, removed: 0,
          canvas: { width: context.width, height: context.height, remove() { target.removed++; },
            toBlob(callback) { callback(new Blob(['png'], { type: 'image/png' })); } },
          draw() { draws++; }, dispose() { target.released++; } };
        targets.push(target); return target;
      } });
    const abort = new AbortController();
    const run = signal => operation === 'render' ? renderer.render({ ...frame(), signal })
      : renderer.exportPNG({ snapshot: frame(), width: 64, height: 32, signal });
    const pending = run(abort.signal);
    queueMicrotask(() => action === 'abort' ? abort.abort() : renderer.dispose());
    await assert.rejects(pending, code(action === 'abort' ? 'CANCELLED' : 'DISPOSED'));
    assert.equal(draws, 0); assert.equal(appended.length, 0);
    assert.equal(targets[0].released, 1); assert.equal(targets[0].removed, 1);
    assert.equal(renderer.canvas, null);
    assert.deepEqual([contexts[0].width, contexts[0].height], operation === 'render' ? [32, 16] : [64, 32]);
    if (action === 'abort') { await run(); assert.equal(draws, 1); }
    else await assert.rejects(run(), code('DISPOSED'));
    renderer.dispose();
    assert.ok(targets.every(target => target.released === 1 && target.removed === 1));
  });
}
