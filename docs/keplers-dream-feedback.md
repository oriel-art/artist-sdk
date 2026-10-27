# Kepler's Dream: integration feedback through alpha.4

Recorded October 26, 2026 from the integration report supplied by the project
team, including follow-up results on alpha.3. This is reported evidence, not a
reproduction against source held in this repository. Mihira's artwork, reports
and test suite have not been supplied here. The runnable SDK example remains
Contour study. Earlier alpha.2 evidence below is retained with its original scope.

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

## Reported alpha.3 results

The team reports integrating **0.1.0-alpha.3** into Kepler's Dream and confirms:

- The artist resolver retains original seeded generation, exact-seed tests are
  practical, and warnings, failed checks and execution errors are distinct.
- Preview case and recipe download remove manual replay steps. In the browser
  trial, preview reopened the recorded seed and parameters in a paused artwork.
- Versioned context/restoration preserves elapsed time, formation cadence and
  aspect ratio for comparison.
- Searchable swatches help with 44 palettes; sliders, readable long names,
  grouped boundaries and docking improve editing and integration.
- Artist-controlled export bindings retain original seed/time uniforms and shaders.

The fresh browser run sampled **100 seeds with no warnings, failures or execution
errors**. Earlier alpha.3 checks reportedly passed 500 seeds, recipe restoration,
and 1024/2048 PNG exports. These results do not establish aesthetic quality,
representative edition distributions or cross-device rendering equivalence.
They do not independently reproduce the reported artwork tests in this repository.
The separate-tab preview and studio playback toolbar are integration choices,
not SDK defects. Mihira's hands-on review time has not been measured.

## Alpha.4 response to remaining friction

| Alpha.3 feedback | Alpha.4 implementation | Artwork acceptance to collect |
| --- | --- | --- |
| Palette counts are a text block with every zero; cases show raw JSON | Sortable count/share tables, zero hiding enabled by default, readable values and supplied swatches; expandable raw JSON | Scan 44 palettes, sort/count, reveal zeros, verify full downloads are unchanged |
| Opening a case overwrites report totals | Persistent report summary separate from action messages and failed new runs | Preview/save/error actions preserve sampled and diagnostic totals |
| Trailing newline gives an opaque seed error | Line-specific errors, invalid-field indication and explicit Remove empty lines | Identify blank line 3, remove only empty lines, preserve whitespace/duplicates |
| Apply requires scrolling; drafts are unclear | Persistent Apply/Reset/Reload with dirty/render/conflict status | Reach actions throughout editing and report review; reset/revert indicators remain accurate |
| Sliders would benefit from optional live feedback | Off-by-default live preview, coalesced edits, awaited redraws, cancellation of queued work and honest error handling | Test fast and expensive real renderers without overlapping redraws or losing the latest draft |
| Sampling and comparison conditions need clarity | Visible generator identity and override exclusion; recorded context with optional labels/units, source/schema details | Confirm original generation and time/cadence/aspect before replay |
| Thumbnails would speed visual review | **Deferred to the next iteration at the user's request** | Define artist-owned isolated capture, size/concurrency limits, cancellation and visual-review workflow before implementation |

See the [alpha.4 guide](alpha4-guide.md) for exact options and behavior. Existing
recipe/report 0.2 and bridge 0.1 formats remain unchanged. Core imports exclude
the studio UI. Alpha.4 local verification comprises 25 unit tests, 25
Chrome/SwiftShader browser tests and desktop/mobile screenshot inspection; these
are SDK fixtures, separate from the reported Kepler's Dream results above.

## M0b validation still required

1. Obtain a minimal integration patch or runnable excerpt, original resolver,
   seed-to-value fixtures, recorded flagged report, uniform mapping, and the
   units/meaning of elapsed time, cadence and composition aspect ratio.
2. Adopt alpha.4 in Kepler's Dream and exercise the new report/editing acceptance
   above. Repeat the complete loop: sample original inputs, inspect a warning,
   preview, save recipe, reopen the moment, export. Preserve representative
   evidence of the already reported alpha.3 successes.
3. Record actual browser/GPU/device details and inspect framing, grain, line
   weight and texture behavior. Test 4096 exports, additional browsers, and
   Verse sandbox behavior explicitly.
4. Observe Mihira using the revised tools. Record integration/review time,
   manual steps, confusing controls, and the next two or three priorities.

M0b status: **alpha.3 integration and improvements reported; alpha.4 implemented;
alpha.4 artist validation and remaining environment checks outstanding**. M1 and later
milestones are not complete. A full studio shell, gallery, simulation replay,
new renderers, platform adapters and publishing remain separate future scope.
