# Alpha.4: review reports and edit parameters

Version **0.1.0-alpha.4** responds to the second [Kepler's Dream feedback
report](keplers-dream-feedback.md#reported-alpha3-results). It improves the
optional Parameter lab. The original renderer, generation, recipe context and
uniform-binding integrations from the [alpha.3 guide](alpha3-guide.md) still apply.
No thumbnails are included; they are deferred to the next iteration.

## Install or try it

From the updated repository, run `npm run dev` with Node.js 22 or later and open
`http://127.0.0.1:4173/examples/webgl/`. Open Parameter lab and run a sample.
The example is Contour study, not Kepler's Dream.

For an existing native-module integration, replace the vendored SDK `src`
directory as a whole and retain your imports. For a new project, follow the
[artist quickstart](getting-started.md). To create a local package, run `npm ci`
and then `npm pack` in the repository; an npm-based artwork can install that file:

```sh
npm install /absolute/path/to/oriel-art-artist-sdk-0.1.0-alpha.4.tgz
```

This is a local package, not an npm registry publication. The SDK has no runtime
dependencies. Pin this experimental version in an artwork release.

## Read a report without losing its context

The report summary stays above the scrolling controls and results. It shows
sampled/resolved totals, diagnostic case counts, artist resolver or SDK generator
identity, exclusion of editor overrides, and the captured comparison values.
Expand Recorded comparison for the seed source and context schema/version.
Optional `contextLabels` can supply readable labels and artist-defined units.
Comparison values come from the saved report, not subsequent playback.

Preview/download messages and run errors use a separate status area. Opening a
case, downloading a recipe or report, and a rejected new run leave the previous
successful report intact. Replacing the page or disposing the panel ends that
panel session; persistence across reloads still requires saving the report.

Category counts appear in tables. Click Value or Count to sort; repeat to reverse
direction. Count descending is the initial order. **Hide zero counts is on by
default** and can be switched off per table. Labels and artist-supplied palette
swatches also appear in case summaries. Expand Raw JSON when exact raw values
are useful. Case filters, ten-case pages, Preview case and Save recipe remain.

Percentages divide by **resolved cases**, including flagged cases and cases whose
artist check threw. Seeds that failed parameter resolution do not enter that
denominator. Zero resolved cases show unavailable percentages. Diagnostic totals
count cases by highest severity, as in alpha.3; they are not totals of individual
findings. No registered artist check means unchecked, not passed.

Sorting, hiding zeros and case filtering change only the display. Downloads and
`getReport()` still retain every case, value, finding and zero-count category.
The report format remains `artist-parameter-report/0.2`, recipes remain format
`0.2`, and the bridge remains `artist-bridge/0.1`. No generation or replay inputs
are changed by this release. Counts describe the submitted sample, not rarity
or aesthetic quality.

## Paste exact seeds with actionable errors

Exact seeds remain one untrimmed string per line. Invalid input identifies the
line: for example, `Blank seed on line 3` for a trailing newline after two seeds.
Oversized seeds identify their line and the 4096-character limit. **Remove empty
lines** is an explicit editing action; it removes only completely empty lines,
preserves spaces, case, ordering and duplicates, and does not start a run.

An entirely empty textarea selects prefix/count generation, with a visible
notice. Removing all empty lines returns to that mode. Whitespace-only seeds
remain valid exact strings. The panel allows 1,000 seeds per run. For a custom
testing UI, the optional testing module exports a parser:

```js
import { parseSeedLines, testParameters } from '@oriel-art/artist-sdk/testing';

const seeds = parseSeedLines(pastedText); // Throws on blanks; never cleans silently.
const report = testParameters(definitions, { resolver, seeds });
```

The parser accepts LF, CRLF or CR separators and up to 10,000 lines. Unlike the
panel, `parseSeedLines('')` rejects blank line 1; prefix mode belongs to the UI.
The sampler still accepts a direct string array for seeds containing newlines.

## Edit with persistent actions and optional live preview

Apply values, Restore starting values and Reload current values stay below the
scrolling panel body. An indicator distinguishes unapplied drafts, rendering,
successful application, redraw failure and conflicting external updates. Returning
a draft to the applied values clears the dirty indicator. Restore starting values
means the values captured when this panel was created; it intentionally applies
them. Reload current values discards the draft without invoking a redraw.

Live preview is **off by default**. Artists can enable its checkbox or set the
initial option. Return the redraw promise from `onChange` so the panel knows
when the renderer has finished:

```js
const tools = createParameterPanel({
  artwork,
  resolver, // Same descriptor as the artwork, when using an artist generator.
  onChange: async state => {
    await redrawWithParameters(state.parameters);
  },
  captureContext: () => ({
    elapsedSeconds: displayedMoment.elapsedSeconds,
    cadence: displayedMoment.cadence,
    aspectRatio: compositionAspectRatio
  }),
  contextLabels: {
    elapsedSeconds: 'Elapsed time (seconds)',
    cadence: 'Formation cadence', // Add the artwork's actual units here.
    aspectRatio: 'Composition aspect ratio'
  },
  livePreview: false,
  livePreviewDelay: 120,
  onPreviewCase: recipe => reopenKeplerRecipe(recipe)
});
```

These named artwork functions and variables are supplied by the integration.
Context capture requires the existing versioned context contract on `artwork`.
`contextLabels` maps top-level context keys to nonempty strings of at most 200
characters; it does not change saved context. Unlabeled keys get readable names;
nested data is displayed as JSON. `livePreviewDelay` is a trailing debounce in
milliseconds, defaults to 120, and accepts 0–5000.

Rapid edits coalesce to the latest valid draft. The panel awaits one `onChange`
at a time; edits made during that callback remain visible and are applied after
it finishes and the debounce expires. Explicit Apply/Reset/Reload are disabled
during a redraw. Invalid values stay unapplied with a validation message.
Boundary loading remains an explicit Apply workflow even when live preview is on.

Switching live preview off, closing/disposal, loading a boundary case, or starting
a report/preview cancels queued live edits. Closing or disposing does not cancel
an already-running artist callback. Reopening does not automatically apply a
cancelled draft. A report or case preview cannot start while a redraw is pending.
These rules serialize this panel's work; the SDK cannot serialize unrelated
artist playback, bridge handlers or other editors.

If parameters change outside the panel while a draft/redraw is pending, live
preview stops and the draft is preserved; reload current values before applying
again. Redraw errors also disable live preview. Parameters are committed before
the callback, so an error honestly reports applied values with a failed redraw;
there is no automatic GPU rollback. Expensive renderers can keep explicit Apply.

## Kepler's Dream acceptance session

1. Sample the original generator, inspect count sorting/zero visibility and all
   44 palette labels/swatches. Confirm saved reports still contain every case.
2. Preview and save a case; verify totals and the recorded time/cadence/aspect
   remain visible. Compare those values with the restored paused artwork.
3. Paste two seeds with a trailing newline. Check the line number, remove blanks
   explicitly and verify whitespace and duplicate seeds are unchanged.
4. Scroll through palettes and reports; use Apply/Reset without returning to the
   end of the form. Try live preview with fast and deliberately slow redraws.
5. Record hands-on review time, remaining manual steps and actual browser/GPU
   details. Review compositions visually; passing checks is not an aesthetic verdict.

The original alpha.4 validation covered 25 unit tests and 25 Chrome/SwiftShader browser tests,
including async redraw failure/conflict/disposal, report persistence and exact
seed cleanup. Desktop/mobile screenshots were inspected. Later artist integration
reports and their scope are recorded in the [feedback record](keplers-dream-feedback.md);
the counts here describe the original alpha.4 work, not the current whole-SDK
suite. They do not establish coverage of every device/browser or Verse sandbox.
Thumbnails and their renderer/resource contract remain future work.
