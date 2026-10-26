# artist-sdk

A small JavaScript SDK for reproducible generative art, with a first pilot for
plain JavaScript and raw WebGL/GLSL on an HTML canvas.

**Experimental: 0.1.0-alpha.2.** The pilot is implemented; artist validation is
next. APIs are not stable and Mihira's actual artwork has not yet been integrated.
The SDK has no runtime dependencies and works as native browser ES modules.

## Try the pilot

With Node.js 22 or later, run `npm run dev` from this repository. Open
[the shader studio](http://127.0.0.1:4173/examples/webgl/) or
[the bridge viewer](http://127.0.0.1:4173/examples/host/).
No dependency installation or build is needed to run these examples.

Read [Mihira's pilot guide](docs/pilot-guide.md) for integration examples,
API behavior, limitations, and a concrete feedback session.
The [info and parameter tools guide](docs/info-and-parameters.md) covers the
`i` popup for Kepler's Dream and utilities for testing the artwork's parameters.

Included:

- Seeded random streams, typed parameter values, traits, and JSON recipes.
- URL sharing and keyboard shortcuts scoped to the artwork.
- An optional single-pass WebGL 1 shader runner and isolated PNG rerendering.
- An iframe bridge for discovery, commands, queries, and events.
- An optional artwork info popup and studio parameter lab with seed reports,
  artist checks, and boundary cases.
- A shader studio, host viewer, unit/browser tests, and bundle-size reports.

Keep your own renderer to adopt the core utilities independently. The optional
runner does not support textures, multipass feedback, or WebGL 2 shaders yet.
Recipes currently save seed and parameters, not animation/session state.
Platform adapters, production bitVerse integration, and publishing are planned.

For development checks: `npm ci`, `npm test`, `npm run test:browser`, and
`npm run size`. Browser setup is described in the pilot guide.

## Feature plan and roadmap

- [Artist proposal](docs/artist-proposal.md): a shareable overview for artists,
  including the proposed workflow, capabilities, and pilot participation.
- [Feature plan](docs/feature-plan.md): artist workflows, scope, architecture,
  rendering, parameters, exploration, and platform integration.
- [Artwork bridge](docs/artwork-bridge.md): proposed communication between an
  artwork and its viewer through commands, queries, and events.
- [Roadmap](docs/roadmap.md): milestones, dependencies, acceptance criteria,
  and decisions to resolve through artist trials and future implementation.

These documents describe the broader product direction, including future p5.js,
Canvas 2D, and Three.js integrations. Use the pilot guide for the implemented API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming conventions,
pull request workflow, and release policy.
