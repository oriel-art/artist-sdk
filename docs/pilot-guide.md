# Mihira's JavaScript / WebGL pilot

Version: **0.1.0-alpha.3**. This is an experimental SDK to try on an actual
artwork. It contains working code and examples; the broader feature plan remains
a proposal. APIs and recipe/protocol versions can change after artist feedback.

The first project, **Kepler's Dream**, uses plain JavaScript and GLSL on an HTML canvas. No p5.js,
Three.js, React, build step, network service, or runtime dependency is required.
An alpha.2 integration has been reported; its source/tests have not been supplied
here. Read the [feedback record](keplers-dream-feedback.md) and
[alpha.3 integration guide](alpha3-guide.md) for revisions and remaining validation.

## Start with the working examples

From a checkout of this repository, with Node.js 22 or later:

```sh
npm run dev
```

Open `http://127.0.0.1:4173/examples/webgl/` for the shader studio, or
`http://127.0.0.1:4173/examples/host/` for the iframe bridge viewer. Use HTTP;
double-clicking an HTML file will not provide the module/origin environment.
`PORT=4200 npm run dev` selects a different local port.

Try this sequence:

1. Open a seed and adjust the density and palette.
2. Pause, or return to time zero. Focus the canvas and try `s`, `Space`, and `i`.
3. Save a PNG at 1024, 2048, or 4096 pixels square, subject to device limits.
4. Save the recipe or copy the link. The demo captures the displayed elapsed
   time and square aspect ratio, restoring the moment paused. `fromRecipe`
   validates core inputs; `restoreRecipe` invokes an explicit artist restoration hook.
5. Open the bridge viewer. Inspect its manifest, pause, seek to 12 seconds,
   change density, and ask the artwork for its current content.
6. Open **About this work · i** for artist-written information. Open **Parameter
   lab** to edit parameters, try boundary cases, and save a seed-sampling report.

See [artwork information and parameter testing](info-and-parameters.md) for
Kepler's Dream's existing `i` handler, custom info content, generated controls,
and JavaScript utilities for repeatable artist checks. The info popup is optional;
the parameter lab is studio-only and stays out of core imports.

The contour study is SDK sample art, not a recreation of Mihira's work. Its
animation is a function of time; seeking does not simulate intervening frames.

## Choose how much to adopt

**Keep an existing renderer.** Import the core helpers and pass their values
into your own GLSL uniforms. You keep ownership of the canvas, context, shaders,
framebuffers, assets, animation loop, and controls. This is the appropriate path
for an existing WebGL 2 or multipass project. The core does not inspect GL state.

```js
import { createArtwork, readInputs } from './artist-sdk/src/index.js';

const inputs = readInputs(location.href);
const artwork = createArtwork({
  id: 'mihira-study',
  version: '1', // Change when artwork code or assets affect the output.
  seed: inputs.seed ?? 'study-001',
  parameters: {
    density: { type: 'integer', min: 8, max: 36, label: 'Line density' },
    contrast: { type: 'number', min: 0, max: 1, default: 0.6 },
    palette: { type: 'choice', choices: ['ink', 'clay'], weights: [3, 1] }
  },
  values: inputs.values,
  traits: p => ({ Palette: p.palette, Density: p.density < 18 ? 'Sparse' : 'Dense' })
});

// Inside your existing render function, with your own active GL program:
gl.uniform1f(densityLocation, artwork.parameters.density);

// Each call creates a NEW generator at the start of this named stream.
const composition = artwork.random('composition');
const phase = composition.float(0, Math.PI * 2);
```

Copy the complete `src` directory into the project and adjust the relative
import path. All source files use native ES modules. For a project with a package
bundler, create a local package with `npm pack --cache /tmp/artist-sdk-npm-cache`,
install the resulting `.tgz`, and import from `@oriel-art/artist-sdk`,
`@oriel-art/artist-sdk/webgl`, or `@oriel-art/artist-sdk/bridge`. There is no npm
registry release yet. The package has no TypeScript declaration files in this pilot.

**Use the optional shader runner.** It owns a fresh canvas/context and draws a
fullscreen triangle with your fragment shader. Do not attach it to a context
your existing renderer owns. See `examples/webgl/main.js` and `shader.js`.

```js
import { createShaderRenderer } from './artist-sdk/src/webgl.js';

const renderer = createShaderRenderer({
  canvas: document.querySelector('canvas'),
  artwork,
  fragment: fragmentShaderSource,
  uniforms: ({ parameters }) => ({ u_density: parameters.density })
});
renderer.render({ width: 1000, height: 1000, time: 0 });
const png = await renderer.exportPNG({ width: 3000, height: 3000 });
// A Blob is returned; downloadBlob(png, 'study.png') saves it.
// Call renderer.dispose() when the work is removed.
```

Runner support is **WebGL 1 / GLSL ES 1.00, one fragment pass**, with scalar
float/int/bool and float vec2/vec3/vec4 uniforms. Active uniforms must have values.
It supplies `u_resolution` (output pixels), `u_time` (seconds), and `u_seed`
(four deterministic floats in [0, 1)); shaders may omit unused uniforms.
By default these automatic values override custom values. Configure `bindings`
with a different uniform name or null to give ownership to the artist; see the
[alpha.3 guide](alpha3-guide.md#preserve-the-original-export-uniforms). Samplers, arrays, matrices,
custom geometry/vertex shaders, WebGL 2 shaders, feedback, and external textures
require an artist-owned renderer; export support for those is future work.

## Seed, parameters, and recipes

- Seeds are exact, nonempty strings up to 4096 characters. They are not trimmed,
  lowercased, or truncated to part of a token hash. `fnv1a-sfc32-v1` identifies
  the artistic PRNG and its derivation; it is not cryptographic randomness.
- `createRandom(seed, stream)` provides `next`, `float`, inclusive `int`, `bool`,
  `choice(values, weights)`, `normal(mean, deviation)`, and independent `fork(name)`.
  Retain a generator to advance a sequence. Recreating it restarts the sequence.
- Parameter IDs are stable, case-sensitive identifiers. Sampling uses separate
  keyed streams, so labels, object order, or unrelated parameters do not alter
  an existing parameter's sampled value.
- Supported parameter types are `number`, `integer`, `boolean`, and `choice`.
  With the default SDK generator, resolution priority is explicit value, then default, then sampled value.
  An optional versioned artist `resolver` runs original generation first, then
  applies overrides. Complete supplied values bypass generation on import.
  Numeric bounds are required; boolean probability and choice weights are optional.
  Dependencies, constraints, vectors, colors, and additional declarative
  distributions are not implemented.
- `setParameters(patch)` validates before updating, increments the revision,
  and emits `state.changed`. Values are immutable scalars. Trait callbacks must
  be deterministic and side-effect free. They are evaluated at initialization
  and parameter updates, then cached so reading state never reevaluates them.
- `mode: 'published'` locks parameter edits. Only bind shortcuts and studio seed
  controls when your UI policy allows them. Custom commands remain the artist's
  responsibility; this flag is not a security boundary or platform adapter.

`artwork.getRecipe()` returns recipe format 0.2 with `artworkId`, `artworkVersion`,
`randomVersion`, parameter `generator`, `seed`, and fully resolved `parameters`.
Optional artist context carries a schema ID/version and validated JSON.
`getRecipe({ context: data })` captures a new comparison context; ordinary
`getRecipe()` preserves imported context, without observing the live clock.

`fromRecipe(recipe, originalArtworkOptions)` validates complete values and matching
artwork, generator and context versions, returning core state with `getContext()`.
It does not restore rendering. `restoreRecipe(recipe, { ...options, restoreContext })`
explicitly awaits an artist hook to apply time/cadence/aspect and render. Missing
hooks for context-bearing recipes and incompatible versions fail explicitly.
Legacy 0.1 SDK recipes still import with documented context-free defaults;
legacy artist integrations require explicit generator-identity migration.

See the [alpha.3 guide](alpha3-guide.md#save-and-restore-a-comparison-moment) for
full APIs and URL migration. Context supports an artwork's own direct-time
reconstruction; it is not a generic simulation, feedback-buffer or interaction
history snapshot. Keep matching artwork source/assets with recipes. Cross-device
pixel identity is not promised, particularly for GLSL math.

## Rendering and exporting

The runner captures the last successful frame's parameter values, time,
revision, and uniform values. Export rerenders those values into a separate
canvas/context; it never resizes the visible canvas or reruns the uniform callback.
This also prevents export from advancing random generators retained by that
callback. A parameter change that has not been rendered is not exported.

The shader must cooperate with scaling. For the example, composition coordinates
are normalized using `min(u_resolution.x, u_resolution.y)`, CSS determines display
size, and render/export dimensions determine output pixels. This preserves its
normalized pattern at different square sizes. Pixel-based grain, thresholds, and
strokes need explicit artist decisions; changing aspect ratio may reveal more of
the composition. There is no universal rescaling of arbitrary shader effects.

`checkExportSize(gl, width, height, maxPixels)` checks the device's texture,
renderbuffer, and viewport limits and a configurable pixel budget (default
16,777,216 pixels). Its memory estimate is approximate and is not an allocation
guarantee. Allocation, shader, context, and encoding failures return errors.
Requests are never silently downscaled. Tiled output, color management, print
profiles, DPI metadata, JPEG/video, and frame-sequence exports are not included.

Only one export per runner can run at once. `exportPNG({ signal })` supports
cancellation before drawing or after encoding; it cannot interrupt synchronous
GPU work or a browser's PNG encoder. The temporary context is released. On live
context restoration, the runner rebuilds its own resources and redraws the last
snapshot; the optional `onError` callback reports loss or restoration failure.
An artist-owned renderer must manage its own context recovery and exports.

## Connect an artwork to a viewer

Register explicit operations. The SDK never interprets arbitrary JavaScript
from the viewer or invents text from pixels.

```js
import { exposeArtwork } from './artist-sdk/src/bridge.js';

artwork.registerQuery('content.current', {
  description: 'The text currently shown by this artwork',
  handler: () => ({ text: visiblePoem })
});
artwork.registerCommand('regions.activate', {
  description: 'Activate an artist-defined region',
  input: { region: { type: 'string', enum: ['north', 'south'] } },
  handler: ({ region }) => {
    activateRegion(region);
    artwork.changed({ region });
    return { region };
  }
});
const stopBridge = exposeArtwork(artwork, { allowedOrigins: [location.origin] });
```

Here `visiblePoem` and `activateRegion` are supplied by the artwork. Queries must
be pure: do not draw, mutate state, or consume a random stream. The SDK validates
inputs but cannot enforce purity in artist-written callbacks. Declare custom
events in the `events` option to `createArtwork`, then call `artwork.emit`.

The host connects **after the iframe's load event**:

```js
import { connectArtwork } from './artist-sdk/src/bridge.js';

iframe.addEventListener('load', async () => {
  const viewer = await connectArtwork(iframe, { origin: artworkOrigin });
  console.log(viewer.manifest);
  const { result, revision } = await viewer.query('content.current');
  await viewer.command('regions.activate', { region: 'north' });
  const unsubscribe = await viewer.subscribe('state.changed', event => console.log(event));
  // await unsubscribe(); viewer.close(); when the viewer is removed.
});
```

Replace `artworkOrigin` with the exact origin hosting the iframe. The artwork's
allowlist contains **host origins**, not artwork URLs. The demo only permits
its own origin; a deployed bitVerse host needs explicit configuration.
An allowed host may invoke every registered command, so register only operations
appropriate for that viewer. The bridge is not a sandbox for same-origin scripts.

The implemented protocol is **`artist-bridge/0.1`**, a limited experimental
subset of the [future bridge specification](artwork-bridge.md):

- An origin-checked, parent-window handshake transfers a `MessageChannel`.
  A new connection replaces the previous session. HTTP(S) origins only;
  no wildcard, opaque/sandbox-null origins, popup, worker, or native transport yet.
- Discovery returns artwork identity, parameter definitions, events, command
  and query input rules. `state` and `recipe` queries are built in.
- Input rules are a small vocabulary for scalar `number`, `string`, and `boolean`
  fields, with optional/bounds/enum/length constraints. They are **not JSON Schema**.
  Unknown fields are rejected. Operation results must be JSON-serializable.
- Queries and commands are serialized in receipt order within a session. A
  response means the handler completed, not merely that it was accepted. Long
  operations, progress handles, output schemas, cancellation, and binary export
  transfer are not implemented. Direct local calls are not serialized by the SDK.
- Requests have monotonic IDs and session IDs. Duplicate IDs reuse cached results
  within a 128-response window; older IDs fail instead of executing again.
  Retries across sessions are not deduplicated. Do not automatically retry a
  timed-out mutation: it may already have completed. Query state first.
- Limits are 64 KiB UTF-8 JSON per message, 32 outstanding requests, and 64
  subscriptions. Oversized responses fail with `LIMIT`; oversized events are
  dropped. Events carry revision and a per-session sequence number on the wire.
- Reload closes the host connection and rejects pending requests; reconnect
  after load. Explicitly call both disposers when removing host/artwork code.
  A peer that vanishes without a reload is detected by request timeout, not a heartbeat.
  Closing or replacing a session does not cancel an already-running artist handler;
  use short operations or manage their cancellation in the artwork itself.

The host example is a local test harness. Production bitVerse integration and
Verse, Art Blocks, and Forever Library adapters remain future work.

## Feedback to collect from Mihira

The reported Kepler's Dream integration establishes a starting point. Use the
[alpha.3 feedback checklist](keplers-dream-feedback.md#m0b-validation-still-required)
for the next actual artist session; other renderer examples do not block it.

- Which WebGL/GLSL version, browser/GPU, and extensions does it use?
- Is it one pass, multiple passes, texture-based, or dependent on previous frames?
- Which uniforms represent seed, time, resolution, mouse input, and artist parameters?
- Can it render any time directly, or must it replay simulation steps?
- Which parts were easy to adopt, and which required changing artwork code?
- Does a saved seed/parameter set reopen the intended composition? Does a larger
  export preserve the important grain, line weight, framing, and behavior?
- What should a viewer be allowed to ask or change? Use actual current text or
  named regions when the work has them, rather than adding artificial capabilities.
- Record the original and integrated files, recipe, browser/device, output size,
  error messages, integration time, and a short list of friction points.

Those observations determine the next renderer/export work and any changes to
the API. Alpha.3 artwork revalidation and the broader M0 design review remain open.

## Verification and size

```sh
npm ci
npm test
npm run test:browser
npm run size
```

The browser suite uses installed Chrome on macOS. Elsewhere install its Chromium
with `npx playwright install chromium`; `PLAYWRIGHT_CHANNEL=chrome` overrides the
channel. Tests use software WebGL for repeatability; real-device visual fidelity,
Safari/Firefox/mobile GPUs, and Mihira's artwork still need artist trials.
CI uses Chrome preinstalled on GitHub's Ubuntu 24.04 runner.
Screenshots are written to the ignored `test-results` directory.

`npm run size` reports minified, bundled, tree-shaken browser ESM and gzip costs
for useful combinations, including their dependencies. It excludes artist code,
shaders, assets, and the studio page. Budgets will be set after the first actual
integration; an on-chain-size guarantee is not implied.

Alpha.3 measurement with esbuild 0.28.2 (ES2022 ESM, gzip level 9):

| Imported functionality | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Randomness | 1,835 | 989 |
| Parameters and recipes (including restoreRecipe) | 10,623 | 4,134 |
| Browser helpers | 2,156 | 1,018 |
| Bridge, artwork and host | 4,946 | 2,317 |
| Shader runner | 7,985 | 3,681 |
| Core, renderer, and bridge | 23,646 | 9,222 |
| Optional info popup | 11,067 | 4,382 |
| Optional parameter testing | 10,582 | 4,180 |
| Optional parameter panel | 30,125 | 11,342 |

Rows are alternative bundles with shared dependencies included, not additive costs.
Alpha.3 adds recipe/context validation and richer optional studio UI; the panel
increased from 7,201 to 11,342 gzip bytes. Basic core imports still exclude it.
Record target-specific bundle needs before declaring an on-chain budget.

Browser design references: [WebGL resource and context guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
and [origin/source checks for postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
