import { connectArtwork } from '../../src/bridge.js';
const $ = id => document.getElementById(id);
const iframe = $('artwork');
let client;
const show = result => { $('content').textContent = JSON.stringify(result, null, 2); };
const run = action => async () => { try { show(await action()); } catch (error) { $('status').textContent = `${error.code}: ${error.message}`; } };
iframe.addEventListener('load', async () => {
  client?.close();
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    client = await connectArtwork(iframe, { origin: location.origin });
    window.bridge = client;
    $('status').textContent = `Connected to ${client.manifest.id}`;
    $('manifest').textContent = JSON.stringify(client.manifest, null, 2);
    for (const button of document.querySelectorAll('button')) button.disabled = false;
    await client.subscribe('state.changed', event => { $('events').textContent = JSON.stringify(event, null, 2); });
    await client.subscribe('playback.changed', event => { $('events').textContent = JSON.stringify(event, null, 2); });
    show(await client.query('content.current'));
  } catch (error) { $('status').textContent = `${error.code}: ${error.message}`; }
});
$('query').onclick = run(() => client.query('content.current'));
$('pause').onclick = run(() => client.command('playback.set', { playing: false }));
$('play').onclick = run(() => client.command('playback.set', { playing: true }));
$('seek').onclick = run(() => client.command('time.seek', { time: 12 }));
$('density').onclick = run(() => client.command('parameters.set', { density: 24 }));
iframe.src = '../webgl/?seed=bridge-reference';
addEventListener('pagehide', () => client?.close(), { once: true });
