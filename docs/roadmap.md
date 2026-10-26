# Artist SDK roadmap

Status: first experimental toolkit implemented, October 26, 2026. The
`0.1.0-alpha.2` pilot is ready for an artist integration trial; M0 design
validation and the broader milestones remain open. There is no npm registry
release, production platform integration, or deployment.

Read the [feature plan](feature-plan.md) for scope and the
[artwork bridge specification](artwork-bridge.md) for the viewer protocol.
The [artist proposal](artist-proposal.md) presents the same direction for artist
review and sharing.
Milestones are ordered by dependencies and demonstrated outcomes, not calendar
dates. Effort estimates should follow the initial artwork trials.

## Milestone overview

| Milestone | Outcome | Depends on |
| --- | --- | --- |
| M0a First WebGL toolkit | A small SDK Mihira can try; implemented experimentally | Plain JavaScript/WebGL brief |
| M0b Artist-led design validation | One actual integration and a recorded design review | M0a and Mihira's artwork |
| M1 Reproducible artwork and basic bridge | Harden the pilot and extend to additional renderer examples | M0 feedback |
| M2 Collection and viewer workflows | Exploration, validation, and real bitVerse integration | M1 |
| M3 Platform readiness | Verified runtime adapters and publication bundles | M1, with M2 validation tooling |
| M4 Production publishing | Supported releases can be published and verified | M3 and target access |
| M5 Advanced output and extensions | Large-format, temporal, and specialized capabilities | Relevant earlier contracts |

M0 through M1 form an iterative artist pilot. Deliver useful code before asking
for detailed design feedback. M2 and M3 can progress independently
once shared contracts stabilize, but a target release should use the validation
tools before production publishing. M5 is a set of separately justified
extensions, not a requirement for every artist or platform.

## M0 Design validation

### M0a: working toolkit delivered

The [pilot guide](pilot-guide.md) is the source of truth for implemented behavior:

- Dependency-free ES modules for full-string seeds, named random streams,
  scalar parameters, derived traits, recipe import/export, URL inputs and shortcuts.
- Optional WebGL 1 single-pass GLSL runner, typed scalar/vector uniforms,
  direct-time rendering, isolated PNG export, resource preflight and context recovery.
- Origin-checked iframe bridge with discovery, validated inputs, ordered
  commands/queries, events, structured errors, duplicate handling, and teardown.
- Optional artist-authored info popup, an `i` binding or existing-handler hook,
  and an example read-only info query. See the [info and parameter tools guide](info-and-parameters.md).
- Studio parameter lab, repeatable seed samples with ranges/category counts,
  custom artist checks and failure seeds, and one-variable boundary cases.
  Sampling is isolated from live artwork state; these are not GPU render tests.
- Local shader studio and host viewer; core tests, real-browser integration
  tests, and bundled/minified size measurements.

This is a deliberately small implementation, not completion of M1. The recipe
contains canonical seed/parameter inputs only. The runner does not support
WebGL 2, textures, multipass feedback or simulation replay. The bridge does not
yet implement output schemas, long-operation handles, or platform-specific
permissions. Library integrations, adapters, publishing and TypeScript declarations
remain planned. Core utilities can be used with an artist-owned renderer.

### M0b: artist trial and design review — pending

Provide the toolkit to Mihira and observe one real integration. Record browser,
GPU, WebGL/GLSL versions, uniforms, extensions/assets, render passes, time/state
dependencies, target export size, code changes, and integration effort. Use
the guide's feedback checklist. Revise the SDK based on that session before
expanding renderer support. Do not treat a passing sample or test suite as
evidence that Mihira's work is supported.

### Planned work

- Begin with one existing Mihira artwork in plain JavaScript/WebGL. Request
  the source entry point and shaders needed for integration, plus its current
  seed/time/resolution conventions. Select p5.js, Canvas 2D, and Three.js
  examples later when testing those integrations; they do not block this trial.
- Identify a generative-poetry example that exposes current text and an
  interaction; it may also serve as one of the renderer examples.
- Ensure the reference set includes static, time-dependent, and interactive
  behavior. Record artists' current tools, recurring friction, adoption effort,
  and priority workflows alongside the engineering assessment.
- Walk each work through reopening a seed, named parameters, recipe saving,
  larger export, collection review, and a platform preview.
- Agree on the recipe boundary, seed normalization, generator versioning,
  parameter evaluation, and canonical versus session state.
- Define independent recipe/schema versions, full seed derivation, source/asset
  identity, derived-trait validation, and provenance that does not affect output.
- Classify reference works as static, direct-time, stepped, or checkpoint-based.
  Specify time units, step origin, required state, and supported seeking behavior.
- Specify renderer capabilities and supported library/browser versions.
- Draft the composition/display/output coordinate contract, aspect policies,
  and explicit scaling rules for strokes, texture, noise, and effects.
- Draft bridge schemas, connection policy, command ordering, and content-query
  semantics using the poetry example.
- Separate asynchronous host APIs from wire messages, with typed operation
  results and completion/errors. Draft renderer-neutral requests and results,
  backend-specific targets, isolated export randomness, and resource preflight.
- Treat recipe and bridge formats as experimental pilot contracts. Select an
  initial envelope independently of the browser transport; evaluate JSON-RPC
  conventions without assuming they define discovery or session behavior.
- Review canvas-sketch, Tweakpane, lil-gui, and artist-used alternatives for
  interoperability. Identify where integration can preserve existing workflows
  and avoid duplicate state or unnecessary new UI.
- Obtain representative Verse and Art Blocks runtime payloads and inspect the
  selected Forever Library contract/metadata flow. Verify its generative-series
  convention separately from general V3 minting.
- Establish initial bundle, render-time, export-size, and memory budgets using
  measurements from the selected art; do not invent universal thresholds.
  Define randomness-only, parameters/recipes, basic-bridge, and complete-target
  bundle measurements. Set provisional SDK size hypotheses here and validate
  actual SDK costs during M1; the proposed 5–10 KB core is not a release gate.

### Exit criteria

Document the selected examples, required adoption changes, capability matrix,
known limitations, and decisions in a design review. Confirm an artist can
adopt individual utilities without accepting the complete lifecycle framework.
Resolve the relevant M1 blockers listed below before extending or stabilizing
their contracts; the small M0a APIs remain provisional until artist trials.
The review chooses initial contracts to test, not permanent public schemas.
Include an artist-adoption assessment and an integration/reuse decision for
existing tools; architectural feedback alone does not establish artist demand.

## M1 Reproducible artwork and basic bridge

### Planned scope

The M0a subset above is available. The items and exit criteria below describe
the broader milestone and are not all implemented in `0.1.0-alpha.2`.

- Versioned recipes, seed handling, deterministic random streams, keyed
  sampling, and uniform/weighted choices plus initial normal, truncated-normal,
  and log-uniform distributions.
- Typed parameters, validation, defaults, stable IDs, simple dependencies,
  deterministic trait mapping, and JSON recipe import/export.
- URL helpers, explicit environment modes, asset readiness, action registry,
  keyboard controls, and basic viewport/lifecycle hooks.
- Extend the raw-WebGL pilot with p5.js, Canvas 2D, and Three.js integrations,
  with visible PNG capture
  and high-resolution rerender hooks where the example supports them. Include
  composition/display/output transforms and declared effect-scaling policies.
- Asynchronous render completion and failure reporting, export preflight,
  isolated PRNG/state handling, and cleanup on supported cancellation paths.
  Declare supported temporal modes and reject unsupported seeking; a complete
  simulation replay or checkpoint engine is not required for the first pilot.
- Basic bridge discovery, commands, queries, events, structured errors,
  session isolation, and a minimal host used for testing the poetry example.
- JavaScript examples, TypeScript definitions, migration instructions, and
  meaningful automated checks for the implemented contracts.
- Selective runtime imports, representative bundle measurements, and initial
  code diagnostics, state comparisons, and environment records independent
  of a full workbench.

### Exit criteria

1. Each renderer example reopens its saved recipe with the same resolved
   parameters and intended composition.
2. Adding a sample to an independent texture stream does not change composition
   choices, and changing a parameter label does not change its stable identity.
3. Resizing and exporting do not alter canonical inputs or advance the visible
   artwork's random state. Rerender-capable examples preserve intended geometry,
   stroke proportions, texture scale, and framing at preview, display, and
   larger export sizes, plus a changed viewport aspect ratio. Explicit
   pixel-relative effects follow their declared policy within the resource budget.
4. URL errors are useful, typing does not trigger shortcuts, and studio seed
   controls are not accidentally available in published mode.
5. The bridge passes its initial poetry acceptance criteria, including read-only
   queries, asynchronous discovery, acceptance versus completion, duplicate-command
   handling, stale-session rejection, and teardown. Distinguish query nonmutation
   under controlled time from naturally changing answers during playback.
6. Each example runs without a host connection or an Oriel network service.
7. One reference work completes the connected pilot workflow: reopen a saved
   instance, inspect parameters, invoke a supported interaction through the
   bridge, query current content, and export the visible result. This does not
   require atomic image/text capture or full session replay.
8. Bundle reports show what is included, minified uncompressed cost, relevant
   transfer sizes, and build versions. Importing basic utilities does not pull
   in the workbench, publishing clients, or heavy exporters. Establish measured
   budgets for subsequent releases and record target-specific exceptions.
9. Recipe and bridge drafts are exercised across static, animated, and
   interactive examples. Record compatibility revisions and unresolved cases
   before promoting any schema or protocol subset to stable status.
10. Exercise oversized requests, allocation errors, and context loss where
    applicable. Report failure or an explicit alternative without silently reducing
    quality; clean up export resources and verify that export did not mutate live
    PRNG or canonical/session data. Record live-context recovery limitations.
11. Identify how each dynamic example reconstructs a moment. Validate its
    declared time/step metadata and unsupported-seek behavior. Verify that
    export timestamps do not alter recipe identity and inconsistent dimensions
    or derived traits are detected.

This milestone does not require a full workbench, production bitVerse rollout,
wallet support, snapshot replay, tiled export, or a platform release.

## M2 Collection and viewer workflows

### Planned scope

- Local seed gallery, favorites, notes, saved presets, parameter locks, sweeps,
  comparisons, contact sheets, and collection manifests.
- Optional parameter controls and undo/redo in the workbench.
- Batch rendering, distribution reports, failing-recipe capture, and agreed
  browser/size checks. Extend M1 diagnostics with selected cross-device render
  comparisons; distinguish likely code risks from observed state/image differences.
- Bridge inspector and an initial bitVerse viewer host implementation.
- Visible-text transcripts and controls discovered from the poetry example.
- Defined session snapshots for at least one interactive work, including
  compatibility validation and restore behavior. Demonstrate a supported
  checkpoint or deterministic replay path with explicit timestep, input history,
  position semantics, and progress/cancellation where feasible.

### Exit criteria

An artist can review a recorded sample set, save a selection, restart the
workbench, and reopen the same outputs. Reports include the sample manifest,
failures, environment, and observed distributions rather than promising exact
rarity quotas. The sample size is agreed from M0 measurements and collection
needs, not hardcoded as a universal requirement.

Reports state which diagnostic levels ran, tested devices and browsers, known
coverage gaps, and artist-approved visual tolerances. Shader precision readings
are supporting evidence, not a certificate of cross-device determinism. Where
an existing control library is integrated, verify that its save/load and update
behavior cannot silently override the SDK's canonical parameter state.

In bitVerse, the connected instance exposes its current poem, responds to a
supported interaction, and updates its transcript through events. Switching
works or reloading clears old subscriptions. A non-bridge artwork retains normal
viewing. A saved supported session restores the intended interactive moment.
Reconstruction tests distinguish simulation steps from display frames and reject
incompatible or incomplete state references rather than reporting false success.

## M3 Platform readiness

### Planned scope

- Standalone-web packaging and archival manifests.
- Verse runtime and packaging support for verified inputs, traits, and capture.
- Art Blocks runtime and packaging support for the selected generator and
  dependency constraints.
- A Forever Library V3 metadata/publishing preparation prototype with pinned
  chain and contract version; a generative-series runtime adapter only after
  its conventions are verified.
- Target capability reports, size checks, dependency manifests, and explicit
  errors for unsupported inputs or features.
- Consistent recipe/trait use across local rendering and target previews.

### Exit criteria

Prepare the same artwork's drawing logic for supported targets through
adapter/build configuration, and verify the result in the target's actual test
or staging workflow when access exists. Record any necessary target-specific
artwork changes rather than claiming universal portability.

Compare canonical resolved inputs across equivalent test contexts, verify
metadata against the artwork, and capture complete thumbnails at the intended
moment. Do not expect unrelated native mint hashes from different platforms to
produce the same instance automatically.

Measure the final target artifact and SDK overhead against the target's actual
packaging constraints. Verify self-contained targets without dynamic network
imports; optional lazy loading must not become an archival runtime dependency.

A locally emulated target is labeled as such until real integration is verified.
One target's access or API gap must not block standalone packaging or other
verified adapters. Produce a manual handoff artifact where appropriate.

## M4 Production publishing

### Planned scope

- Release manifests, reproducible bundles, content digests, and archived inputs.
- Supported storage uploads, simulation and signing flows, receipt tracking,
  interrupted-operation recovery, and read-back verification.
- Explicit presentation of target, chain, contract, metadata, costs where
  available, and finalization steps before the artist submits operations.
- Manual submission bundles for targets without an appropriate publishing API.
- Compatibility documentation, release notes, and migration policy.

### Exit criteria

Demonstrate a complete supported test release, including recovery after an
interrupted operation without silently creating a duplicate mint. Reconcile
published identifiers and content with the recorded release bundle and rerender
the result from its archived inputs. Production release is a separate artist
decision after this verification, not an automatic roadmap action.

Publishing readiness is declared per target. SDK publishing support does not
guarantee platform approval, marketplace indexing, storage availability, or
long-term operation of third-party services.

## M5 Advanced output and extensions

Candidates, each requiring its own design and acceptance cases:

- Tiled high-resolution export with overlap, postprocessing, and feedback-state
  constraints. Preflight and useful failure handling already belong to M1;
  universal tiling is not a prerequisite for the pilot.
- Print presets, bleed/crop marks, professional color workflows, and supported
  physical-output integrations.
- Deterministic frame sequences, optional video/audio encoders, and atomic
  image/semantic-state capture.
- SVG and plotter export for suitable geometry.
- Additional distributions, noise utilities, complex constraints, and exact
  edition allocations where supported by the release model.
- More platform adapters and separately verified contract families, including
  Forever Library Tezos if prioritized.
- Bridge gesture streams, host-service requests, agent session routing,
  explicit exhibition bindings, and multi-artwork orchestration.

Require evidence from an actual artwork for each extension. Large exports must
show preserved composition and resource limits; replay must reproduce declared
state; new adapters must pass the same conformance expectations as initial ones.

## Cross-cutting verification and release policy

During implementation, test the properties that preserve artworks:

- Known random-generator vectors and serialized recipe round trips.
- Parameter constraints, stable identifiers, and trait/render consistency.
- Renderer resize/export isolation, asset failures, and resource cleanup.
- Asynchronous render results, export PRNG isolation, allocation/context-loss
  failures, and cancellation where supported.
- Temporal metadata, timestep/display-rate separation, derived-trait validation,
  and recipe identity independent of incidental export provenance.
- Coordinate mappings, effect scaling, code-diagnostic limitations, repeated
  state comparisons, and recorded rendering environments.
- Bundle budgets and optional-dependency isolation using representative builds.
- Bridge schema validation, origin/source policy, ordering, rate limits,
  disconnects, duplicate requests, and instance isolation.
- Adapter fixtures from verified platform examples and real target checks.
- Snapshot compatibility and publishing recovery where those features exist.

Keep exact pixel comparisons in a controlled rendering environment. Review
broader visual differences against an agreed tolerance and the artist's intent.
Validation reports must distinguish automated checks, manual review, emulation,
and verified platform behavior.

Use the repository's [branch and PR workflow](../CONTRIBUTING.md) for subsequent
implementation. Maintain small focused changes, document public API decisions,
and publish versioned releases with migration notes. Algorithm or schema changes
that alter generated outputs require explicit compatibility handling. Pin
versions in released artworks rather than silently upgrading them.

## Open decisions and dependencies

| Decision | Why it matters | Resolve before |
| --- | --- | --- |
| Representative artworks and artist feedback process | Grounds the API in real adoption costs | M0 exit |
| Supported p5.js modes, Three.js versions, and browser baseline | Defines renderer and export promises | M1 |
| Coordinate spaces, aspect policy, and effect units | Preserves composition and interaction mapping across sizes | M1 |
| Renderer-neutral request/result and backend target contracts | Supports offscreen output, async work, and failure handling | M1 |
| Temporal modes, time/step semantics, and reconstruction inputs | Makes saved moments meaningful without promising universal replay | M1 declarations; M2 supported replay/snapshots |
| Export limits, isolated PRNG policy, and context-loss recovery | Protects live state and bounds large-output promises | M1 |
| Random algorithm, seed normalization, and keyed derivation | Fixes reproducibility semantics | M1 |
| Recipe serialization, identity, and migration rules | Connects sharing, export, snapshots, and preservation | Draft before M1; stability review at M1 exit |
| Parameter evaluation order and dependency/constraint policy | Prevents accidental changes and nontermination | M1 |
| Bridge schemas, envelope, transport, completion, and session policy | Enables interoperable artwork and host implementations | Draft before M1; stability review at M1 exit |
| Embedding and opaque-origin support | Determines safe connection bootstrap and unsupported cases | M1 |
| Runtime bundles, module boundaries, and size budgets | Affects adoption and target compatibility | M1 baseline; refine in M3 |
| Existing-tool integration and state ownership | Preserves artist workflows without competing parameter state | M0 review; validate chosen integrations in pilot |
| Diagnostic coverage and rendering comparison matrix | Bounds determinism claims and identifies reproducible differences | M1 baseline; expand in M2 |
| Workbench form and persisted data format | Determines local workflow without coupling the runtime | M2 |
| bitVerse viewer ownership and deployment path | SDK endpoint alone does not deliver host support | M2 |
| Platform access, fixtures, and exact project requirements | Separates emulation from verified compatibility | M3 |
| Forever Library generative-series convention and initial chain | General V3 metadata support is insufficient for runtime parity | M3 |
| Signing, storage, and publication responsibilities | Determines transaction UX and recovery behavior | M4 |
| Supported export sizes, color baseline, and print requirements | Bounds output promises and advanced work | M1 baseline; M5 extensions |

Next action: Mihira tries the M0a SDK on Kepler's Dream, their first JavaScript/WebGL project.
Record the M0b integration findings and refine the pilot before declaring a
stable API or starting broader M1 renderer work. Publishing artwork remains a
separate, later workflow.
