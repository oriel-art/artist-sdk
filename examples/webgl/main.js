import { createArtwork, fromRecipe, readInputs, shareURL, downloadBlob, bindShortcuts } from '../../src/index.js';
import { createShaderRenderer } from '../../src/webgl.js';
import { exposeArtwork } from '../../src/bridge.js';
import { createInfoPanel } from '../../src/info.js';
import { createParameterPanel } from '../../src/parameter-panel.js';
import { fragment } from './shader.js';

const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
const report = error => status(`${error.code ?? 'ERROR'}: ${error.message}`);
try {
  const inputs = readInputs(location.href);
  const options = { id: 'contour-study', version: '1', seed: inputs.seed ?? 'mihira-pilot-001',
    parameters: { density: { type: 'integer', min: 8, max: 36, label: 'Line density' },
      palette: { type: 'choice', choices: ['ochre', 'tide', 'clay'], label: 'Palette' } },
    context: { id: 'contour-playback', version: '1', validate: data =>
      Object.keys(data).every(key => ['elapsedSeconds', 'aspectRatio'].includes(key))
      && Number.isFinite(data.elapsedSeconds) && data.elapsedSeconds >= 0 && data.elapsedSeconds <= 86400
      && data.aspectRatio === 1 || 'Expected elapsedSeconds (0–86400) and square composition' },
    values: inputs.values, events: ['playback.changed'],
    traits: p => ({ Palette: p.palette, Density: p.density < 18 ? 'Sparse' : 'Dense' }) };
  const art = inputs.recipe ? fromRecipe(inputs.recipe, options) : createArtwork(options);
  const palettes = { ochre: [[.17,.22,.19],[.86,.65,.35]], tide: [[.12,.27,.30],[.82,.86,.77]], clay: [[.15,.15,.17],[.78,.39,.27]] };
  const canvas = $('art');
  const renderer = createShaderRenderer({ canvas, artwork: art, fragment, onError: report,
    uniforms: ({ parameters }) => ({ u_density: parameters.density,
      u_ink: palettes[parameters.palette][0], u_paper: palettes[parameters.palette][1] }) });
  let time = art.getContext()?.elapsedSeconds ?? 0, playing = !inputs.recipe && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previous = performance.now(), frame, disposed = false;
  const paint = () => {
    const width = Math.max(1, Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2)));
    renderer.render({ width, height: width, time });
    $('dimensions').textContent = `${width} × ${width} / ${time.toFixed(1)}s`;
  };
  const update = () => {
    $('density').value = art.parameters.density;
    $('density-label').textContent = art.parameters.density;
    $('palette').value = art.parameters.palette;
    paint();
  };
  const playback = next => {
    playing = next; previous = performance.now();
    $('pause').textContent = playing ? 'Pause' : 'Play';
    art.emit('playback.changed', { playing, time });
    return { playing, time };
  };
  art.registerCommand('playback.set', { description: 'Pause or resume the live work', input: { playing: { type: 'boolean' } }, handler: ({ playing }) => playback(playing) });
  art.registerCommand('time.seek', { description: 'Evaluate this stateless shader at a time in seconds', input: { time: { type: 'number', min: 0, max: 86400 } }, handler: input => {
    time = input.time; previous = performance.now(); art.changed({ time }); paint(); return { time };
  } });
  art.registerCommand('parameters.set', { description: 'Change studio line density', input: { density: { type: 'number', min: 8, max: 36 } }, handler: ({ density }) => { const result = art.setParameters({ density }); update(); return result; } });
  art.registerQuery('content.current', { description: 'Artist-authored description of the visible composition', handler: () => ({
    text: `A ${art.parameters.palette} field of ${art.parameters.density} contour bands.`, time: renderer.getSnapshot()?.time ?? 0, playing
  }) });
  const infoPanel = createInfoPanel({ artwork: art, shortcutTarget: canvas, info: {
    title: 'Contour study', artist: 'Oriel / Artist SDK example',
    description: 'A field of shifting lines, held together by a seed. A fragment shader draws every pixel; the same seed and parameters recover its composition.',
    sections: [{ heading: 'Keeping a moment', text: 'Pause at a moment you like and save a PNG. Export rerenders the visible frame at a new resolution. Recipes and links preserve seed, parameters, and this moment; saved moments reopen paused.' }],
    controls: [{ key: 'i', description: 'Open or close this information panel' },
      { key: 'Space', description: 'Pause or resume while the canvas has focus' },
      { key: 's', description: 'Save the visible moment as a PNG' }]
  } });
  const captureContext = () => ({ elapsedSeconds: renderer.getSnapshot()?.time ?? time, aspectRatio: 1 });
  const parameterPanel = createParameterPanel({ artwork: art, onChange: update, captureContext,
    onPreviewCase: recipe => { location.href = shareURL(location.href, recipe); } });
  art.registerQuery('info', { description: 'Artist-written information and controls', handler: () => infoPanel.getInfo() });
  $('info').onclick = () => infoPanel.open();
  $('parameter-tools').onclick = () => parameterPanel.open();
  // This example accepts its own origin only. A deployed host needs an explicit allowlist.
  const stopBridge = exposeArtwork(art, { allowedOrigins: [location.origin] });
  $('seed').value = art.seed; $('seed-label').textContent = art.seed;
  $('seed-form').addEventListener('submit', event => { event.preventDefault(); const url = new URL(location.href); url.searchParams.set('seed', $('seed').value); url.searchParams.delete('params'); url.searchParams.delete('recipe'); location.href = url.href; });
  $('density').addEventListener('input', () => { try { art.setParameters({ density: Number($('density').value) }); update(); } catch (error) { report(error); } });
  $('palette').addEventListener('change', () => { art.setParameters({ palette: $('palette').value }); update(); });
  $('pause').addEventListener('click', () => playback(!playing));
  $('reset').addEventListener('click', () => { art.command('time.seek', { time: 0 }).catch(report); });
  const save = async () => {
    $('save').disabled = true; status('Rendering a separate PNG…');
    try {
      const size = Number($('size').value);
      const blob = await renderer.exportPNG({ width: size, height: size });
      downloadBlob(blob, `${art.id}-${art.seed.replace(/[^\w-]/g, '_').slice(0, 60)}-${size}.png`);
      status(`Saved ${size} × ${size}. The live state is unchanged.`);
    } finally { $('save').disabled = false; }
  };
  $('save').addEventListener('click', () => save().catch(report));
  $('recipe').addEventListener('click', () => downloadBlob(new Blob([JSON.stringify(art.getRecipe({ context: captureContext() }), null, 2)], { type: 'application/json' }), `${art.id}-recipe.json`));
  $('link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(shareURL(location.href, art.getRecipe({ context: captureContext() }))); status('Link copied. It preserves this moment and reopens paused.'); } catch (error) { report(error); } });
  const unbind = bindShortcuts(canvas, { s: save, ' ': () => playback(!playing) }, report);
  const animate = now => {
    if (disposed) return;
    if (playing) time += Math.min((now - previous) / 1000, .1);
    previous = now;
    try { if (playing) paint(); } catch (error) { playback(false); report(error); }
    frame = requestAnimationFrame(animate);
  };
  const observer = new ResizeObserver(() => { try { paint(); } catch (error) { report(error); } });
  observer.observe(canvas);
  update(); playback(playing); status('Ready. Every variation starts with a seed.');
  frame = requestAnimationFrame(animate);
  addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); unbind(); infoPanel.dispose(); parameterPanel.dispose(); stopBridge(); renderer.dispose(); }, { once: true });
  // Local example diagnostics, not part of the bridge or SDK global API.
  window.pilot = { art, renderer, infoPanel, parameterPanel, pause: () => playback(false) };
} catch (error) { report(error); }
