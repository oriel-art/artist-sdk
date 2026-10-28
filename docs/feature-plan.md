# Artist SDK feature plan

Status: broader proposed scope, updated October 26, 2026. A limited raw-WebGL
pilot through `0.1.0-alpha.4` is implemented; see the [pilot guide](pilot-guide.md) for its actual
API and boundaries. This document describes the larger product, not a list of
already delivered features. Milestones and delivery criteria are in the
[roadmap](roadmap.md); the [artwork bridge](artwork-bridge.md) defines the
proposed interface between an artwork and its host viewer.

## Product purpose

Help generative artists create work using their preferred JavaScript drawing
tools, describe its variations, reproduce particular outputs, and prepare it
for publication. Artists should spend less time rebuilding seed handling,
controls, exports, metadata, and platform glue for every project.

Mihira is the initial artist reference. Their first project, Kepler's Dream, uses plain JavaScript
and WebGL, with GLSL drawing directly on an HTML canvas. Start there with a small
SDK and gather concrete adoption feedback. The SDK now also includes
[Canvas 2D, p5.js and Three.js integrations](renderers.md) with browser regression
tests. Artist adoption in each environment still needs artwork-specific trials;
SDK fixture coverage alone is not validation of an existing drop.

The product has five themes and a shared artwork bridge:

| Theme | Artist need | Primary outcome |
| --- | --- | --- |
| Runtime and interaction | Make the work behave consistently | Predictable loading, controls, resizing, and playback |
| Randomness and parameters | Describe the space of possible works | Reproducible choices, meaningful controls, and accurate traits |
| Rendering and export | Reproduce a particular work | Correct image capture, rerendering, and print preparation |
| Exploration and validation | Understand a whole collection | Seed galleries, comparisons, diagnostics, and saved selections |
| Adapters and publishing | Release without rewriting drawing logic | Target-specific runtime behavior, bundles, and release records |

The bridge connects all five themes to a viewer such as bitVerse. It allows an
artwork to advertise interactions, accept commands, answer state queries, and
emit events without exposing its internal implementation.

## Decisions from the Kepler's Dream pilot

The [integration feedback](keplers-dream-feedback.md) reports successful alpha.2/alpha.3
adoption while retaining the original renderer, identity algorithm, random draw
order and Verse preview behavior. Alpha.3 implemented the following focused
revisions, with improvements confirmed in the team's follow-up; see the
[integration guide](alpha3-guide.md) for the actual API.

- **Original generation is a first-class input.** Artwork construction and
  sampling accept the same versioned artist resolver. Complete recorded values
  are authoritative on replay. Reports distinguish SDK exploration from artist
  generation and record the exact seed source; neither implies edition rarity
  without a representative sample and matching generation rules.
- **A diagnostic must lead to a reproducible case.** Preserve seed, complete
  values, generator/artwork versions and chosen context. Each report case can
  invoke an artist-owned preview or download a recipe. Do not apply parameters
  to an unrelated live seed or regenerate a saved case.
- **Screening is not artistic judgment.** Separate warnings, failed constraints
  and execution errors. Keep all cases, including invalid resolutions, without
  silently dropping or resampling. The reported 23/500 geometric flags require
  visual review and do not establish an edition failure rate.
- **Rendering context is explicit data with restoration rules.** Recipe 0.2
  optionally records an artist schema ID/version and validated JSON for elapsed
  time, cadence and composition aspect ratio. Separate capture from restoration;
  reject unknown versions and make defaults for context-free recipes explicit.
  This does not implement deterministic stepping, checkpoints or GPU snapshots.
- **Studio controls should fit existing work.** Offer exact numeric entry beside
  sliders, searchable wrapped choice names and optional swatches, readable
  boundary groups and configurable panel placement. Keep this UI optional and
  preserve artist-owned playback; a shared studio shell remains future work.
- **Shader conventions are configurable.** Automatic resolution, time and seed
  uniform bindings can be renamed or disabled. Captured artist values remain
  fixed during isolated export; only the enabled resolution binding changes.

Alpha.4 responds to the follow-up review with these decisions; see the
[alpha.4 guide](alpha4-guide.md) for implemented behavior:

- **Reports support scanning without changing evidence.** Sort category counts,
  optionally hide zeros, and show readable case values with supplied swatches.
  Keep raw JSON available and every case in report downloads. Percentages use
  resolved cases, including warnings; resolution failures stay in diagnostic totals.
- **Report context survives actions.** Keep totals, generator identity, override
  exclusion and captured comparison values visible independently of preview/save
  messages. Current playback must not rewrite the recorded comparison moment.
- **Exact input deserves precise errors.** Identify invalid seed lines. Offer
  explicit empty-line removal while preserving nonempty strings and duplicates.
- **Editing is a draft workflow.** Keep actions and unapplied/render/conflict status
  visible. Live preview is optional and off by default; coalesce edits and await
  the artist's renderer before applying the next draft. Failures are visible,
  preserve drafts, and do not claim renderer rollback.
- **Visual case review is the next step.** Thumbnails are deferred to the next
  iteration, not implemented in alpha.4. Plan an isolated artist rendering hook,
  bounded resources, cancellation and context-correct captures before adding
  images to reports. Existing report sampling remains parameter-only.

The reported alpha.3 trial sampled 100 seeds with zero warnings, failures or
execution errors; earlier checks passed 500 seeds, recipes and 1024/2048 exports.
These do not establish aesthetic quality or rendering equivalence across devices.
Separate-tab preview and playback controls are artist integration choices.

M0b remains open for alpha.4 artwork validation, Mihira's observed hands-on
review, real-device visuals, 4096 exports, additional browsers and Verse sandbox
validation. Reported artwork tests and the SDK's own fixtures are separate evidence.

## Artist workflows

1. Adopt utilities inside an existing sketch, or start from a renderer example.
2. Define a seed, parameters, distributions, and the traits worth exposing.
3. Explore variations, lock selected choices, and save recipes and favorites.
4. Check the work across seeds, sizes, browsers, and platform preview modes.
5. Export an image or a reproducible interactive moment.
6. Prepare and inspect a platform-specific release bundle.
7. Publish through the target's supported workflow and verify the result.
8. Preserve enough source, assets, settings, and release information to rerender
   the work later.

These workflows must also support standalone portfolios, exhibitions, and
archives without requiring a wallet, token, or Oriel-hosted service.

## Design principles

- Allow incremental adoption. An artist should not have to rewrite a working
  sketch to use URL parsing, seeded randomness, or image capture.
- Keep the core independent of a renderer, platform, wallet, and workbench UI.
- Make advanced capabilities explicit. Arbitrary canvas code cannot
  automatically acquire vector export, large-format tiling, or state replay.
- Preserve artistic intent. A viewer may invoke only interactions the artist
  chooses to expose.
- Keep published behavior stable through pinned code, algorithms, schemas,
  dependencies, and assets.
- Provide JavaScript-first examples and TypeScript definitions, with browser
  and module distributions to be selected during design.
- Bundle only what a target needs. Development tools and publishing clients
  should not become dependencies of a displayed artwork.
- Distinguish configuration errors, unsupported features, and rendering
  failures with actionable messages.

## Shared artwork model

### Recipes and identity

A portable recipe describes an artwork instance independently of its current
display size. A seed alone is insufficient when code, parameters, assets, or
time can also change the output.

| Recipe element | Purpose |
| --- | --- |
| Artwork identifier and code version or digest | Identify the generating work |
| Full seed, random algorithm, and seed-derivation version | Reproduce random decisions without silently truncating platform hashes |
| Parameter schema version and resolved values | Preserve actual inputs |
| Asset and dependency versions or content digests | Preserve rendering inputs |
| Composition dimensions or aspect policy | Preserve intended geometry |
| Optional temporal mode, time/step position, and state reference | Declare how a dynamic moment can be reconstructed |
| Recipe format version | Support validation and explicit migrations |

Export dimensions, encoding, margins, and other output choices accompany the
recipe as export settings. Increasing resolution should preserve composition
unless resolution-dependent behavior is explicitly part of the artwork.

Recipes should support import, export, stable serialization, validation, and
comparison. Compact URL encoding is useful for small recipes; larger recipes
need files or explicitly configured storage rather than unlimited URL payloads.

Draft the recipe schema early so artists and tool authors can evaluate it, but
keep it experimental through the pilot. Exercise it with a static composition,
a time-dependent animation, and an interactive poem or scene before declaring
a stable format. These cases can overlap the three renderer examples. Record
schema revisions and migration behavior rather than freezing a format that has
only been tested against static images.

Version the recipe format independently of the SDK and renderer libraries.
Record a source or bundle digest alongside optional Git provenance; a short
commit label alone does not identify all built dependencies and assets. Use
actual schema identifiers only after establishing a maintained schema location.

Keep provenance such as export timestamps outside the fields that determine
artwork identity unless the artist explicitly makes time an input. Define the
identity-bearing fields before hashing recipes. If dimensions and aspect ratio
are both stored, validate their agreement or derive the ratio. Stored traits
are derived metadata and must be checked against the same resolved inputs used
by rendering, rather than treated as an independent source of truth.

A recipe provides reproducibility, not proof of token ownership or authenticity.
Record platform identity separately and validate it through the appropriate
platform or chain integration when that is required.

### State categories

| State | Examples | Policy |
| --- | --- | --- |
| Canonical identity | Fixed seed, minted inputs, code version | Preserve in published mode |
| Interactive session | Camera, stanza, selected region, simulation progress | Snapshot or restore only where the artist supports it |
| Presentation | Host toolbar, fullscreen, panel layout | Usually owned by the viewer |

Dynamic external inputs must be declared. Capturing a weather value or an
interaction log can make a particular session reproducible; fetching new values
on every replay cannot provide the same guarantee.

### Temporal reconstruction

Declaring a frame number alone does not specify how to reproduce it. Each
artwork advertises supported reconstruction modes and whether seeking is
immediate, requires replay, or is unavailable.

| Mode | Reconstruction method | Required information |
| --- | --- | --- |
| Static | Render resolved composition | Recipe and rendering inputs |
| Direct time evaluation | Evaluate a specified time without replaying the full history | Time units, origin, and declared inputs |
| Deterministic stepping | Advance from known initial state using defined steps | Initial state, timestep, step count, and ordered external inputs |
| Checkpoint restoration | Restore compatible state, then advance if needed | State format/version, checkpoint reference, position, and subsequent inputs |

Direct evaluation need not be a closed-form mathematical formula. Simulation
timestep and display frame rate are separate: dropped display frames must not
silently change the simulation's step history. Define the meaning of frame/step
zero and whether a captured position is before or after its update.

Record interactions, external data, and random-generator state or derivation
when reconstruction needs them. A checkpoint reference must identify retrievable
compatible state; its identifier alone is not the state. Long replay operations
report progress, support cancellation where feasible, and declare resource
limits. Unsupported seeking returns a clear result rather than an approximate
moment presented as an exact reconstruction.

Temporal modes and recipe fields are designed during M0/M1. Full replay,
checkpoint implementations, and synchronized image/content capture follow the
later milestones; basic bridge adoption does not require them.

## Runtime and interaction

### URLs and environment

- Parse typed URL values with defaults, range checks, length limits, and useful
  errors. Distinguish missing values from valid zero and false values.
- Decode platform payloads without treating arbitrary URL content as trusted
  identity, executable code, or permitted configuration.
- Serialize share links and preserve unrelated query fields.
- Define input precedence by mode: platform-owned canonical inputs are locked
  in published mode; development overrides must be explicit and visible.
- Support studio, standalone, embedded, platform preview, and automated capture
  modes without requiring artists to duplicate their drawing logic.

### Lifecycle and display

- Optional hooks for initialization, asset loading, parameter resolution,
  rendering, resize, pause, resume, export, and disposal.
- Separate readiness for interaction from readiness for a preview capture.
- Wait for required fonts, images, and textures; report loading failures.
- Manage aspect ratios, fit and crop policies, fullscreen, pixel density,
  resize scheduling, and screen-to-artwork coordinate conversion.
- Support multiple artwork instances and surfaces without global listener
  collisions. Dispose listeners, subscriptions, and renderer resources.
- Provide playback controls and deterministic stepping where supported.
  Let the artist decide whether resize preserves progress or restarts a work.
- Offer host visibility and reduced-motion signals without silently changing
  canonical content.

### Actions and controls

Use a shared action registry for keyboard shortcuts, optional buttons, touch
controls, accessibility interfaces, and bridge commands. All should invoke the
same artist-defined behavior.

| Suggested binding | Action |
| --- | --- |
| `s` | Save the current image |
| `Shift+s` | Open export options |
| `i` | Show artwork information |
| `?` | Show available controls |
| `Space` | Pause or resume |
| `f` | Toggle fullscreen |
| `r` | Replay the current instance |
| `n` | Generate a new seed in studio mode |

Bindings are configurable. Ignore typing targets and composition input,
respect modifier keys, prevent repeated downloads from held keys, and provide
non-keyboard controls. Seed regeneration is not enabled by default in a token
viewer. Browser-restricted actions remain subject to browser permissions and
user-activation rules.

The optional information panel displays title, artist, description, seed,
traits, edition details, credits, and available interactions. Studio diagnostics
are separate from the public artwork presentation.

## Randomness and parameters

### Random generators and distributions

- Seeded, versioned generators with reproducibility vectors and documented
  seed normalization. Preserve the source hash rather than silently truncating
  or replacing it.
- Uniform floats and integers, probability checks, choices, weighted choices,
  shuffling, and sampling without replacement.
- Initial normal, truncated-normal, and log-uniform distributions; later beta,
  exponential, Poisson, and artist-defined distributions.
- Seeded spatial and temporal noise as a distinct facility.
- Named streams such as composition, palette, and texture so an added texture
  decision need not alter the composition stream.
- Stable keyed sampling for objects and parameters, plus state save/reset for
  sequential generators. Stable keys must not depend on mutable display names.
- Validation of bounds, weights, impossible samples, and degenerate inputs.

Do not globally replace `Math.random`. Artists should opt into the SDK's
generator, with development diagnostics for accidental nondeterminism.

### Parameter definitions

| Definition field | Example |
| --- | --- |
| Stable ID | `density` |
| Display name and description | Mark density; number of visible marks |
| Type | Number, integer, boolean, choice, color, vector |
| Valid values | Minimum, maximum, step, or options |
| Generation rule | Truncated normal in the valid range |
| Default and group | 80; Composition |
| Edit policy | Studio-only, collector input, fixed after mint |
| Trait mapping | Sparse, Balanced, Dense |

Support named presets, reusable groups, conditional parameters, derived
values, dependencies, constraints, partial randomization with locks, and
validation of imported settings. Resolve dependencies predictably and reject
cycles or unsatisfiable constraints. Constraint retries must be bounded;
rejection sampling can change a distribution and must not freeze the artwork.

Later workbench controls should be generated from the schema, with undo/redo,
reset, saved presets, and explicit schema migrations. Platform adapters must
report when a parameter type or edit policy cannot be represented on a target.

### Traits and edition distributions

A parameter is an input, a distribution selects inputs, and a trait describes
an output. Traits may be derived from several parameters. Public traits should
be explicitly selected and calculated from the same resolved choices used by
the renderer, not from a second random sequence.

Normalize trait types and numeric precision. Preserve stable internal IDs while
allowing display labels to evolve. Metadata extraction must not depend on how
many frames have rendered unless the target explicitly supports dynamic traits.

Weights express probabilities, not exact edition quotas. An exact allocation
across an edition is a separate collection-level capability, and only applies
where the platform permits control over the relevant allocation process.

## Rendering and export

### Coordinate and scaling contract

Separate the artist's composition from the display and export dimensions:

| Space | Purpose | Example |
| --- | --- | --- |
| Composition | Geometry, spacing, and artistic proportions | A logical 1000 by 1000 drawing surface |
| Display | Fit the composition into a viewer | A responsive canvas with letterboxing |
| Output | Produce the requested image pixels | A 6000 by 6000 export |

Support logical design units and optional normalized coordinates without
forcing artists to rewrite every sketch around zero-to-one values. Declare
aspect policy and transforms explicitly; avoid accidental nonuniform stretching.
Three.js integrations retain scene/world coordinates and define projection and
screen-space mappings rather than forcing 3D geometry into a 2D drawing model.

Distinguish composition-relative sizes from pixel-relative effects. Artists
should declare whether stroke widths, texture grain, blur radii, noise frequency,
and screen-space effects scale with the composition or retain a particular
pixel size. Display CSS pixels, device pixel density, and output pixels must not
be treated as interchangeable units.

A context transform can help scale supported drawing operations, but cannot
automatically scale every effect, texture, shader input, or postprocessing pass.
Renderer integrations need explicit policies for those cases. Map native input
and bridge coordinates through the same surface transforms so export resolution
does not change interaction targets.

Acceptance should compare a single recipe at a small preview, ordinary display,
and larger export size, plus a changed viewport aspect ratio. Check geometry,
stroke proportions, texture scale, framing, and declared pixel-relative effects
against the artist's intent, not against assumed pixel equality.

### Export operations

| Operation | Contract |
| --- | --- |
| Visible capture | Save the current pixels of registered surfaces |
| High-resolution rerender | Reconstruct a recipe at a requested size |
| Frame export | Reconstruct or capture an identified animation moment |
| Print preparation | Produce requested pixels, margins, and physical-size settings |

High-resolution rerendering requires an artist render callback, retained scene,
or renderer integration. Upscaling a screenshot is not equivalent. Export must
not advance the visible work's random stream or leave its display resized.

Initial scope includes PNG, exact dimensions and scale factors, aspect policy,
explicit backgrounds or transparency, named export targets, deterministic
filenames, and optional recipe sidecars. Add JPEG/WebP where encoding and
transparency behavior are explicit.

Register multiple layers or surfaces when a work needs compositing; do not
silently select the first canvas or include host controls. Report unavailable
assets and canvas export restrictions. Add progress, cancellation, and memory
estimates for expensive operations.

### Renderer contracts

| Renderer | Required integration concerns |
| --- | --- |
| Canvas 2D | Supplied drawing context, stable composition coordinates, asset readiness |
| p5.js | Supported lifecycle modes, pixel density, offscreen output, resize behavior |
| Three.js/WebGL | Render targets, camera and aspect, textures, postprocessing, resource cleanup |

Each integration advertises capabilities rather than promising universal
export support. The exact supported p5.js and Three.js versions and global or
instance-mode coverage are decisions for the initial design milestone.

### Render request and result

Separate a renderer-neutral request from the renderer-specific target:

| Contract | Contents |
| --- | --- |
| Render request | Recipe, logical/output dimensions, aspect and transform policy, purpose, optional time/step, and cancellation request |
| Renderer integration | Supported Canvas 2D context, p5 instance, Three.js target, or offscreen surface |
| Render result | Completed output, recipe/session revision or temporal position, and diagnostics |

Do not require `HTMLCanvasElement` for every backend. Offscreen surfaces and
WebGL render targets have different integration needs; browser offscreen
rendering is described by the
[OffscreenCanvas API](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).
Advertise backend support rather than assuming every renderer works in a worker.

A uniform scale factor is insufficient for crop, letterbox, aspect changes, or
camera projection. Carry the actual transform policy. Allow asynchronous
completion, progress, cancellation, and structured failures. An export purpose
may change scheduling or hide diagnostics, but must not silently change artistic
choices; intentional output-dependent behavior belongs in declared inputs.

Resolve artistic choices into stable parameters or scene state where practical.
An isolated export context must define whether it restarts deterministic streams,
restores generator state, or uses keyed sampling. Passing a seeded PRNG does not
prevent an artwork or dependency from calling `Math.random`; diagnostics remain
advisory. Export and replay must not consume the live work's mutable PRNG.

### Export preflight and failure handling

Before allocation, inspect relevant texture, renderbuffer, and viewport limits
and estimate memory for buffers, depth attachments, postprocessing, and encoding.
WebGL exposes limits through
[getParameter](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter).
Do not hardcode typical device limits or treat a dimensional check as proof that
enough memory is available. Canvas 2D exports also need resource checks.

Handle allocation failure and
[context loss](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)
explicitly. Clean up partial resources on failure or cancellation, preserve
canonical and session data, and avoid resizing or mutating the live view during
export. If the browser loses the live context too, report that condition and
attempt supported recovery rather than promising uninterrupted display.

Offer smaller dimensions or an explicitly supported tiled path, without silently
reducing requested quality. Tiling must account for overlap, blur, shadows,
screen-space effects, and feedback state. General tiling remains an advanced
capability; early preflight must work even when tiling is unsupported.

### Print and advanced output

- Physical dimensions in inches or centimeters and target pixels per inch.
  Calculate actual pixel dimensions; metadata alone cannot create detail.
- Fit, crop, margins, bleed, optional crop marks, and print presets.
- A documented, tested color-output baseline; printer-specific profiles and
  CMYK conversion belong to a later explicit workflow.
- Large-format tiled rendering only for renderers that can preserve global
  coordinates and handle overlap, filters, and screen-space effects.
- SVG and plotter output only when vector geometry is available.
- Frame sequences and later optional video encoders with declared timing,
  background, audio, and codec capabilities.

## Exploration and validation

### Optional local workbench

- Seed grids and exact reopening of individual outputs.
- Favorites, notes, named presets, and persisted exploration sessions.
- Parameter locking and one- or two-variable sweeps.
- Side-by-side comparison of seeds, settings, and code revisions.
- Contact sheets and ordered collection manifests with recipes and previews.
- Histograms and summaries of observed traits and parameter distributions.
- A bridge inspector for capabilities, commands, queries, events, and errors.

Keep artist-curated selection separate from collector-generated editions.
Favoriting a seed does not imply that a platform will mint that selected seed.
The workbench uses the same runtime as the standalone artwork and remains
optional for artists using their own editors.

### Validation tools

Check repeated recipes, multiple sizes, supported browsers, renderer backends,
extreme parameters, malformed inputs, asset failures, long frames, and memory
growth. Verify preview capture readiness, trait consistency, and adapter behavior.
Capture failing recipes and environment details in reproducible bug reports.

Use four complementary levels of determinism validation:

| Level | Planned checks | Limit |
| --- | --- | --- |
| Code diagnostics | Flag likely unseeded randomness, undeclared time inputs, and other recognizable sources | Advisory analysis cannot find every indirect call or prove determinism |
| State checks | Compare resolved parameters, traits, and artist-exposed geometry/state across repeated recipes | Only covers observable state and the declared inputs |
| Rendering comparisons | Compare repeated renders and a selected browser/device matrix | Results apply to tested environments and artist-approved tolerances |
| Environment records | Record code/assets, renderer and library versions, browser, dimensions, and available graphics precision details | A diagnostic record is not proof of equivalent output |

Build these checks as reusable utilities, then expose batch results through the
workbench. Do not require the full workbench to validate an early integration.
Record suspected causes separately from measured differences. Shader precision
can be inspected through the
[WebGL precision API](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getShaderPrecisionFormat),
but that information alone does not predict all GPU-dependent behavior.
Missing graphics details should be recorded as unavailable, not invented.

Treat blank-image, similarity, or low-variation findings as advisory unless the
artist defines a hard requirement. A deliberately black output is not a bug.

Guarantee deterministic inputs and artistic decisions within the declared
contract. Do not promise byte-identical images across every browser, GPU, font
renderer, and dependency version. Exact image regression tests need a pinned
environment; broader visual comparisons need artist-approved tolerances.

## Platform adapters and publishing

### Three separate responsibilities

| Layer | Responsibilities |
| --- | --- |
| Runtime adapter | Seed and context input, traits, capture signals, supported interactions |
| Packaging adapter | File layout, dependency rules, bundled assets, size checks |
| Publishing adapter | Uploads, configuration, transactions, receipts, verification |

An artist should use runtime and packaging support without loading signing or
wallet dependencies into the artwork. The artwork bridge is a viewer protocol;
it complements platform adapters rather than replacing their minting or
metadata contracts.

### Initial targets and verification boundaries

| Target | Planned integration | Boundary to verify |
| --- | --- | --- |
| Standalone web | Local and hosted viewers, recipes, exports, bridge host | Browser and embedding support matrix |
| Verse | Encoded payload, traits, aspect ratio, preview data and capture signaling | Current payload semantics and packaging/submission workflow |
| Art Blocks | `tokenData`, deterministic features, preview hooks, generator-compatible bundle | Selected generator, dependency registry, and project requirements |
| Forever Library | V3 contract/metadata integration and release prototype | Exact generative-series seed/viewer convention, chain and ABI version |
| bitVerse | Host connection for discovery, commands, state, events, and optional exhibition bindings | Viewer implementation and active-session routing; existing support is not assumed |

Verse documents that some payload fields change over time or differ during
capture. Do not use such fields as fixed composition inputs without an explicit
artistic decision. Art Blocks specifies generator-provided inputs and script
constraints; SDK code may need to be bundled into the artwork script. See the
[Verse guide](https://docs.verse.works/projects/generative-verse/) and
[Art Blocks requirements](https://docs.artblocks.io/creator-onboarding/artists/1-building-your-project/).

Forever Library's V3 guide distinguishes on-chain metadata, URI pointers, and
external renderers. Pin chain ID, contract version, and ABI together. A Solidity
external renderer is not a JavaScript browser renderer. Its Tezos contract is a
separate integration; V3 integration alone does not establish the generative
series runtime convention. See the
[Forever Library integration guide](https://github.com/foreverlibrary/forever-library/blob/main/INTEGRATION.md).

These external contracts must be rechecked before implementation. Platform
submission eligibility and editorial approval remain outside the SDK's control.

### Release workflow

1. Create a manifest with title, description, credits, licenses, assets,
   dependencies, code version, and target configuration.
2. Validate and inspect the exact target bundle and representative previews.
3. Record build inputs, content digests, bundle size, and external dependencies.
4. Prepare storage uploads or target submission artifacts and use a test
   environment when available.
5. For supported direct publishing, prepare and simulate transactions, show
   the operation to the artist, and obtain signing through the chosen wallet.
6. Record upload results, transaction receipts, identifiers, and content hashes.
   Recover from interruptions by reconciling existing results before retrying.
7. Read back published resources and verify the intended artwork and metadata.

Provide a manual handoff bundle when a target lacks a supported publishing API.
Do not equate browser random generation with trustworthy mint-time randomness;
the platform or contract determines the latter.

Release records should preserve source, dependencies, assets, recipes where
applicable, storage references, chain/token identifiers, and verification
results. Metadata locks or other irreversible finalization steps must be
explicit operations, not automatic consequences of a generic publish action.

## Module boundaries and preservation

Use one repository with logical modules for core data and randomness, browser
utilities, renderer integrations, export, bridge, platform adapters, and
development/publishing tools. Decide npm package boundaries after the initial
artwork trials; a separate package for every module is not yet required.

### Runtime footprint

Provide selective entry points that allow unused code to be removed by a
bundler. Keep workbench UI, wallet/publishing clients, ZIP tooling, and heavy
video/export dependencies outside the core runtime dependency graph. Verify
this using built examples rather than assuming tree shaking works.

| Measurement bundle | Purpose |
| --- | --- |
| Randomness only | Measure seed handling and basic sampling overhead |
| Parameters and recipes | Measure validation and serialization overhead |
| Basic bridge | Measure discovery, commands, queries, and events overhead |
| Complete target artwork | Measure SDK overhead after target-specific bundling |

For each bundle, record included capabilities, tool versions, original source
size, minified uncompressed bytes, and compressed transfer sizes where relevant.
Compare complete artwork builds with and without SDK functionality to make
overhead visible. Measure the actual target artifact or upload representation
when it differs from the browser bundle.

A 5–10 KB minified, uncompressed core is an investigation target, not a committed
acceptance threshold. Define the included capabilities and set budgets from
measurements and target requirements before enforcing them.
Dynamic imports are optional: self-contained and archival targets must be able
to bundle everything needed locally, without fetching mutable SDK code at runtime.

### Interoperability with existing tools

The SDK's focus is the connection between reproducible artwork state, artistic
parameters, platform metadata, and viewer interaction. Evaluate integration
with existing tools before adding equivalent workbench or export functionality.

| Tool or category | Existing capability to consider | Proposed integration question |
| --- | --- | --- |
| canvas-sketch | Physical-size print workflows and renderer templates | Can its lifecycle/export workflow consume SDK recipes and actions? |
| Tweakpane | Parameter controls and state import/export | Can controls bind to SDK parameter IDs without a competing source of truth? |
| lil-gui | Parameter controls and save/load of values | Can existing artist panels retain their UI while using SDK validation and recipes? |
| Leva and other UI tools | Candidate control integrations | Which artist workflows justify a maintained adapter? |
| Platform-native SDKs | Target-specific runtime and release behavior | Which supported primitives can an adapter reuse instead of duplicating? |

The relevant existing capabilities are documented by
[canvas-sketch](https://github.com/mattdesl/canvas-sketch),
[Tweakpane](https://tweakpane.github.io/docs/misc/), and
[lil-gui](https://lil-gui.georgealways.com/#Saving).
Control-state persistence is useful but does not by itself establish the SDK's
complete artwork recipe. Define ownership, validation, update direction, and
serialization mapping so artist tools and the SDK do not drift apart.

In the pilot, assess adoption effort, bundle cost, maintenance burden, and
licensing before choosing integrations. Do not require replacing an artist's
existing controls to use seeded randomness, recipes, or the bridge.

### Preservation

Published works should bundle a pinned SDK version and run without an Oriel
service. Source maps and build manifests belong in release archives where
appropriate; public bundles should follow target constraints. SDK licensing
and artwork licensing are separate, and third-party asset/library licenses
must travel with the release as required.

Open-source delivery should include complete examples for all initial
renderers, incremental migration guides, compatibility tables, changelogs,
extension documentation, and reproducibility fixtures. No automatic upgrade
should change an already-published work's random sequence or parameter meaning.

## Scope exclusions

The initial SDK does not include a general visual editor, marketplace,
custom minting-contract development, a broad geometry library, guaranteed
cross-device pixel equality, universal vector/video/print support, or retroactive
control of arbitrary artworks that do not implement the bridge.

The roadmap schedules a usable subset of this feature set first. Advanced
distributions, edition allocation, vector/plotter export, production color
management, multi-chain publishing, and orchestration remain later candidates.
