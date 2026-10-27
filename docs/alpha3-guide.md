# Alpha.3: sample, review and replay an artwork

Version **0.1.0-alpha.3** responds to the [Kepler's Dream integration
feedback](keplers-dream-feedback.md). These APIs are experimental. The SDK has no
runtime dependencies, and all UI remains opt-in. Keep the original renderer,
shaders, identity algorithm and platform behavior.

This guide retains the alpha.3 API and migration details. The current release is
**0.1.0-alpha.4**; see the [alpha.4 guide](alpha4-guide.md) for report presentation,
seed-input guidance and optional live preview. Recipe/report formats are unchanged.

Run `npm run dev` and open `http://127.0.0.1:4173/examples/webgl/`. Pause or seek
to a moment, open Parameter lab, sample seeds, preview a case, or save its recipe.
The example's preview opens a recipe URL and restores the selected moment paused.
It is Contour study, not Kepler's Dream. No npm registry release is published.

## Use the artist's original parameter generation

```js
const resolver = {
  id: 'kepler-original',
  version: '1', // Change when parameter generation or draw order changes.
  resolve(seed) {
    return resolveOriginalKeplerParameters(seed);
  }
};

const artworkOptions = {
  id: 'keplers-dream',
  version: '1',
  parameters: parameterDefinitions,
  resolver,
  context: comparisonContext // Defined below; omit if unused.
};
const artwork = createArtwork({ ...artworkOptions, seed: originalSeed });
```

The named functions and definitions come from the artwork. `resolve(seed)` must
be synchronous, deterministic, and return **all** declared scalar parameters.
Use fresh, isolated original generator state for each seed, preserving its
algorithm and draw order. Do not consume the live artwork's generator. The SDK
passes the exact full seed string, validates the complete result, then applies
explicit `values`/`overrides`. It does not fill holes with SDK random values.

A complete `values` object is authoritative and bypasses generation, including
on recipe import. Partial values run the resolver first, then pin supplied fields.
Without a resolver the alpha.2 SDK defaults/distributions remain in effect.
`artwork.random()` still provides the SDK PRNG; opting into a parameter resolver
does not replace that utility or patch global randomness.

```js
import { testParameters, recipeForCase } from './artist-sdk/src/testing.js';

const report = testParameters(parameterDefinitions, {
  resolver,
  seeds: recordedEditionSeeds,
  seedSource: 'Recorded Verse preview inputs',
  artwork: { id: artwork.id, version: artwork.version },
  context: comparisonContext,
  contextValues: { elapsedSeconds: 12.5, cadence: 2, aspectRatio: 1.5 },
  check(values, { seed }) {
    return needsVisualReview(values)
      ? { severity: 'warning', code: 'orbit-overlap', message: 'Inspect this orbit overlap visually' }
      : true;
  }
});

const recipe = recipeForCase(report, 0); // Uses this row's seed AND recorded values.
```

Explicit seeds, including whitespace and duplicates, are preserved. Otherwise,
`count` and `prefix` generate `prefix:0`, `prefix:1`, etc. The utility accepts up
to 10,000 seeds; the panel accepts 1,000. Exact seeds alone do not establish a
representative edition sample. Reports identify `generator` (kind, ID, version)
and `source` (explicit list with optional label, or generated prefix). Keep the
matching resolver code with a report. Counts are observations of that seed set.

Checks can return `true`, `false`, a failure message, a finding
`{ severity: 'warning' | 'failure', message, code? }`, or an array of findings.
Empty arrays pass. Exceptions become execution errors, distinguished from failed
constraints. Invalid check return types and asynchronous checks reject the run.
Resolver exceptions, invalid outputs and asynchronous resolvers are retained as
per-seed resolution errors. Async work is unsupported and cannot be cancelled by
the sampler; callbacks must be synchronous and avoid live-state side effects.

Report format `artist-parameter-report/0.2` retains every case and all findings:

- `samples`: seed, resolved `values` (null if resolution failed), `status`, issues.
- `warnings`, `failures`, `errors`: finding lists with seed, values, message and stage.
- `counts`: case counts by highest severity: error, failure, warning, pass, unchecked.
- `count`, `resolved`, `checked`, `passed`: total/usable counts and check status.
  `passed` is null without an artist check; warnings are not counted as passes.
- `summary`: statistics over successfully resolved values, including flagged cases;
  numeric extrema/mean are null when no values resolved. Histogram bins and category
  counts use the same rules as alpha.2. Cases are never silently discarded or resampled.
- `definitions`, `overrides`, optional `artwork`, optional versioned `context`.

A case with unresolved values cannot produce a recipe. A check execution error
with resolved values can still be replayed for diagnosis. `recipeForCase` supports
0.2 reports; old 0.1 reports need an explicit migration or a rerun with known
provenance. It never guesses an artist generator from an old report.

## Save and restore a comparison moment

Recipe format **0.2** adds the parameter `generator` descriptor and optional
artist-owned context. `randomVersion` continues to identify the SDK random utility,
not the artist's generator. Artwork version, generator version, recipe format and
context version are independent.

```js
const comparisonContext = {
  id: 'kepler-comparison',
  version: '1',
  validate(data) {
    return Object.keys(data).every(k => ['elapsedSeconds', 'cadence', 'aspectRatio'].includes(k))
      && Number.isFinite(data.elapsedSeconds) && data.elapsedSeconds >= 0
      && Number.isFinite(data.cadence) && data.cadence > 0
      && Number.isFinite(data.aspectRatio) && data.aspectRatio > 0
      || 'Expected nonnegative seconds and positive cadence/aspect ratio';
  }
};

const recipe = artwork.getRecipe({ context: {
  elapsedSeconds: displayedMoment.elapsedSeconds,
  cadence: displayedMoment.cadence,
  aspectRatio: compositionAspectRatio
} });
// recipe.context = { id: 'kepler-comparison', version: '1', data: { ... } }
```

Define the contract before using it in `artworkOptions`. In this example,
`elapsedSeconds` is elapsed time in seconds; the artist must define cadence's
units and time origin. `aspectRatio` describes composition, not device pixel
ratio or a print pixel count. These fields affect rendering and must not be
silently treated as passive provenance. A context is bounded to 16 KiB of UTF-8
JSON, nesting depth 16, with finite numbers and no functions, dates, undefined,
cycles or other lossy values. Validation must return true to accept, or false/a
message to reject. No code is serialized or executed from the recipe.

```js
import { fromRecipe, restoreRecipe, readInputs, shareURL } from './artist-sdk/src/index.js';

const restored = await restoreRecipe(recipe, {
  ...artworkOptions,
  async restoreContext(data, { artwork: restoredArtwork }) {
    const moment = data ?? { elapsedSeconds: 0, cadence: 1, aspectRatio: 1 };
    await rebuildAndDrawKepler({ artwork: restoredArtwork, ...moment, playing: false });
  }
});
```

`rebuildAndDrawKepler` is the artist's hook: create/reset the renderer as needed,
apply cadence, composition aspect ratio and time, draw, and resolve when ready.
`restoreRecipe` validates inputs and context before invoking it, awaits completion,
and propagates failures. It does not implement GPU rollback if that hook partially
changes an existing renderer. With a context-bearing recipe, omitting the hook
throws `CONTEXT_RESTORE_REQUIRED`. If provided, the hook also runs with null for
context-free recipes so legacy defaults can be explicit.

`fromRecipe(recipe, artworkOptions)` remains a synchronous, core-only import: it
validates context and exposes a copy through `getContext()`, but never changes a
renderer. Use it when you will explicitly restore during your own initialization.
`getRecipe()` preserves imported context; it is a saved input snapshot, not a
live clock. After playing/seeking, supply fresh context to `getRecipe({ context })`
when saving a new moment. Context capture does not mutate canonical parameters.
The built-in bridge recipe query returns saved context, not a new frame capture.

Old format 0.1 SDK recipes still import; resaving emits 0.2. They carry no artist
generator identity, so importing them with an artist resolver is rejected. For a
legacy artist integration that passed its own values into alpha.2, explicitly
review and migrate the known generator identity; do not relabel it automatically.
Unsupported generator/context versions are rejected rather than silently migrated.
Unknown canonical inputs are not regenerated to make a recipe pass validation.

`shareURL(url, recipe)` carries a full versioned recipe in a `recipe` query field,
clearing legacy seed/params fields and retaining unrelated URL fields. `readInputs`
returns `{ seed, values, recipe }` for these links; pass `inputs.recipe` to
`fromRecipe`/`restoreRecipe` to validate compatibility. Existing seed/params links
still work and keep the old `{ seed, values }` return shape. Mixed input formats
are rejected. Large recipes should use JSON files instead of the 20,000-character
URL budget. Recipes do not include shader source, external assets, simulation
buffers or interaction history. Cross-device pixel identity is not guaranteed.

## Connect the parameter lab

```js
const tools = createParameterPanel({
  artwork,
  resolver, // Must match artwork.manifest().generator; pass the same descriptor.
  seeds: recordedEditionSeeds, // Optional initial list, editable in the panel.
  seedSource: 'Recorded Verse preview inputs',
  check: checkComposition,
  onChange: state => redrawWithParameters(state.parameters),
  captureContext: () => ({
    elapsedSeconds: displayedMoment.elapsedSeconds,
    cadence: displayedMoment.cadence,
    aspectRatio: compositionAspectRatio
  }),
  onPreviewCase: async recipe => {
    await reopenKeplerRecipe(recipe); // Use the restoration workflow above.
  },
  placement: { dock: 'right', top: 80, bottom: 96, edge: 16, width: 460 }
});
```

Capture runs once when the report is generated, so every row uses the same chosen
comparison context. Sampling does not use unsaved UI drafts or the current
parameter pins; it follows the resolver/schema and any explicit utility overrides.
Preview is a separate explicit action that may replace or reload the live instance.
After replacing an instance, dispose old panels/bridge connections and mount new
ones against the restored artwork. The immutable artwork seed is never patched by
the panel. The callback receives `(recipe, { index, sample })`; its completion means
the artist's requested restoration has finished. Errors are displayed and controls
are reenabled. No preview hook means Preview is disabled; Save recipe still works.
PNG export uses the restored artist renderer or the existing runner export action.

The UI offers exact seed input (one untrimmed seed per line; no blank lines),
source labels, warning/failure/error filters, ten-case pages, recorded values,
Preview case, Save recipe and the complete report download. All cases remain
reachable. Newlines inside seeds require the JavaScript utility instead of this
textarea. A trailing newline is a blank seed and is rejected.

Numeric parameters get sliders plus precise numeric fields; float entry is not
rounded to slider steps. Optional `ui.step` controls slider granularity. Booleans
remain checkboxes. Choice lists longer than 12 entries are searchable; `ui.search`
enables search for smaller lists. Search retains the selected choice. Long names
wrap in searchable choice buttons and in the selected-value text. Native buttons
provide Tab/Enter/Space operation. For choice display hints:

```js
palette: {
  type: 'choice', choices: ['dawn', 'night'], label: 'Palette',
  ui: {
    search: true,
    choiceLabels: ['Dawn over the hills', 'A very quiet night'],
    swatches: [['#dca', '#843'], ['#112233', '#aaccdd']]
  }
}
```

Display labels/swatches are parallel arrays; values remain the original typed
primitives. Supply `#RGB` or `#RRGGBB` swatches explicitly; the SDK cannot infer
shader palette colors. Boundary cases group under readable labels and vary one
field at a time. They are not a Cartesian search or a guarantee of valid artwork.

Placement supports `dock: 'left' | 'right' | 'inline'`. `top`, `bottom`, `edge` and
`width` are nonnegative pixels (width at least 240). Offsets clamp to 25% of the
viewport on small screens. Inline docking uses the supplied `mount` container.
`tools.setPlacement({...})` updates placement; omitted fields use defaults, not
previous values. There is no automatic toolbar detection or shared studio shell.

## Preserve the original export uniforms

```js
const renderer = createShaderRenderer({
  canvas: exportPreviewCanvas, artwork, fragment: originalFragmentShader,
  bindings: { resolution: 'u_resolution', seed: null, time: null },
  uniforms: () => ({
    u_seed: originalSeedUniform,
    u_time: originalTextureDriftTime,
    // Include every other active scalar/vector uniform.
  })
});
```

Each automatic binding is a uniform name or null. Defaults remain `u_resolution`,
`u_time` and `u_seed`. A name enables SDK ownership and overrides a custom value;
null disables that automatic assignment and lets the artist supply the uniform.
Names must be distinct. Resolution can be renamed (for example `outputSize`) and
still updates to export pixels. With resolution null, all captured uniform values
remain fixed: the artist is responsible for any size-dependent shader semantics.

Custom values are captured once per successful live render. Export never calls
the uniform callback again, advances live randomness/time, or resizes the live
canvas. Only the enabled resolution binding changes for the requested output.
This does not add samplers, WebGL 2, multipass rendering, or simulation replay.

## Validation boundary

SDK fixtures cover custom resolver identity, warnings/errors, exact-case replay,
legacy/new recipes, context validation/restoration, same-environment moment
comparison, browser controls, and captured export uniforms. The reported
Kepler's Dream source/tests have not been reproduced here. The team subsequently
reported successful alpha.3 adoption and improved sampling, replay, context,
controls and uniform ownership; see the [feedback record](keplers-dream-feedback.md#reported-alpha3-results).
Alpha.4 artwork validation, real-device review, 4096 exports, other browsers,
Verse sandbox validation and Mihira's hands-on review time remain outstanding.
