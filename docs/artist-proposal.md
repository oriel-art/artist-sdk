# Artist SDK proposal for artists

An open-source toolkit for creating, presenting, and preserving generative art.

We are developing an open-source JavaScript SDK to help generative artists build,
explore, export, and publish their work.

The goal is to reduce the technical work artists repeatedly rebuild between
projects: seed handling, parameter controls, keyboard shortcuts, image export,
preview capture, metadata, and platform integration.

Artists would continue working with **plain JavaScript/WebGL, p5.js, Canvas 2D,
and Three.js**,
adopting the parts of the SDK that suit their practice. Existing sketches,
control panels, and development environments should remain usable.

**An experimental SDK is available in the repository.** Start with the
[artist quickstart](getting-started.md) for installation and working examples.
Implemented features include seeded parameters and recipes, an optional WebGL 1
renderer and PNG export, the artwork bridge, info/parameter tools, capabilities,
metadata, discovery, and capture-and-screen workflows.

Kepler's Dream has reported successful integration, including discovery and
saved-job replay; see the [feedback record](keplers-dream-feedback.md). This
document is the broader product proposal, not the API reference. Features below
remain proposals unless documented as available in the quickstart and integration
guides.

## The experience we want to support

Start with an existing sketch. Give its parameters meaningful names, connect
its random choices to a reproducible seed, and register the controls it supports.

Explore variations. Save an interesting result. Send it to a collaborator.
Reopen it later and export the same composition at a larger size.

For animated or interactive work, identify the moment or state you want to
preserve and how the artwork can reconstruct it.

When preparing a release, use a platform adapter to handle the destination's
inputs, metadata, packaging, and preview conventions.

An artwork could also communicate with its viewer. A generative poem could
expose its currently visible text. A composition could describe its interactive
regions. An exhibition viewer could provide appropriate controls without
understanding the artwork's internal drawing code.

The proposed toolkit connects these workflows through five feature areas and
an **artwork bridge**.

## Consistent controls and presentation

The SDK would provide reusable utilities for common artwork behaviors:

- Reading and validating settings from URLs.
- Creating shareable links to particular variations.
- Loading images, fonts, and textures before rendering or capture.
- Managing canvas dimensions, aspect ratio, and display resolution.
- Providing optional information and help panels.
- Connecting keyboard, button, and touch controls.
- Coordinating playback, restart, resize, and preview readiness.

Suggested shortcuts include `s` to save, `i` for information, `Space` to pause,
and `f` for fullscreen. Artists could change or disable them.

The same action would work across interfaces. A save button and the `s` key
would invoke the same export behavior.

Controls would respect the artwork's context. Generating new seeds is useful
during studio exploration; a published token viewer should preserve the work's
identity unless the artist explicitly exposes another behavior.

The artwork would decide when it is ready for interaction and when its intended
preview is ready to capture. These may be different moments.

## Randomness and meaningful parameters

Artists should be able to describe variation using concepts that belong to
their work: density, rhythm, palette, symmetry, texture, speed, or other artistic
choices.

A parameter could include:

| Property | Example |
| --- | --- |
| Name | Mark density |
| Type | Number |
| Allowed values | 20–180 |
| Generation rule | Favor moderate values, with occasional sparse or dense results |
| Default | 80 |
| Editing policy | Adjustable in the studio; fixed in the published work |
| Public trait | Sparse, Balanced, or Dense |

Randomness utilities would provide repeatable seeded choices, weighted
selection, common distributions, shuffling, and sampling.

Separate random streams could isolate different parts of an artwork. Adding
another random texture decision should not unexpectedly change the palette or
composition.

Artists could:

- Lock selected parameters while exploring others.
- Save named presets.
- Define relationships and constraints between values.
- Derive one value from another.
- Validate imported settings.
- Choose which parameters become public traits.

Parameters and traits would remain distinct. A numerical density input might
produce a descriptive trait such as "Sparse." Both should reflect the same
resolved artistic choices.

The SDK would distinguish probabilities from exact edition allocations. A 10%
weight does not guarantee ten occurrences in an edition of one hundred.

It would also help diagnose unintended randomness. Supplying a seeded generator
does not automatically make every dependency deterministic; the toolkit should
expose likely problems and support repeatable checks.

## Reliable export and print preparation

Saving the visible canvas and producing a large print require different
capabilities. The SDK would support both with clear expectations.

Proposed features include:

- Save the currently displayed artwork.
- Rerender a composition at a requested resolution.
- Preserve an aspect ratio or apply a deliberate crop.
- Export with a transparent or chosen background.
- Select which canvases or layers belong in the output.
- Generate consistent filenames.
- Save the settings needed to reproduce the result.
- Prepare output using physical dimensions and a target print resolution.

The design separates three spaces:

| Space | Purpose |
| --- | --- |
| Composition | Where the artist defines geometry, spacing, and proportions |
| Display | How the composition fits the current viewing area |
| Output | The pixels required for an exported image |

An artist could work on a logical 1,000 by 1,000 composition, display it in a
smaller window, and export it at 6,000 by 6,000 pixels, where the renderer and
available resources support that output.

Artists would also distinguish **effects that scale with the composition** from
**effects tied to pixels**. Stroke thickness, texture grain, blur, and shader
effects may need different policies.

Higher-resolution rendering requires cooperation from the artwork. The SDK
cannot recover detail from a screenshot or automatically make every shader
resolution-independent. Renderer-specific examples and hooks would help artists
define the intended behavior.

Export would use isolated rendering state so it does not change the live
composition, consume its random sequence, or leave the viewer resized.

Before a large export, the toolkit would check relevant rendering limits and
estimate resource needs. Expensive operations should report progress, support
cancellation where practical, and fail clearly while preserving artwork state.
If a graphics failure also interrupts the live viewer, it should report the
problem and attempt supported recovery.

Tiled rendering, vector output, plotter files, and advanced print workflows
would be supported only where the artwork and renderer can produce correct
results.

## Exploration and collection review

An optional local workbench would help artists understand their generative
systems across many outputs.

Planned tools include:

- Grids of seed variations.
- Favorites, notes, and saved presets.
- Exact reopening of saved recipes.
- Parameter locking and systematic sweeps.
- Comparisons between sketch versions.
- Contact sheets for collaborators and curators.
- Reports of observed parameter and trait distributions.
- Ordered selections for artist-curated collections.

Validation tools would help identify failed renders, slow seeds, missing assets,
inconsistent metadata, and unexpected differences between environments.

| Check | What it helps reveal |
| --- | --- |
| Code diagnostics | Likely sources of unintended randomness or time dependence |
| State comparisons | Differences in parameters, traits, or exposed artwork state |
| Image comparisons | Visible changes across selected sizes, browsers, or devices |
| Environment records | Conditions needed to investigate and reproduce a result |

These tools would support artistic judgment. An intentionally dark image or
unusual outlier would not automatically be classified as a failure.

The SDK would distinguish reproducible artistic decisions from identical
pixels. Browser and graphics differences can affect rendering. Validation
should document what was tested and help investigate differences without
promising universal pixel equality.

## Platform adapters and publication preparation

The SDK would separate platform integration into three responsibilities:

| Capability | Responsibility |
| --- | --- |
| Runtime integration | Receive platform inputs, expose traits, and signal preview readiness |
| Release preparation | Package code and assets according to the destination's requirements |
| Publishing | Support uploads, configuration, and transactions where an appropriate integration exists |

Initial targets would include standalone websites, Verse, Art Blocks, and
selected Forever Library contracts.

The aim is to reuse artwork logic wherever possible while making platform
differences explicit. Runtime compatibility, publication requirements, and
platform approval are separate concerns.

Artists should be able to inspect the release bundle and preview before
publishing. Where direct publishing is unavailable, the SDK could prepare a
documented handoff package.

Release records would preserve relevant source versions, assets, dependencies,
metadata, and publication references. Publishing operations should report their
status and recover from interruptions without silently creating duplicate
releases.

## The artwork bridge

The artwork bridge would let artists define an explicit interface for a viewer
such as bitVerse. The artist chooses what the artwork exposes.

| Capability | Example |
| --- | --- |
| Discovery | "This work supports pause, region selection, and a transcript." |
| Commands | "Advance to the next stanza." |
| Queries | "What poem is currently visible?" |
| Events | "The visible poem has changed." |

For generative poetry, a viewer could retrieve the current text, display an
accessible transcript, support a read-aloud experience, or save the text
alongside an image.

For visual work, it could activate a location or a named region such as "moon."
Artists could also expose direct actions: "reveal the next layer," "change
viewpoint," or "begin the next movement."

Physical and programmatic interactions would invoke the same artist-defined
behavior.

Commands would report whether they were accepted, completed, or failed. This
matters when an action starts a transition rather than producing an immediate
result.

Queries would observe without changing the artwork. Asking for the current
poem would not generate another poem or advance its random sequence. Responses
could identify the state or moment they describe. A work can still progress
independently between two queries.

Possible applications include:

- Accessible controls and content descriptions.
- Exhibition interfaces tailored to each work.
- Captions that follow changing content.
- Guided experiences.
- Artist-authorized automation.
- Assistants that can discuss the actual content of a running artwork.

The bridge would expose registered capabilities rather than unrestricted access
to code or internal variables. Artworks would continue to run without a
connected host.

Its first implementation would include a basic bridge and a small test viewer.
Production exhibition integration and more advanced orchestration would follow
after the interface is tested.

## Preserving animated and interactive moments

For dynamic work, "return to this moment" can mean different things.

| Artwork behavior | How a moment could be reconstructed |
| --- | --- |
| Static composition | Render its resolved inputs |
| Time-addressable animation | Evaluate the work at a specified time |
| Simulation | Start from known state and advance through defined steps |
| Stateful interactive work | Restore a supported checkpoint, then continue |

The SDK would let an artwork declare which approach it supports.

A simulation might need its starting state, timestep, step count, and
interaction history. Display frame rate would remain separate from simulation
timing.

The viewer should know whether seeking is immediate, requires replay, or is
unsupported. Long replays should report progress and allow cancellation where
possible.

Capturing an image and its semantic content together, for example a poem's
image and transcript, would require both to refer to the same moment. This
would be an explicit capability rather than an assumption.

## An artwork recipe for sharing and preservation

A portable **artwork recipe** would connect exploration, sharing, export, and
archiving.

It would record:

- Artwork identity and source or bundle version.
- Seed and random-generation rules.
- Resolved parameters and their schema version.
- Relevant dependencies and assets.
- Logical dimensions and aspect policy.
- Optional information needed to reconstruct a dynamic moment.

A recipe would help artists save a variation, share it with a collaborator,
reopen it later, export it differently, or compare it with another code revision.

Provenance such as an export timestamp could accompany the recipe without
changing the artwork's identity. Derived traits would be checked against the
inputs they describe.

The recipe and bridge formats would remain experimental during the pilot. We
would test them with static, animated, and interactive artworks before
establishing stable specifications.

## Working with existing tools

We would evaluate integration with canvas-sketch, Tweakpane, lil-gui, and other
tools artists already use.

An artist should be able to keep an existing control panel while adopting SDK
parameters, recipes, or the bridge. Integrations would define how state is
shared so two systems do not silently overwrite each other.

The distinctive goal is to connect **reproducible state, artistic parameters,
platform metadata, and viewer interaction**.

The runtime would be modular. Using randomness utilities should not pull in a
workbench, wallet client, or video encoder.

We would measure common feature combinations and complete platform bundles
before setting firm size budgets. Self-contained releases should include what
they need without fetching changing SDK code at runtime.

## How we propose to develop it

| Stage | Intended outcome |
| --- | --- |
| First WebGL toolkit | A small working SDK and examples for Mihira to try; available experimentally |
| Design validation | Integrate one actual artwork, observe adoption, and revise coordinate policies and interfaces |
| Initial artist pilot | Reproducible parameters, basic controls, export hooks, and an artwork bridge |
| Collection and viewer tools | Exploration, broader validation, and initial bitVerse integration |
| Platform readiness | Verified runtime adapters and release packages |
| Publishing and advanced output | Supported release workflows and specialized export capabilities |

The first pilot should demonstrate:

**Open a saved instance → inspect its parameters → interact → retrieve current
content → export the visible result.**

It should also establish what happens when a request fails, an export exceeds
available resources, or a dynamic moment cannot be reconstructed directly.

The available shader example supports direct-time rendering and exporting the
current moment, while its recipe saves only seed and parameters. Temporal recipe
declarations, full replay, checkpoint restoration, and synchronized image/content
capture follow after artist trials where the artwork supports them.

## Open source and artist ownership

The SDK is intended to have public documentation, examples, versioned releases,
and a contribution process.

Using it would not determine the license of an artist's work. Artists would
choose how their work is distributed, subject to their publishing destinations'
requirements.

Released artwork should be able to use a pinned SDK version and run without an
Oriel service. Updates should not silently alter an existing work's random
sequence, parameter meaning, or generated result.

## What we would like artists to help shape

1. Which technical tasks do you repeatedly rebuild?
2. How do you save and revisit interesting outputs or interactive moments?
3. What makes high-resolution export or printing difficult?
4. Which existing tools would you want to keep?
5. Which platforms create the most adaptation work?
6. What should a viewer be able to ask your artwork or do to it?
7. What content and state should remain private?
8. Could an existing sketch serve as a reference for the first pilot?

Participation could involve reviewing the workflow, identifying a recurring
frustration, or walking through an existing artwork. Those experiences would
determine the first implementation priorities.

## Further planning details

- [Feature plan](feature-plan.md): detailed scope and design boundaries.
- [Artwork bridge](artwork-bridge.md): proposed communication contracts.
- [Roadmap](roadmap.md): milestones, acceptance criteria, and open decisions.
