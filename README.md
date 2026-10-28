# Oriel Artist SDK

JavaScript tools for making generative artworks easier to explore, describe,
export and reopen. Save a composition's seed and parameters, tell viewers what
an artwork supports, and capture a particular frame for export or printing.

Adopt the parts you need while keeping your renderer and artistic decisions.
The SDK has no runtime dependencies, uses ES modules, and is MIT licensed.
No wallet, blockchain connection or hosted Oriel service is required.

**Experimental.** The core package is `0.1.0-alpha.4`; the standalone capabilities
and metadata packages are `0.1.0-alpha.1`. APIs can change. Record the SDK commit
alongside your artwork release; package version numbers alone do not identify
every pilot update.

## Start here

With Git and Node.js 22 or later:

```sh
git clone https://github.com/oriel-art/artist-sdk.git
cd artist-sdk
npm run dev
```

Open [the shader studio](http://127.0.0.1:4173/examples/webgl/). Change the seed or
parameters, pause the animation, then save a PNG and its recipe. The
[bridge viewer](http://127.0.0.1:4173/examples/host/) shows an artwork communicating
with its surrounding viewer. These browser demos run directly from source;
no dependency installation or build is needed.

**[Follow the artist quickstart](docs/getting-started.md)** to install the SDK in
your own project, run a minimal example, and choose the modules you need.

## What can I use today?

| Need | Available tools |
| --- | --- |
| Explore and reopen compositions | Seeded randomness, typed parameter values, saved recipes and explicit artist hooks for restoring frame/state context |
| Describe an artwork | Project/edition metadata, translations, licensing and descriptive provenance references |
| Tell viewers what is supported | Technical limits, artist constraints, output validation and optional runtime evaluation |
| Make an artwork discoverable | Static JSON descriptions and opt-in runtime queries through the artwork bridge |
| Render and export a saved frame | Canvas 2D, p5.js P2D/WEBGL and Three.js integrations with isolated PNG export; capture-and-screen workflows |
| Build studio controls | Optional info panel, parameter editing, repeatable parameter checks and case replay |

The full `@oriel-art/artist-sdk` package includes these modules. Use
`@oriel-art/capabilities` or `@oriel-art/metadata` independently when you only need
artwork descriptions and validation. See [package choices and TypeScript coverage](docs/getting-started.md#choose-your-package).

Keep an existing renderer to adopt the utilities independently, or use the
[renderer integrations](docs/renderers.md): Canvas 2D, p5.js instance mode and
Three.js. p5 WEBGL and Three.js support WebGL 2; the older `/webgl` shader runner
remains a separate WebGL 1 option. Complex feedback/postprocessing and automatic
simulation restoration need artist-defined integration. Platform publishing
adapters remain future work.

To try all three stacks, run `npm ci`, `npm run build:renderer-examples`, then
`npm run dev` and open [the renderer examples](http://127.0.0.1:4173/examples/renderers/).
The examples bundle pinned development libraries locally; the SDK adds no runtime
dependency on p5.js or Three.js.

Recipes capture inputs; your artwork defines how to restore its state. Automatic
simulation/session replay and cross-device pixel identity are not provided.
Print screening records artist-defined checks for a saved job; a downstream
print function can use the exported image and report directly.

## Guides and examples

| Guide | Use it for |
| --- | --- |
| [Artist quickstart](docs/getting-started.md) | Installation, package selection and a first integration |
| [Renderer integrations](docs/renderers.md) | Canvas 2D, p5.js, Three.js, saved snapshots and isolated PNG export |
| [JavaScript / WebGL integration](docs/pilot-guide.md) | Seeds, recipes, your own renderer, PNG export and the iframe bridge |
| [Capabilities, metadata and discovery](docs/capabilities-and-metadata.md) | Artwork descriptions, output constraints, static JSON and runtime queries |
| [Capture-and-screen workflow](docs/print-workflow-pilot.md) | Saved compositions, artist-defined screening, limits and report/image linking |
| [Info and parameter tools](docs/info-and-parameters.md) | Artwork information panels and repeatable parameter exploration |
| [Recipe and renderer integration](docs/alpha3-guide.md) | Artist generators, frame context and uniform bindings |
| [Parameter editing and reports](docs/alpha4-guide.md) | Case reports, exact seeds and optional live preview |

Working examples live in [examples/](examples/): the browser studio and host,
[discovery](examples/discovery/main.mjs), and
[capture and screening](examples/print-workflow/main.mjs).

Kepler's Dream has reported successful integration and replay testing; the
[feedback record](docs/keplers-dream-feedback.md) distinguishes those artist
reports from repository tests. The examples here are sample artworks and
fixtures, not Kepler's source or artist-approved print specifications.

## Development and future plans

For development checks, run `npm ci`, `npm test`, `npm run test:types`,
`npm run test:packages`, `npm run test:browser`, and `npm run size`.
Browser setup is described in the [integration guide](docs/pilot-guide.md#verification-and-size).

The [artist proposal](docs/artist-proposal.md), [feature plan](docs/feature-plan.md),
[bridge proposal](docs/artwork-bridge.md) and [roadmap](docs/roadmap.md) describe
broader ambitions, including features not implemented today. Start with the
quickstart and integration guides for working APIs.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and review policy.
Use [GitHub issues](https://github.com/oriel-art/artist-sdk/issues) to report a
problem or propose an integration; include the SDK commit, browser/renderer and
a minimal reproduction where possible.
