import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createDevServer } from '../scripts/serve.mjs';

let server, browser, base;
before(async () => {
  server = createDevServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'darwin' ? 'chrome' : undefined),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
async function pageFor(t) {
  const context = await browser.newContext({ deviceScaleFactor: 2 }); t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); t.after(() => assert.deepEqual(errors, []));
  await page.goto(base + '/examples/renderers/');
  await page.waitForFunction(() => window.rendererExamples || !document.querySelector('#status').textContent.startsWith('Loading'), null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => !!window.rendererExamples), true, await page.locator('#status').textContent());
  return page;
}
for (const kind of ['canvas', 'p5', 'p5-webgl', 'three']) test(`${kind}: exact pixels, saved replay, independent export and cleanup`, { timeout: 30000 }, async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async kind => {
    const { makeRenderer, artwork } = window.rendererExamples;
    const host = document.createElement('div'); document.body.append(host);
    const renderer = makeRenderer(kind, { container: host });
    const state = { ...artwork.getRecipe(), time: 12.5 };
    await renderer.render({ width: 96, height: 64, state });
    const saved = renderer.getSnapshot();
    const dimensions = [renderer.canvas.width, renderer.canvas.height];
    const baseline = await renderer.exportPNG();
    const pending = renderer.exportPNG();
    state.parameters.count = 5; state.time = 80;
    await renderer.render({ width: 80, height: 80, state });
    const edited = renderer.canvas.toDataURL(), editedSnapshot = renderer.getSnapshot();
    const captured = await pending;
    const preserved = edited === renderer.canvas.toDataURL();
    const replay = await renderer.exportPNG({ snapshot: JSON.parse(JSON.stringify(saved)) });
    const resized = await renderer.exportPNG({ snapshot: saved, width: 192, height: 128 });
    const pixels = await createImageBitmap(resized);
    const output = document.createElement('canvas'); output.width = pixels.width; output.height = pixels.height;
    const ctx = output.getContext('2d'); ctx.drawImage(pixels, 0, 0);
    const rgba = ctx.getImageData(0, 0, output.width, output.height).data;
    const varied = new Set(Array.from(rgba).filter((_, i) => i % 4 !== 3)).size > 5;
    const digest = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).join(',');
    const hashes = await Promise.all([baseline, captured, replay].map(digest));
    const resizedDimensions = [pixels.width, pixels.height]; pixels.close();
    renderer.dispose(); renderer.dispose();
    return { dimensions, resizedDimensions, hashes, preserved, varied, editedSnapshot,
      children: host.children.length, canvasGone: renderer.canvas === null };
  }, kind);
  assert.deepEqual(result.dimensions, [96, 64]); assert.deepEqual(result.resizedDimensions, [192, 128]);
  assert.equal(new Set(result.hashes).size, 1); assert.equal(result.preserved, true);
  assert.equal(result.varied, true); assert.equal(result.editedSnapshot.state.time, 80);
  assert.equal(result.children, 0); assert.equal(result.canvasGone, true);
});

test('p5 callbacks are scoped to an instance, failures clean up, and WebGL 1 remains explicit', { timeout: 30000 }, async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const { createP5Renderer } = await import('/src/renderers.js');
    const { p5 } = window.rendererExamples;
    const before = window.setup;
    const host = document.createElement('div'); document.body.append(host);
    let fail = true;
    const renderer = createP5Renderer({ p5, container: host, mode: 'webgl', webglVersion: 1,
      draw(p) { if (fail) throw new Error('artist failure'); p.background(200); p.box(12); } });
    let error;
    try { await renderer.render({ width: 32, height: 32, state: {} }); } catch (e) { error = e.message; }
    const afterFailure = host.children.length;
    fail = false;
    await renderer.render({ width: 32, height: 32, state: {} });
    const gl = renderer.canvas.getContext('webgl');
    const version = gl.getParameter(gl.VERSION);
    renderer.dispose();
    return { error, afterFailure, version, globalUntouched: before === window.setup, children: host.children.length };
  });
  assert.match(result.error, /artist failure/); assert.equal(result.afterFailure, 0);
  assert.match(result.version, /WebGL 1/); assert.equal(result.globalUntouched, true); assert.equal(result.children, 0);
});

test('Three.js releases artist scene resources after failed update and each export', { timeout: 30000 }, async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const { createThreeRenderer } = await import('/src/renderers.js');
    const { THREE } = window.rendererExamples;
    let created = 0, released = 0, fail = true;
    const renderer = createThreeRenderer({ THREE, createScene() {
      created++;
      return { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
        update() { if (fail) throw new Error('bad update'); }, dispose() { released++; } };
    } });
    let error;
    try { await renderer.render({ width: 32, height: 32, state: {} }); } catch (e) { error = e.message; }
    fail = false;
    await renderer.render({ width: 32, height: 32, state: {} });
    await renderer.exportPNG(); await renderer.exportPNG();
    renderer.dispose();
    return { error, created, released };
  });
  assert.match(result.error, /bad update/); assert.equal(result.created, 4); assert.equal(result.released, 4);
});

test('renderer validation rejects asynchronous p5 drawing and bad Three.js shaders with cleanup', { timeout: 30000 }, async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const { createP5Renderer, createThreeRenderer } = await import('/src/renderers.js');
    const { p5, THREE } = window.rendererExamples;
    const host = document.createElement('div'); document.body.append(host);
    const p = createP5Renderer({ p5, container: host, draw: async () => {} });
    let asyncCode, shaderCode, disposed = 0;
    try { await p.render({ width: 32, height: 32, state: {} }); } catch (e) { asyncCode = e.code; }
    p.dispose();
    const three = createThreeRenderer({ THREE, container: host, createScene() {
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10); camera.position.z = 2;
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.ShaderMaterial({ vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: 'void main(){ this is invalid shader source; }' });
      scene.add(new THREE.Mesh(geometry, material));
      return { scene, camera, update() {}, dispose() { disposed++; geometry.dispose(); material.dispose(); } };
    } });
    try { await three.render({ width: 32, height: 32, state: {} }); } catch (e) { shaderCode = e.code; }
    three.dispose();
    return { asyncCode, shaderCode, disposed, children: host.children.length };
  });
  assert.equal(result.asyncCode, 'INVALID_INPUT'); assert.equal(result.shaderCode, 'SHADER_COMPILE');
  assert.equal(result.disposed, 1); assert.equal(result.children, 0);
});
