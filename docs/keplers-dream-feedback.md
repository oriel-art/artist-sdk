# Kepler's Dream: integration feedback and alpha.3 response

Recorded October 26, 2026 from the integration report supplied by the project
team. This is reported evidence about alpha.2, not a reproduction against source
held in this repository. Mihira's artwork, the 500-seed report, and its 26 tests
have not been supplied here. The runnable SDK example remains Contour study.

## Reported artwork and adoption

Kepler's Dream uses plain JavaScript, WebGL 1, a single fragment pass, procedural
textures, no image textures, and no previous-frame feedback. It can evaluate a
chosen elapsed time directly. The integration retained its canvas, renderer,
shaders, original identity algorithm and random draw order, and Verse preview
behavior. The team replaced the old information overlay and palette controls.

The info popup was readable and accommodated description, credits, controls,
links, seed, and traits; Close/Escape and focus restoration worked. Parameter lab
was connected to palette, formation radius, orbit distance, and filament
strength. Apply, Reload current values, Restore starting values, and boundary
cases worked. This supports continued incremental adoption and artist ownership
of rendering and generation.

## Reported evidence and its limits

| Evidence | What the report establishes | What it does not establish |
| --- | --- | --- |
| 500 sampled seeds; 23 geometric flags | Reproducible seeds, values and explanations were retained | Confirmed bad compositions or edition failure rates; SDK distributions differed from the original generator |
| Recipe link restored identical opening pixels on the same GPU | Input-based replay at paused time zero worked in that environment | Animation-moment restoration or cross-device pixel identity |
| 1024- and 2048-pixel PNGs | Export worked without resizing the live canvas | 4096 output, actual-device fidelity, or all browser support |
| 26 artwork tests and Chrome/SwiftShader checks passed | Integration team reports automated success | Independent SDK-team reproduction, Verse sandbox validation, or measured artist adoption effort |

The 23 geometric flags are prompts for visual review, not confirmed failures.
Keep that distinction in diagnostics and collection decisions.

## Friction and decisions implemented in alpha.3

| Reported friction | Alpha.3 response | Follow-up acceptance in the artwork |
| --- | --- | --- |
| Manual replay requires both seed and parameter overrides | Report rows offer Preview case and Save recipe; callbacks receive complete recorded recipes | A flagged row reproduces the original reviewed case without manual JSON editing |
| SDK sampling differs from original generation | Versioned artist resolver shared by artwork and sampler, exact seed lists, generator/source provenance | Compare fixed seeds with the existing generator and its original draw order; use representative edition seeds when discussing edition distributions |
| Flags were all called failures | Warning, failed-check and execution-error diagnostics; retain every case | Classify geometric screening as warnings and visually inspect them |
| Numeric controls and 44 palettes are awkward | Sliders plus exact numeric entry; search, wrapped choice names, optional artist-provided swatches | Exercise all four real parameters and long palette names with mouse and keyboard |
| Flat boundary cases expose internal IDs | Group cases under readable parameter names | Find palette alternatives and numeric endpoints without scanning one flat list |
| Recipes omit time, cadence and aspect ratio | Recipe format 0.2 adds optional validated context with independent ID/version and explicit restoration | Save a nonzero moment, reopen paused at the same cadence and composition aspect ratio |
| Export overrides seed and texture-drift time uniforms | Configurable automatic bindings; null delegates a uniform to the artist callback | Use original uniform names and values, with identical captured-frame inputs across export sizes |
| Lab overlaps playback toolbar | Left/right/inline placement, width and top/bottom/edge offsets, runtime setPlacement | Keep playback and canvas controls accessible at desktop and narrow widths |

See the [alpha.3 integration guide](alpha3-guide.md) for exact APIs, migration
rules and limitations. The SDK does not silently replace existing generation,
resample flagged cases, infer missing temporal state, or restore GPU state itself.

## M0b validation still required

1. Obtain a minimal integration patch or runnable excerpt, original resolver,
   seed-to-value fixtures, recorded flagged report, uniform mapping, and the
   units/meaning of elapsed time, cadence and composition aspect ratio.
2. Repeat the complete loop in Kepler's Dream: sample original inputs, inspect a
   warning, preview, save recipe, reopen the moment, export.
3. Record actual browser/GPU/device details and inspect framing, grain, line
   weight and texture behavior. Test 4096 exports, additional browsers, and
   Verse sandbox behavior explicitly.
4. Observe Mihira using the revised tools. Record integration/review time,
   manual steps, confusing controls, and the next two or three priorities.

M0b status: **integration reported; alpha.3 revisions implemented; artist-led
revalidation and remaining environment checks outstanding**. M1 and later
milestones are not complete. A full studio shell, gallery, simulation replay,
new renderers, platform adapters and publishing remain separate future scope.
