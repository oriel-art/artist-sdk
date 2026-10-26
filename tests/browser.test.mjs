import { test as nodeTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createDevServer } from '../scripts/serve.mjs';

const test = (name, fn) => nodeTest(name, { timeout: 30000 }, fn);
let server, browser, base;
before(async () => {
  server = createDevServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'darwin' ? 'chrome' : undefined),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  await mkdir('test-results', { recursive: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function open(t, path = '/examples/webgl/', viewport = { width: 1400, height: 1080 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(base + path);
  await page.waitForFunction(() => window.pilot || window.bridge);
  return page;
}

test('real WebGL export is reproducible and preserves live state, dimensions, time and uniforms', async t => {
  const page = await open(t, '/');
  assert.equal(new URL(page.url()).pathname, '/examples/webgl/');
  const result = await page.evaluate(async () => {
    const { art, renderer } = window.pilot;
    window.pilot.pause();
    await art.command('time.seek', { time: 12 });
    const before = { snapshot: renderer.getSnapshot(), recipe: art.getRecipe(), width: document.querySelector('canvas').width };
    async function digest(blob) {
      const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    const png = await renderer.exportPNG({ width: 256, height: 256 });
    const bitmap = await createImageBitmap(png);
    const dimensions = [bitmap.width, bitmap.height];
    const decoded = document.createElement('canvas'); decoded.width = decoded.height = 256;
    const ctx = decoded.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = ctx.getImageData(0, 0, 256, 256).data;
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    const first = await digest(png), repeated = await digest(await renderer.exportPNG({ width: 256, height: 256 }));
    const after = { snapshot: renderer.getSnapshot(), recipe: art.getRecipe(), width: document.querySelector('canvas').width };
    const oldDensity = art.parameters.density;
    art.setParameters({ density: oldDensity === 8 ? 36 : 8 });
    // A parameter update has not drawn a new frame: export must still use the visible snapshot.
    const unrendered = await digest(await renderer.exportPNG({ width: 256, height: 256 }));
    renderer.render({ width: before.snapshot.width, height: before.snapshot.height, time: 12 });
    const changed = await digest(await renderer.exportPNG({ width: 256, height: 256 }));
    return { before, after, dimensions, colors: colors.size, first, repeated, unrendered, changed };
  });
  assert.deepEqual(result.dimensions, [256, 256]); assert.ok(result.colors > 20);
  assert.equal(result.first, result.repeated); assert.equal(result.first, result.unrendered);
  assert.notEqual(result.first, result.changed); assert.deepEqual(result.before, result.after);
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
});

test('export failures are bounded and leave the renderer usable', async t => {
  const page = await open(t);
  const result = await page.evaluate(async () => {
    const renderer = window.pilot.renderer;
    const getCode = async promise => { try { await promise; return 'unexpected success'; } catch (e) { return e.code; } };
    const tooLarge = await getCode(renderer.exportPNG({ width: 100000, height: 100000 }));
    const cancelled = await getCode(renderer.exportPNG({ width: 100, height: 100, signal: AbortSignal.abort() }));
    const first = renderer.exportPNG({ width: 512, height: 512 });
    const busy = await getCode(renderer.exportPNG());
    const blob = await first;
    const controller = new AbortController();
    const ongoing = renderer.exportPNG({ width: 512, height: 512, signal: controller.signal });
    controller.abort();
    const abortedDuring = await getCode(ongoing);
    const recovered = await renderer.exportPNG({ width: 128, height: 128 });
    return { tooLarge, cancelled, busy, abortedDuring, type: blob.type, recovered: recovered.size > 0 };
  });
  assert.deepEqual(result, { tooLarge: 'EXPORT_LIMIT', cancelled: 'CANCELLED', busy: 'BUSY', abortedDuring: 'CANCELLED', type: 'image/png', recovered: true });
});

test('shader errors include source lines; unsupported samplers and missing uniforms fail explicitly', async t => {
  const page = await open(t);
  const result = await page.evaluate(async () => {
    const { createShaderRenderer } = await import('/src/webgl.js');
    const run = (fragment, draw = false) => {
      let renderer;
      try {
        renderer = createShaderRenderer({ canvas: document.createElement('canvas'), artwork: window.pilot.art, fragment });
        if (draw) renderer.render({ width: 4, height: 4 });
        return { code: 'unexpected success' };
      } catch (e) { return { code: e.code, message: e.message }; }
      finally { renderer?.dispose(); }
    };
    return {
      invalid: run('precision highp float;\nvoid main() { THIS_IS_INVALID; }'),
      sampler: run('precision highp float; uniform sampler2D u_tex; void main(){gl_FragColor=texture2D(u_tex,vec2(0.5));}'),
      missing: run('precision highp float; uniform float u_missing; void main(){gl_FragColor=vec4(u_missing);}', true)
    };
  });
  assert.equal(result.invalid.code, 'SHADER_COMPILE'); assert.match(result.invalid.message, /2: void main/);
  assert.equal(result.sampler.code, 'UNSUPPORTED'); assert.equal(result.missing.code, 'INVALID_INPUT');
});

test('context loss fails export, then restoration redraws the previous snapshot', async t => {
  const page = await open(t);
  await page.evaluate(async () => {
    const { renderer, art } = window.pilot;
    await art.command('time.seek', { time: 8 });
    window.beforeLoss = renderer.getSnapshot();
    window.lossExtension = document.querySelector('canvas').getContext('webgl').getExtension('WEBGL_lose_context');
    if (!window.lossExtension) throw new Error('Test browser must support context loss extension');
    const lost = new Promise(resolve => document.querySelector('canvas').addEventListener('webglcontextlost', resolve, { once: true }));
    window.lossExtension.loseContext(); await lost;
  });
  assert.equal(await page.evaluate(async () => {
    try { await window.pilot.renderer.exportPNG(); } catch (e) { return e.code; }
  }), 'CONTEXT_LOST');
  await page.evaluate(async () => {
    const restored = new Promise(resolve => document.querySelector('canvas').addEventListener('webglcontextrestored', resolve, { once: true }));
    window.lossExtension.restoreContext(); await restored;
  });
  assert.equal(await page.evaluate(async () => {
    const blob = await window.pilot.renderer.exportPNG({ width: 128, height: 128 });
    return blob.size > 0 && JSON.stringify(window.beforeLoss) === JSON.stringify(window.pilot.renderer.getSnapshot());
  }), true);
});

test('iframe bridge discovers, queries, validates commands, emits events and tears down on reload', async t => {
  const page = await open(t, '/examples/host/');
  const result = await page.evaluate(async () => {
    const client = window.bridge, received = [];
    const stop = await client.subscribe('state.changed', e => received.push(e));
    await client.command('playback.set', { playing: false });
    const before = await client.query('state');
    const content = await client.query('content.current');
    const after = await client.query('state');
    let invalid; try { await client.command('parameters.set', { density: 100 }); } catch (e) { invalid = e.code; }
    const changed = await client.command('parameters.set', { density: 24 });
    await client.command('time.seek', { time: 12 });
    const current = await client.query('content.current');
    await stop();
    let unknown; try { await client.subscribe('made.up', () => {}); } catch (e) { unknown = e.code; }
    window.oldBridge = client;
    return { id: client.manifest.id, before, after, content, invalid, changed, current, received, unknown };
  });
  assert.equal(result.id, 'contour-study'); assert.deepEqual(result.before, result.after);
  assert.equal(result.invalid, 'INVALID_INPUT'); assert.equal(result.unknown, 'INVALID_INPUT');
  assert.equal(result.changed.result.parameters.density, 24); assert.equal(result.current.result.time, 12);
  assert.ok(result.received.length >= 2); assert.match(result.current.result.text, /24/);
  await page.screenshot({ path: 'test-results/bridge-desktop.png', fullPage: true });
  await page.evaluate(() => document.querySelector('iframe').contentWindow.location.reload());
  await page.waitForFunction(() => window.bridge !== window.oldBridge);
  assert.equal(await page.evaluate(async () => { try { await oldBridge.query('state'); } catch (e) { return e.code; } }), 'DISCONNECTED');
});

test('duplicate wire commands execute once and stale sessions cannot mutate state', async t => {
  const page = await open(t, '/examples/host/');
  const result = await page.evaluate(async () => {
    window.bridge.close();
    const protocol = 'artist-bridge/0.1', session = 'duplicate-test';
    const frame = document.querySelector('iframe');
    const channel = new MessageChannel(), port = channel.port1;
    const waiting = new Map();
    port.onmessage = ({ data }) => { const handlers = waiting.get(data.kind === 'ready' ? 'ready' : data.id); handlers?.shift()?.(data); };
    const next = key => new Promise(resolve => { if (!waiting.has(key)) waiting.set(key, []); waiting.get(key).push(resolve); });
    const ready = next('ready');
    frame.contentWindow.postMessage({ protocol, session, kind: 'connect' }, location.origin, [channel.port2]);
    await ready;
    const query = next(1); port.postMessage({ protocol, session, id: 1, kind: 'query', name: 'state' });
    const before = await query;
    const one = next(2), two = next(2);
    const command = { protocol, session, id: 2, kind: 'command', name: 'time.seek', input: { time: 99 } };
    port.postMessage(command); port.postMessage(command);
    const replies = await Promise.all([one, two]);
    port.postMessage({ ...command, session: 'stale-session', id: 3, input: { time: 200 } });
    const last = next(4); port.postMessage({ protocol, session, id: 4, kind: 'query', name: 'content.current' });
    const final = await last;
    port.postMessage({ protocol, session, kind: 'close' }); port.close();
    return { before, replies, final };
  });
  assert.deepEqual(result.replies[0], result.replies[1]);
  assert.equal(result.replies[0].revision, result.before.revision + 1);
  assert.equal(result.final.result.time, 99);
});

test('unlisted parent origin is rejected during handshake', async t => {
  const page = await open(t);
  const other = createDevServer();
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => other.close(resolve)));
  const otherOrigin = `http://127.0.0.1:${other.address().port}`;
  const result = await page.evaluate(async origin => {
    const { connectArtwork } = await import('/src/bridge.js');
    const frame = document.createElement('iframe'); frame.src = origin + '/examples/webgl/';
    const loaded = new Promise(resolve => frame.onload = resolve); document.body.append(frame); await loaded;
    try { await connectArtwork(frame, { origin, timeout: 250 }); return 'unexpected success'; }
    catch (e) { return e.code; }
    finally { frame.remove(); }
  }, otherOrigin);
  assert.equal(result, 'TIMEOUT');
});

test('bridge enforces UTF-8 message limits and reports oversized handler results', async t => {
  const page = await open(t, '/examples/host/');
  const result = await page.evaluate(async () => {
    const art = document.querySelector('iframe').contentWindow.pilot.art;
    art.registerQuery('large.result', { handler: () => ({ text: 'λ'.repeat(40000) }) });
    let response, request;
    try { await window.bridge.query('large.result'); } catch (e) { response = e.code; }
    try { await window.bridge.command('parameters.set', { text: 'λ'.repeat(40000) }); } catch (e) { request = e.code; }
    const state = await window.bridge.query('state');
    return { response, request, stillConnected: state.result.revision === 0 };
  });
  assert.deepEqual(result, { response: 'LIMIT', request: 'LIMIT', stillConnected: true });
});

test('canvas shortcuts do not intercept typing and mobile layout stays within the viewport', async t => {
  const page = await open(t, '/examples/webgl/', { width: 390, height: 844 });
  await page.locator('#seed').fill(''); await page.locator('#seed').press('s');
  assert.equal(await page.locator('#seed').inputValue(), 's');
  const info = page.getByRole('dialog', { name: 'Contour study' });
  assert.equal(await info.isVisible(), false);
  await page.locator('canvas').focus(); await page.keyboard.press('i');
  assert.equal(await info.isVisible(), true);
  await page.screenshot({ path: 'test-results/info-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement === document.querySelector('canvas'));
  const download = page.waitForEvent('download'); await page.keyboard.press('s');
  assert.match((await download).suggestedFilename(), /1024\.png$/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true });
});

test('info popup manages focus, toggles with i, and exposes read-only artist content through the bridge', async t => {
  const page = await open(t);
  const before = await page.evaluate(() => window.pilot.art.getState());
  await page.locator('canvas').focus(); await page.keyboard.press('i');
  const dialog = page.getByRole('dialog', { name: 'Contour study' });
  assert.equal(await dialog.isVisible(), true);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(d => d.contains(d.getRootNode().activeElement)), true);
  }
  await page.screenshot({ path: 'test-results/info-desktop.png', fullPage: true });
  await page.keyboard.press('i');
  await page.waitForFunction(() => document.activeElement === document.querySelector('canvas'));
  assert.equal(await dialog.isVisible(), false);
  assert.deepEqual(await page.evaluate(() => window.pilot.art.getState()), before);
  await page.goto(base + '/examples/host/'); await page.waitForFunction(() => window.bridge);
  const info = await page.evaluate(async () => (await window.bridge.query('info')).result);
  assert.equal(info.title, 'Contour study'); assert.ok(info.controls.some(c => c.key === 'i'));
});

test('info content is text, rejects unsafe links, can update, and disposes its keyboard binding', async t => {
  const page = await open(t);
  const result = await page.evaluate(() => {
    const panel = window.pilot.infoPanel;
    panel.setInfo({ title: 'Test info', description: '<img src=x onerror="window.injected=true">', links: [{ label: 'About', url: 'https://example.org/' }] });
    const before = panel.getInfo();
    let error; try { panel.setInfo({ title: 'Unsafe', links: [{ label: 'x', url: 'javascript:alert(1)' }] }); } catch (e) { error = e.code; }
    const copy = panel.getInfo(); copy.title = 'mutated';
    panel.open();
    return { before, current: panel.getInfo(), error, images: panel.element.shadowRoot.querySelectorAll('img').length, injected: Boolean(window.injected) };
  });
  assert.deepEqual(result.current, result.before); assert.equal(result.error, 'INVALID_INPUT');
  assert.equal(result.images, 0); assert.equal(result.injected, false);
  assert.match(await page.getByRole('dialog', { name: 'Test info' }).innerText(), /<img src=x/);
  await page.getByRole('link', { name: 'About', exact: true }).focus();
  await page.evaluate(() => window.pilot.infoPanel.setInfo({ title: 'Updated info' }));
  assert.equal(await page.getByRole('dialog', { name: 'Updated info' }).evaluate(d => d.getRootNode().activeElement?.textContent), 'Close');
  await page.evaluate(() => window.pilot.infoPanel.dispose());
  await page.locator('canvas').focus(); await page.keyboard.press('i');
  assert.equal(await page.getByRole('dialog').count(), 0);
});

test('parameter lab previews edits and boundary cases, restores starting values, and samples without mutation', async t => {
  const page = await open(t);
  const initial = await page.evaluate(() => window.pilot.art.parameters);
  await page.locator('#parameter-tools').click();
  const dialog = page.getByRole('dialog', { name: 'Parameter lab' });
  await dialog.getByLabel('Line density', { exact: true }).fill('30');
  await dialog.getByRole('button', { name: 'Apply values', exact: true }).click();
  await page.waitForFunction(() => window.pilot.art.parameters.density === 30);
  assert.equal(await page.evaluate(() => window.pilot.renderer.getSnapshot().parameters.density), 30);
  await page.locator('canvas').click();
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('canvas')), true);
  assert.equal(await dialog.isVisible(), true);
  await dialog.getByLabel('Boundary case', { exact: true }).selectOption({ label: 'density = 8' });
  await dialog.getByRole('button', { name: 'Load case into fields' }).click();
  assert.equal(await page.evaluate(() => window.pilot.art.parameters.density), 30);
  await dialog.getByRole('button', { name: 'Apply values', exact: true }).click();
  assert.equal(await page.evaluate(() => window.pilot.art.parameters.density), 8);
  await dialog.getByRole('button', { name: 'Restore starting values' }).click();
  assert.deepEqual(await page.evaluate(() => window.pilot.art.parameters), initial);
  const before = await page.evaluate(() => ({ state: window.pilot.art.getState(), snapshot: window.pilot.renderer.getSnapshot() }));
  await dialog.getByLabel('Sample count', { exact: true }).fill('200');
  await dialog.getByRole('button', { name: 'Run parameter checks' }).click();
  assert.match(await dialog.innerText(), /200 seeds sampled/);
  assert.deepEqual(await page.evaluate(() => ({ state: window.pilot.art.getState(), snapshot: window.pilot.renderer.getSnapshot() })), before);
  assert.equal(await page.evaluate(() => window.pilot.parameterPanel.getReport().samples.length), 200);
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Save report' }).click();
  assert.match((await download).suggestedFilename(), /parameter-report\.json$/);
  await page.screenshot({ path: 'test-results/parameter-lab-desktop.png', fullPage: true });
});

test('parameter panel protects dirty drafts from external changes', async t => {
  const page = await open(t);
  await page.locator('#parameter-tools').click();
  const dialog = page.getByRole('dialog', { name: 'Parameter lab' });
  await dialog.getByLabel('Line density', { exact: true }).fill('30');
  await page.evaluate(() => window.pilot.art.setParameters({ density: 12 }));
  await dialog.getByRole('button', { name: 'Apply values', exact: true }).click();
  assert.equal(await page.evaluate(() => window.pilot.art.parameters.density), 12);
  assert.match(await dialog.innerText(), /Parameters changed outside/);
  await dialog.getByRole('button', { name: 'Reload current values' }).click();
  assert.equal(await dialog.getByLabel('Line density', { exact: true }).inputValue(), '12');
});

test('parameter tools preserve boolean and choice types, reject published mode, and report artist checks', async t => {
  const page = await open(t, '/examples/webgl/', { width: 390, height: 844 });
  const result = await page.evaluate(async () => {
    const { createArtwork } = await import('/src/index.js');
    const { createParameterPanel } = await import('/src/parameter-panel.js');
    const options = { id: 'typed', version: '1', seed: 'typed', parameters: {
      enabled: { type: 'boolean', default: true }, mode: { type: 'choice', choices: [0, '0', false], default: '0' }
    } };
    let forbidden;
    try { createParameterPanel({ artwork: createArtwork({ ...options, mode: 'published' }) }); } catch (e) { forbidden = e.code; }
    window.typedArt = createArtwork(options);
    window.typedPanel = createParameterPanel({ artwork: window.typedArt, check: () => 'Example failure' });
    window.typedPanel.open(); return { forbidden };
  });
  assert.equal(result.forbidden, 'FORBIDDEN');
  const dialog = page.getByRole('dialog', { name: 'Parameter lab' });
  await dialog.getByLabel('enabled', { exact: true }).uncheck();
  await dialog.getByLabel('mode', { exact: true }).selectOption('0');
  await dialog.getByRole('button', { name: 'Apply values', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.typedArt.parameters), { enabled: false, mode: 0 });
  await dialog.getByRole('button', { name: 'Run parameter checks' }).click();
  assert.match(await dialog.innerText(), /100 failed artist checks/);
  assert.equal(await page.evaluate(() => window.typedPanel.getReport().failures[0].message), 'Example failure');
  assert.equal(await dialog.evaluate(d => d.getBoundingClientRect().width <= innerWidth && d.scrollWidth <= d.clientWidth), true);
  await page.screenshot({ path: 'test-results/parameter-lab-mobile.png', fullPage: true });
  await page.evaluate(() => window.typedPanel.dispose());
  assert.equal(await page.getByRole('dialog').count(), 0);
});
