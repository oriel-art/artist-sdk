# Artwork information and parameter testing

Available in **0.1.0-alpha.2**. Mihira's first artwork, **Kepler's Dream**, already
has an `i` action for information. The SDK now provides an optional popup that
can take over the presentation of that information, plus parameter tools for
the artist's development workflow. The actual Kepler's Dream source and text
have not been integrated; the runnable example remains Contour study.

Run `npm run dev`, open `/examples/webgl/`, and use **About this work · i** or
**Parameter lab**. The info popup uses a modal HTML dialog with contained keyboard
focus. The parameter lab floats beside the artwork so applied changes remain
visible and the canvas stays interactive. Both have scoped styles, Escape/Close
dismissal, a persistent Close button, and focus restoration. Escape closes the
parameter lab when focus is inside it. Neither alters WebGL resources or
automatically pauses playback.

## Supply information once

```js
import { createInfoPanel } from './artist-sdk/src/info.js';

const infoPanel = createInfoPanel({
  artwork, // Optional: show this instance's seed and current traits.
  info: {
    title: "Kepler's Dream",
    artist: 'Mihira',
    description: artistStatement, // Supply the artwork's own text.
    sections: [
      { heading: 'About the work', text: aboutTheWork },
      { heading: 'Credits', text: credits }
    ],
    controls: [
      { key: 'i', description: 'Show artwork information' },
      { key: 's', description: 'Save an image' }
    ],
    links: [] // Optional { label, url } items with absolute HTTP(S) URLs.
  }
});

// In the existing i-key action, call:
infoPanel.toggle();

// An on-screen info button can call infoPanel.open().
```

`artistStatement`, `aboutTheWork`, `credits`, and `artwork` come from the artist's
project. Describing a shortcut in `controls` does not install it; list only
actions the artwork actually supports.

If there is no existing `i` handler, pass `shortcutTarget: canvas`. The SDK then
binds `i` while that canvas has focus and closes the open panel on a second `i`.
The canvas should be focusable (`tabindex="0"`). Typing in other controls does
not trigger this shortcut. Choose either the existing handler or the SDK binding
to avoid duplicate toggles. With an existing handler, Escape and the Close
button always dismiss the panel, even while the canvas cannot receive keys.

The returned object provides `open()`, `close()`, `toggle()`, `getInfo()`,
`setInfo(completeReplacement)`, `element`, and `dispose()`. Information is copied
on read and write. It is rendered as plain text; HTML and Markdown are not
interpreted, and executable links are rejected. The popup works in published
mode because opening it does not edit parameters or advance randomness.

Supply an optional `mount` element to choose where the UI is attached; it defaults
to `document.body`. Styles are scoped with Shadow DOM. Theme the host through
`infoPanel.element.style` or inherited CSS variables: `--artist-sdk-paper`,
`--artist-sdk-ink`, `--artist-sdk-accent`, and `--artist-sdk-font`. Call `dispose()`
when removing the artwork to remove the popup, subscriptions, and SDK key binding.

## Let the viewer ask for the same information

Register an explicit read-only operation before exposing the artwork bridge:

```js
const removeInfoQuery = artwork.registerQuery('info', {
  description: 'Artist-written information, credits, links, and controls',
  handler: () => infoPanel.getInfo()
});

// After the host connects:
const { result: info } = await viewer.query('info');
```

This query does not open the popup, draw a frame, or change artwork state. The
example exposes it through the local host viewer's bridge. Register commands
to open/close UI only if that is something the host should control. Call the
returned unregister function when tearing down that query. Information is still
subject to the bridge's message-size limit; large essays can remain local.

## Inspect and preview parameters

```js
import { createParameterPanel } from './artist-sdk/src/parameter-panel.js';

const tools = createParameterPanel({
  artwork,
  onChange: state => redrawWithParameters(state.parameters)
});
tools.open();
// tools.close(); tools.dispose(); when appropriate.
```

`redrawWithParameters` is the artwork's existing render/update function. This
works with an artist-owned WebGL renderer; adopting the SDK shader runner is
not required. With that runner, the callback can call `renderer.render` using
the current preview dimensions and time.

The panel offers:

- Generated numeric, boolean, and choice controls from the artwork's definitions.
  A choice of `0`, `'0'`, or `false` retains its original type.
- Draft edits with **Apply values**, **Reload current values**, and **Restore
  starting values**. Starting values mean those captured when the panel was created.
  Applying values keeps the original seed; save a recipe/link to retain the overrides.
- A boundary-case selector: numeric minimum/maximum, each boolean value, and each
  choice. Loading a case changes the fields; Apply previews it in the artwork.
- A seed sampler with observed ranges, means, category counts, and artist-check
  failures. A downloadable JSON report includes every sampled value and histogram.

The panel calls `setParameters` before `onChange`. If rendering fails, it reports
that the values were applied but redraw failed; it does not claim to have rolled
back artist-owned GPU state. If parameters change elsewhere while a draft is
being edited, Apply requires a reload instead of overwriting that change silently.

Parameter tools require `mode: 'studio'`; constructing them in published mode
throws `FORBIDDEN`. They have no global hotkey and are not exposed as viewer bridge
commands. The returned `getReport()` gives a copy of the most recent batch report.

## Test many seeds from JavaScript or Node

```js
import { testParameters, parameterCases } from './artist-sdk/src/testing.js';

const report = testParameters(parameterDefinitions, {
  prefix: 'kepler-trial',
  count: 500,
  check: (values, { seed }) => {
    // Use actual rules from the artwork. Return true, false, or a failure message.
    return isValidComposition(values) || `Unsuitable composition: ${seed}`;
  }
});

console.table(report.summary);
console.log(report.failures); // Seed, resolved values, and failure message.

// Replay the exact failed seeds, or test a deliberately chosen set:
const retry = testParameters(parameterDefinitions, {
  seeds: ['kepler-trial:0', 'kepler-trial:12'],
  overrides: { /* Optional fixed parameter values. */ }
});

// One-variable edge cases around a particular instance:
const cases = parameterCases(parameterDefinitions, {
  seed: artwork.seed,
  values: artwork.parameters
});
for (const testCase of cases) {
  console.log(testCase.name, testCase.values);
  // Feed values into the artist's visual or numerical checks.
}
```

Package imports are `@oriel-art/artist-sdk/info`, `.../parameter-panel`, and
`.../testing`. All are optional submodules; core imports do not bring in their UI.

`testParameters` uses the same resolution order as the artwork: explicit override,
then default, then sampled distribution. A default is a constant; the report does
not ignore it to manufacture variation. Generated seeds are `prefix:0`, `prefix:1`,
and so on. Explicit seeds are used exactly, including duplicates. Limits are
10,000 samples in the JavaScript utility, 1,000 in the panel, and 1,000 boundary cases.

Reports contain definitions, overrides, PRNG version, seed/value samples, numeric
min/max/mean and ten equal-width histogram bins, category counts including zero
counts, and any failures. The panel also records artwork ID/version. Numeric
histograms include the maximum in the final bin; constant ranges use the first bin.
Without a `check`, `checked` is false and `passed` is null: sampling alone is not
presented as passing an artistic validation. Checks are synchronous and should be
side-effect free; thrown errors are recorded as failures and async checks are rejected.

Neither helper touches a running artwork or its PRNG. A custom check could still
mutate state through a captured variable, so do not call live artwork mutations
inside it. These are parameter tests, not GPU render tests or proof of edition
rarity. Boundary cases vary one field at a time rather than testing all combinations.
Continue visual checks of line weight, framing, texture, and animation on actual
devices, using recorded seeds to reproduce problems.

The current parameter types remain number, integer, boolean, and choice. Vectors,
colors, dependent parameter graphs, screenshot galleries, and visual-diff tooling
are future work. Keep the artist's check code and artwork version with saved reports.
