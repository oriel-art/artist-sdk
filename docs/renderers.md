# Renderer integrations: Canvas 2D, p5.js and Three.js

The SDK core is renderer-independent. Recipes, parameters, metadata, capabilities,
discovery and capture-and-screen workflows can be used with any artist-owned
JavaScript renderer. WebGL 1 is a limit of the older optional shader runner,
not a limit of the SDK.

The experimental `@oriel-art/artist-sdk/renderers` module provides a shared
snapshot/export contract and three integrations. Libraries are supplied by the
artist; importing this module does not import or install p5.js or Three.js.
TypeScript declarations are included.

## Integration coverage

| Integration | Implemented path | Tested dependency |
| --- | --- | --- |
| Canvas 2D | Owned canvas, synchronous drawing callback, isolated PNG export | Browser Canvas 2D |
| p5.js | Instance-mode P2D and WEBGL, explicit pixel density, synchronous setup/draw | p5.js 1.11.11; WebGL 2 and explicit WebGL 1 |
| Three.js | Fresh scene/camera factory, synchronous scene updates, isolated PNG export | Three.js 0.167.0; WebGL 2 |
| Custom renderer | `createRenderSession()` with an owned-target factory | Artist supplies and tests the target |
| Existing raw GLSL runner | `createShaderRenderer()` from `/webgl` | WebGL 1, single fragment pass |

Browser regression tests use Chrome/SwiftShader and a device pixel ratio of 2.
That tests these integrations, not every library release, GPU or existing artwork.
The pinned libraries provide a concrete baseline; do not silently upgrade an
existing drop's dependency version. p5.js 2.x, WebGPU, automatic adoption of
existing global-mode sketches, and generic postprocessing/feedback replay are
not covered by these adapters.

## Run the examples

From the SDK checkout, with Node.js 22 or later:

```sh
npm ci
npm run build:renderer-examples
npm run dev
```

Open <http://127.0.0.1:4173/examples/renderers/>. It shows Canvas 2D, p5 P2D,
p5 WebGL 2 and Three.js, each with an isolated PNG export. The build bundles the
pinned development libraries locally; the page does not fetch a CDN library.
The generated bundle is excluded from Git and package tarballs. Rebuild after
editing the example. Existing WebGL/host examples still run without this build.

For your own bundled project, [install the SDK](getting-started.md#install-in-your-own-project)
and add only the drawing library you use, for example:

```sh
npm install p5@1.11.11
# Or, for the tested Three.js integration:
npm install three@0.167.0
```

## Shared snapshot and export contract

Each integration returns a session with the same methods:

```js
const saved = await renderer.render({
  width: 800,
  height: 800,
  state: { ...artwork.getRecipe(), time: 12.5 }
});
const png = await renderer.exportPNG({ width: 2400, height: 2400 });
// Export a particular saved composition even after the live preview changes:
const replay = await renderer.exportPNG({ snapshot: saved });
const downloadableState = JSON.stringify(saved);
renderer.dispose();
```

`render()` copies `{ width, height, state }` synchronously before its first
asynchronous operation. `getSnapshot()` returns an isolated copy of the most
recent successful preview. The `state` object is artist-defined finite JSON:
include the seed, resolved parameters, time/cadence and any other inputs needed
by your drawing callback. No p5 instance, Three.js scene, GL context or texture
is serialized. Signed zero is normalized for JSON persistence.

`exportPNG()` captures the selected snapshot before asynchronous work, creates a
separate target and rerenders at the requested dimensions. It can also accept an
explicit snapshot before any preview has been rendered. Save the returned PNG
Blob through your own UI or the SDK's `downloadBlob()` helper. Exports do not
resize the preview, advance its animation or replace its last saved snapshot.
A new preview may render while one export is in progress.

The session owns its preview canvas. Supply `container` to attach it; otherwise
use `renderer.canvas` after the first successful render. Each built-in target
uses **pixel density 1**, so width and height are actual image pixels. CSS may
scale the display independently. `render()` is explicit; the adapter does not
start an animation clock. Use the saved time in your drawing logic, rather than
`Date.now()`, p5 `millis()` or an incrementing `frameCount`.

These helpers enforce allocation limits. They do not infer or replace the
artwork's capability declarations. Validate export requests against your declared
technical and artist constraints before calling the renderer, including aspect
ratio rules and any required runtime evaluation.

## Canvas 2D

```js
import { createCanvasRenderer } from '@oriel-art/artist-sdk/renderers';

const renderer = createCanvasRenderer({
  container: document.querySelector('#artwork'),
  draw(ctx, { width, height, state }) {
    ctx.fillStyle = '#f3ead7';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#b14533';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, state.radius * Math.min(width, height), 0, Math.PI * 2);
    ctx.fill();
  }
});
await renderer.render({ width: 800, height: 800, state: { radius: 0.25 } });
```

The adapter clears the frame, resets the transform and wraps the callback in
`save()`/`restore()`. Draw synchronously and use balanced context state operations.
Load assets before rendering, and keep export assets accessible to each target.
Cross-origin assets must meet the browser's canvas export rules.

## p5.js

```js
import p5 from 'p5';
import { createRandom } from '@oriel-art/artist-sdk';
import { createP5Renderer } from '@oriel-art/artist-sdk/renderers';

const renderer = createP5Renderer({
  p5,
  container: document.querySelector('#artwork'),
  mode: '2d',
  draw(p, { width, height, state }) {
    // For this new sketch, use an explicit seeded generator each render.
    const random = createRandom(state.seed, 'marks');
    p.background('#f3ead7'); p.noStroke(); p.fill('#b14533');
    for (let i = 0; i < state.count; i++) {
      p.circle(random.float(0, width), random.float(0, height), Math.min(width, height) / 10);
    }
  }
});
async function start() {
  await renderer.render({ width: 800, height: 800, state: { seed: 'composition-1', count: 20 } });
}
// p5 initializes after window load. Avoid awaiting its startup at module top level.
if (document.readyState === 'complete') start().catch(console.error);
else window.addEventListener('load', () => start().catch(console.error), { once: true });
```

Calling the p5 adapter's first render before window load rejects with `NOT_READY`.
`setup(p)` is optional and synchronous, and runs once for every new target,
including exports. The adapter creates the canvas, sets density 1 and calls
`noLoop()`; do not replace its `setup`/`draw`, call `createCanvas()` again, or start
a competing draw loop. Assets should be loaded before using the session.

Set `mode: 'webgl'` for p5 WEBGL. The default `webglVersion: 2` requires WebGL 2;
set `webglVersion: 1` explicitly for an artwork targeting WebGL 1. An unavailable
requested version fails rather than silently changing the rendering environment.
p5 WEBGL's origin and camera conventions still apply to your drawing callback.

For existing art, retain the original PRNG, hash-to-seed mapping, random/noise
seeding and call order. The example above is for a new sketch; replacing an old
sketch's generator with the SDK generator changes its output. The adapter never
calls `randomSeed()` or `noiseSeed()` for you. Reset the artwork's own generator
from saved inputs at the start of each draw when the recipe contract requires it.

Existing global-mode sketches can use core metadata/recipe/discovery APIs as-is.
To use this owned-target export integration, refactor drawing into a callback
that receives `p` and the snapshot. The SDK does not automatically rewrite global
`setup()`/`draw()` or take over an existing p5 canvas.

## Three.js

```js
import * as THREE from 'three';
import { createThreeRenderer } from '@oriel-art/artist-sdk/renderers';

const renderer = createThreeRenderer({
  THREE,
  container: document.querySelector('#artwork'),
  createScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4;
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshNormalMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    return {
      scene,
      camera,
      update({ width, height, state }) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        mesh.rotation.y = state.time * 0.2;
      },
      dispose() { geometry.dispose(); material.dispose(); }
    };
  }
});
await renderer.render({ width: 800, height: 800, state: { time: 12.5 } });
```

`createScene({ renderer, purpose, signal })` runs once for the preview and once
per export, and may be asynchronous for asset loading. Return fresh scene/camera
objects and a synchronous `update(snapshot)` callback. Update the projection for
the output aspect yourself, including orthographic bounds where appropriate.
Do not reuse a mutable live scene for an export. Set artist-specific colour/tone
mapping options consistently on each supplied Three.js renderer.

`dispose()` releases artist-owned geometry, materials, textures and other scene
resources. The SDK disposes its Three.js renderer and releases its GL context
on cleanup, including error paths. If your scene factory fails before returning,
release its partially created artist resources inside the factory. Complex
composers, feedback textures and simulations need an explicit restoration
contract; use a custom target when a single `renderer.render(scene, camera)`
is not the appropriate render operation.

## Existing renderers and saved print jobs

Keep an existing WebGL 2, regl, Paper.js or other renderer for core SDK adoption.
For the shared export contract, `createRenderSession({ createTarget })` accepts a
factory returning `{ canvas, draw, dispose }` and optional `check`/`element`.
Factories receive `{ document, purpose, signal }` and must create fresh owned
targets. Custom `draw(snapshot, { signal })` may be asynchronous; `check()` runs
after encoding to detect target loss. Never return your live/shared canvas as an
export target. The SDK cannot discover arbitrary renderer state or clone it.

A [captured print job](print-workflow-pilot.md) can supply the state for an export:

```js
const savedJob = job.getJob();
const png = await renderer.exportPNG({ snapshot: {
  width: savedJob.request.width,
  height: savedJob.request.height,
  state: { ...savedJob.capture.recipe, time: savedJob.capture.frame.elapsedSeconds }
} });
```

This mapping is illustrative: include all frame/uniform/state inputs that your
own draw callback expects. Use the captured job, not current live parameters.
The print workflow continues to handle declared constraints and screening; the
renderer creates pixels. Save the report and PNG together using the documented
digest pattern if you need to associate their exact bytes.

## Limits and cleanup

- Default maximum output: 16,777,216 pixels and 8,192 pixels per side. Configure
  `maxPixels` and `maxDimension` for your application. GL targets also check device
  limits and allocated dimensions. Scene/texture/scratch memory needs a separate
  application budget; a pixel limit does not bound all GPU memory.
- Snapshot limit: 64 KiB of finite JSON, depth 20, 5,000 nodes. These object APIs
  are for trusted in-process callers; bound and validate external record input
  before constructing objects. No artist callback executes during snapshot copying.
- One preview operation and one export per session, with no queue. Excess work
  rejects with `BUSY`. Multiple sessions need an application-level resource budget.
- Cancellation is cooperative: `signal` is checked before and after asynchronous
  stages. Work retains its target and slot until the underlying operation settles.
  There is no automatic deadline or preemption of a synchronous drawing callback.
- `dispose()` is idempotent, rejects future work and releases resources after
  in-flight work settles. It does not remove artist-owned canvases outside the
  session. A failed preview discards its target; the last successful snapshot is
  still available for replay, but partial pixels are not restored automatically.

This pass adds renderer integrations only. It does not add Art Blocks input
adapters, minting, publishing or a claim of platform certification. For an
existing drop, preserve its supplied inputs and exact rendering dependencies.

References: [p5 instance mode](https://p5js.org/reference/p5/p5/),
[p5 pixel density](https://p5js.org/reference/p5/pixelDensity/),
[p5 WebGL attributes](https://p5js.org/reference/p5/setAttributes/),
[Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), and
[Art Blocks generator/dependency conventions](https://docs.artblocks.io/protocol/on-chain-generator/).
