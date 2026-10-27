import test from 'node:test';
import assert from 'node:assert/strict';
import { getCapabilities, validateRequest, createCapabilities } from '../src/capabilities.js';
import { parseDiscovery, serializeDiscovery } from '../src/discovery.js';
import { createModeExample, createSavedPrintJob, rendererCapabilities, EXAMPLE_ASPECT_RATIO } from '../examples/discovery/modes-and-print.mjs';

const output = (width, height) => ({ width, height, format: 'image/png' });
const caps = ratio => ({ schemaVersion: '1.0', technical: { rendering: {
  width: { min: 1, max: 8192 }, height: { min: 1, max: 8192 }, maxPixels: 8192 ** 2,
  formats: ['image/png'], aspectRatios: [ratio]
} } });
const code = expected => error => error.code === expected;

test('nearest rounding accepts the reported 2048 x 1088 export and rejects adjacent sizes', async () => {
  const packaged = await import('@oriel-art/capabilities');
  const description = caps(EXAMPLE_ASPECT_RATIO);
  assert.equal(validateRequest(description, output(2048, 1088)).status, 'supported');
  assert.equal(packaged.validateRequest(description, output(2048, 1088)).status, 'supported');
  for (const height of [1087, 1089]) {
    assert.equal(validateRequest(description, output(2048, height)).issues[0].code, 'ASPECT_RATIO');
  }
  description.technical.rendering.aspectRatioRounding = 'strict';
  assert.equal(validateRequest(description, output(2048, 1088)).issues[0].code, 'ASPECT_RATIO');
  assert.equal(packaged.validateRequest(description, output(2048, 1088)).issues[0].code, 'ASPECT_RATIO');
  assert.equal(validateRequest(description, output(1512, 803)).status, 'supported');
});

test('rounding supports width- and height-anchored landscape/portrait exports and half-pixel ties', () => {
  for (const ratio of [EXAMPLE_ASPECT_RATIO, 1 / EXAMPLE_ASPECT_RATIO, 16 / 9, 1, 2 / 3]) {
    for (const anchor of [64, 101, 1088, 2048]) {
      const description = caps(ratio);
      assert.equal(validateRequest(description, output(anchor, Math.round(anchor / ratio))).status, 'supported');
      assert.equal(validateRequest(description, output(Math.round(anchor * ratio), anchor)).status, 'supported');
    }
  }
  assert.equal(validateRequest(caps(2), output(101, 51)).status, 'supported');
  assert.equal(validateRequest(caps(2), output(101, 50)).status, 'unsupported');
  assert.equal(validateRequest(caps(1), output(100, 101)).status, 'unsupported');
});

test('technical and artist rounding policies apply independently and cannot be overridden by a request', async () => {
  const description = caps(EXAMPLE_ASPECT_RATIO);
  description.artist = { rendering: { aspectRatios: [EXAMPLE_ASPECT_RATIO], aspectRatioRounding: 'strict' } };
  let calls = 0;
  const provider = createCapabilities(description, { evaluate: () => { calls++; return { supported: true }; } });
  const rejected = await provider.evaluateRequest(output(2048, 1088));
  assert.deepEqual(rejected.issues.map(i => [i.source, i.code]), [['artist', 'ASPECT_RATIO']]);
  assert.equal(calls, 0);
  description.artist.rendering.aspectRatioRounding = 'nearest';
  description.technical.rendering.aspectRatioRounding = 'strict';
  assert.deepEqual(validateRequest(description, output(2048, 1088)).issues.map(i => i.source), ['technical']);
  assert.equal(validateRequest(description, { ...output(2048, 1088), aspectRatioRounding: 'nearest' }).issues[0].code, 'INVALID_REQUEST');
});

test('rounding does not waive size budgets and invalid policies fail closed', () => {
  const description = caps(EXAMPLE_ASPECT_RATIO);
  description.technical.rendering.maxPixels = 2048 * 1088 - 1;
  assert.equal(validateRequest(description, output(2048, 1088)).issues[0].code, 'PIXEL_LIMIT');
  for (const policy of ['floor', 1, null, {}]) {
    const c = caps(1); c.technical.rendering.aspectRatioRounding = policy;
    assert.throws(() => getCapabilities(c), code('INVALID_INPUT'));
  }
  const c = caps(1); delete c.technical.rendering.aspectRatios;
  c.technical.rendering.aspectRatioRounding = 'nearest';
  assert.throws(() => getCapabilities(c), /requires aspectRatios/);
});

test('mode discovery preserves rounding policy and advertises no implicit bridge commands', async () => {
  for (const mode of ['studio', 'collector']) {
    const example = createModeExample(mode);
    const { artwork, discovery } = example;
    const manifest = discovery.getDiscovery();
    const before = artwork.getRecipe();
    assert.deepEqual(await artwork.query('discovery'), parseDiscovery(serializeDiscovery(manifest)));
    assert.equal(manifest.capabilities.technical.rendering.aspectRatioRounding, 'nearest');
    assert.equal(manifest.capabilities.technical.animation.seek, mode === 'studio');
    assert.equal(manifest.capabilities.technical.state.restore, mode === 'studio');
    assert.equal(manifest.capabilities.technical.state.deterministic, undefined);
    assert.deepEqual(artwork.manifest().commands, {});
    await assert.rejects(artwork.command('parameters.set', { grain: 0.6 }), code('UNSUPPORTED'));
    assert.deepEqual(artwork.getRecipe(), before);
    if (mode === 'studio') artwork.setParameters({ grain: 0.6 });
    else assert.throws(() => artwork.setParameters({ grain: 0.6 }), code('FORBIDDEN'));
    example.unregister();
  }
  assert.equal(rendererCapabilities().technical.animation.seek, true);
  assert.equal(validateRequest(rendererCapabilities(), { ...output(2048, 1088), state: { deterministic: true } }).status, 'unsupported');
});

test('print screening stays bound to a captured composition and frame without granting approval', async () => {
  const { artwork, unregister } = createModeExample('studio');
  const frame = { elapsedSeconds: 12.5, cadence: 1, aspectRatio: EXAMPLE_ASPECT_RATIO };
  const request = { ...output(2048, 1088), print: { width: 8, height: 4.25, unit: 'in', dpi: 256 } };
  let inspection;
  const job = createSavedPrintJob(artwork, { frame, request, inspect: async input => {
    inspection = structuredClone({ recipe: input.recipe, request: input.request });
    input.recipe.parameters.grain = 1; // Inspection cannot alter the captured job.
    return { grain: true, lineWeight: true, colour: true };
  } });
  const captured = job.getJob();
  frame.elapsedSeconds = 99; request.width = 999;
  artwork.setParameters({ grain: 0.9 });
  const live = artwork.getRecipe();
  assert.equal(job.validate().status, 'requires-evaluation');
  const result = await job.screen();
  assert.equal(result.screening.status, 'supported');
  assert.equal(result.printApproval, 'not-granted');
  assert.deepEqual(inspection, captured);
  assert.deepEqual(result.job, captured);
  assert.deepEqual(job.getJob(), captured);
  assert.deepEqual(artwork.getRecipe(), live);
  const rejected = createSavedPrintJob(artwork, { frame: captured.recipe.context.data, request: captured.request,
    inspect: () => ({ grain: true, lineWeight: true, colour: false }) });
  assert.equal((await rejected.screen()).screening.issues[0].source, 'runtime');
  const invalid = createSavedPrintJob(artwork, { frame: captured.recipe.context.data, request: captured.request,
    inspect: () => ({ grain: true, lineWeight: true }) });
  await assert.rejects(invalid.screen(), /Inspection must explicitly report/);
  unregister();
});
