import p5 from 'p5';
import * as THREE from 'three';
import { createArtwork, createRandom, downloadBlob } from '../../src/index.js';
import { createCanvasRenderer, createP5Renderer, createThreeRenderer } from '../../src/renderers.js';

export const artwork = createArtwork({ id: 'renderer-study', version: '1', seed: 'oriel-study',
  parameters: { count: { type: 'integer', min: 4, max: 40, default: 16 } } });
const composition = state => {
  const random = createRandom(state.seed, 'composition');
  return Array.from({ length: state.parameters.count }, () => ({ x: random.float(0.1, 0.9),
    y: random.float(0.1, 0.9), radius: random.float(0.02, 0.08) }));
};

export function makeRenderer(kind, options = {}) {
  if (kind === 'canvas') return createCanvasRenderer({ ...options, draw(ctx, { width, height, state }) {
    ctx.fillStyle = '#f3ead7'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#b14533';
    for (const mark of composition(state)) {
      ctx.beginPath(); ctx.arc(mark.x * width, mark.y * height, mark.radius * Math.min(width, height), 0, Math.PI * 2); ctx.fill();
    }
  } });
  if (kind === 'p5' || kind === 'p5-webgl') return createP5Renderer({ ...options, p5,
    mode: kind === 'p5-webgl' ? 'webgl' : '2d', draw(p, { width, height, state }) {
      p.background('#f3ead7'); p.noStroke(); p.fill('#b14533');
      if (kind === 'p5-webgl') p.translate(-width / 2, -height / 2);
      for (const mark of composition(state)) p.circle(mark.x * width, mark.y * height, 2 * mark.radius * Math.min(width, height));
    } });
  if (kind === 'three') return createThreeRenderer({ ...options, THREE, createScene() {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#f3ead7');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.z = 4;
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshNormalMaterial({ flatShading: true });
    const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
    return { scene, camera, update({ width, height, state }) {
      camera.aspect = width / height; camera.updateProjectionMatrix();
      mesh.rotation.set(state.time * 0.1, state.time * 0.2, state.parameters.count * 0.03);
    }, dispose() { geometry.dispose(); material.dispose(); } };
  } });
  throw new Error(`Unknown renderer ${kind}`);
}

const sessions = [];
const status = document.querySelector('#status');
async function boot() {
try {
  for (const [kind, title] of [['canvas', 'Canvas 2D'], ['p5', 'p5.js · P2D'], ['p5-webgl', 'p5.js · WebGL 2'], ['three', 'Three.js · WebGL 2']]) {
    const article = document.createElement('article'), heading = document.createElement('h2'), container = document.createElement('div');
    heading.textContent = title; article.append(heading, container); document.querySelector('main').append(article);
    const session = makeRenderer(kind, { container }); sessions.push(session);
    await session.render({ width: 320, height: 320, state: { ...artwork.getRecipe(), time: 12.5 } });
    const button = document.createElement('button'); button.textContent = 'Save 1024px PNG'; article.append(button);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { downloadBlob(await session.exportPNG({ width: 1024, height: 1024 }), `${kind}.png`); status.textContent = `${title} exported from the saved snapshot.`; }
      catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  status.textContent = 'Ready. Exports use a separate canvas and preserve the preview.';
  window.rendererExamples = { makeRenderer, artwork, sessions, p5, THREE };
} catch (error) { status.textContent = error.message; throw error; }
}
if (document.readyState === 'complete') void boot();
else window.addEventListener('load', () => void boot(), { once: true });
window.addEventListener('pagehide', () => sessions.forEach(session => session.dispose()), { once: true });
