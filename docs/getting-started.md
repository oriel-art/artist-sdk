# Artist quickstart

Use the Oriel Artist SDK to save and reopen compositions, describe your artwork,
and tell viewers or export tools what it supports. You can adopt those features
without replacing your renderer, animation loop or existing controls.

The SDK is experimental JavaScript with no runtime dependencies. It works as
ES modules in browsers and in Node.js; rendering and DOM tools require a browser.
Use Node.js 22 or later for the repository commands below.

## Try an artwork in five minutes

With Git and Node.js installed:

```sh
git clone https://github.com/oriel-art/artist-sdk.git
cd artist-sdk
npm run dev
```

Open <http://127.0.0.1:4173/examples/webgl/>. Change the seed and parameters,
pause the animation, save a PNG, and save the recipe for reopening that
composition. Open <http://127.0.0.1:4173/examples/host/> to try the viewer bridge.
Use HTTP rather than opening the HTML file directly. Stop the server with Ctrl+C.
These demos need no dependency installation or build.

The sample artwork uses the SDK's optional single-pass WebGL 1 renderer. Your
own artwork can keep its renderer and use just the other SDK modules.

## Choose your package

| Package or entry point | What it provides | TypeScript declarations |
| --- | --- | --- |
| `@oriel-art/artist-sdk` | Core artwork, randomness, parameters and recipes; optional modules through subpath imports | Core and older UI/renderer modules are JavaScript-only |
| `@oriel-art/artist-sdk/capabilities` | Rendering/print constraints, validation and capture-and-screen workflow | Yes |
| `@oriel-art/artist-sdk/metadata` | Project/edition descriptions, translations and provenance references | Yes |
| `@oriel-art/artist-sdk/discovery` | Combined static description and runtime query registration | Yes |
| `@oriel-art/capabilities` | Standalone equivalent of the SDK capabilities module | Yes |
| `@oriel-art/metadata` | Standalone equivalent of the SDK metadata module | Yes |

**Start with the full SDK package** if you want recipes, discovery or viewer
integration. You do not need to install the standalone packages as well. Choose
the standalone packages if you only need descriptions or constraints; neither
requires the core artwork API, a DOM, a renderer, a wallet or a network service.

Import optional modules explicitly, for example `@oriel-art/artist-sdk/webgl`,
`@oriel-art/artist-sdk/bridge` or `@oriel-art/artist-sdk/parameter-panel`.
The root import does not enable a renderer, panel or bridge automatically.

## Install in your own project

These steps build and install tarballs from a checkout, without relying on an
npm registry release. They work for Node.js examples and browser projects that
use a bundler. Run them from the `artist-sdk` directory created above:

```sh
npm ci
mkdir -p ../oriel-sdk-packages
npm pack --pack-destination ../oriel-sdk-packages
git rev-parse HEAD
```

`npm ci` installs development dependencies and builds the standalone packages;
`npm pack` creates `oriel-art-artist-sdk-0.1.0-alpha.4.tgz`. Record the printed Git
commit with your project: different experimental commits may have the same
package version. Keep the tarball and your project's lockfile for repeatable
installs. Use a distinct archive location when packaging a later commit with
the same version.

Create a new sibling project and install that archive:

```sh
cd ..
mkdir my-oriel-artwork
cd my-oriel-artwork
npm init -y
npm install ../oriel-sdk-packages/oriel-art-artist-sdk-0.1.0-alpha.4.tgz
```

For an existing project, run the last command from that project's directory,
adjusting the archive path. The filenames here reflect the current repository
versions; use the filename printed by `npm pack` if those versions change.

### First integration

Save this as `artwork.mjs` in `my-oriel-artwork`:

```js
import { createArtwork } from '@oriel-art/artist-sdk';
import { createMetadata } from '@oriel-art/artist-sdk/metadata';
import { createCapabilities } from '@oriel-art/artist-sdk/capabilities';
import { createDiscovery, registerDiscovery } from '@oriel-art/artist-sdk/discovery';

const artwork = createArtwork({
  id: 'tidal-lines',
  version: '1',
  seed: 'composition-001',
  parameters: {
    density: { type: 'integer', min: 8, max: 36, default: 16 }
  }
});

const metadata = createMetadata({
  schemaVersion: '1.0',
  project: {
    id: artwork.id,
    title: 'Tidal Lines',
    creators: [{ name: 'Your artist name' }],
    medium: 'Generative software'
  }
});

// Example limits: replace these with limits your artwork actually supports.
const capabilities = createCapabilities({
  schemaVersion: '1.0',
  technical: { rendering: {
    width: { min: 64, max: 4096 },
    height: { min: 64, max: 4096 },
    maxPixels: 4096 * 4096,
    formats: ['image/png']
  } },
  artist: { rendering: { aspectRatios: [1] } }
});

const discovery = createDiscovery({
  schemaVersion: 'oriel-artwork/1.0',
  artwork: { id: artwork.id, version: artwork.version },
  metadata: metadata.getMetadata(),
  capabilities: capabilities.getCapabilities()
});
const unregister = registerDiscovery(artwork, discovery);

console.log('Recipe:', JSON.stringify(artwork.getRecipe(), null, 2));
console.log('Export check:', discovery.validateRequest({
  width: 2048, height: 2048, format: 'image/png'
})); // { status: 'supported', issues: [] }
console.log('Title:', (await artwork.query('metadata')).project.title);
console.log('Static description:', JSON.stringify(discovery.getDiscovery(), null, 2));

// Call when removing the integration; keep registered while the artwork is active.
unregister();
```

Run it:

```sh
node artwork.mjs
```

You should see a recipe, a `supported` export check, the title `Tidal Lines`, and
a JSON description. This example describes an artwork; it does not draw or export
an image. In your renderer, read `artwork.parameters.density` and use
`artwork.random('composition')` for seeded choices. The [integration guide](pilot-guide.md)
explains recipe restoration, rendering, PNG export and connecting an iframe viewer.

A capability declaration describes what your integration supports; it does not
implement an exporter. Keep declarations aligned with your renderer and current
studio/collector mode. State restoration follows your artwork's recipe contract
and does not imply identical pixels across devices.

### Standalone metadata or capabilities

From the `artist-sdk` checkout, build and pack only the packages you need:

```sh
npm ci
mkdir -p ../oriel-sdk-packages
npm pack --workspace @oriel-art/capabilities --pack-destination ../oriel-sdk-packages
npm pack --workspace @oriel-art/metadata --pack-destination ../oriel-sdk-packages
```

Then, from your own project's directory (the sibling `my-oriel-artwork` above):

```sh
npm install ../oriel-sdk-packages/oriel-art-capabilities-0.1.0-alpha.1.tgz ../oriel-sdk-packages/oriel-art-metadata-0.1.0-alpha.1.tgz
```

Install just one archive if you only need one package. Import `createCapabilities`
from `@oriel-art/capabilities` or `createMetadata` from `@oriel-art/metadata`;
the metadata and capability examples above otherwise work unchanged. Combined
discovery and core artwork creation remain part of `@oriel-art/artist-sdk`.

### Browser projects without a bundler

Copy the complete repository `src/` directory into your project, preserving its
internal relative paths. For example, place it at `vendor/artist-sdk/src/`, then
use imports such as:

```js
import { createArtwork } from './vendor/artist-sdk/src/index.js';
import { createMetadata } from './vendor/artist-sdk/src/metadata.js';
```

Load your entry script with `<script type="module" src="main.js"></script>` and
serve the project over HTTP. Browsers do not resolve bare npm package names
without a bundler or import map. Copy the SDK's `LICENSE` with the vendored files
and record its commit. Replace the complete source directory when upgrading.

## Next steps for your artwork

- **Describe and expose your work:** use the [capabilities and metadata guide](capabilities-and-metadata.md)
  for static discovery JSON, translations, editions and runtime queries.
- **Capture a composition for export or printing:** use the [capture-and-screen guide](print-workflow-pilot.md).
  You supply the artist's constraints, capture callback and any screening checks;
  a print function can consume the exported image and report without an SDK approval step.
- **Explore parameters:** use the [info and parameter tools](info-and-parameters.md),
  [recipe integration](alpha3-guide.md) and [editing/report guide](alpha4-guide.md).

The optional renderer supports single-pass WebGL 1. Dedicated p5.js, Canvas 2D,
Three.js, WebGL 2/multipass export and platform publishing adapters are future
work; keeping your own renderer is supported now. Automatic simulation replay
is also outside the current implementation.

For integration questions or bugs, [open an issue](https://github.com/oriel-art/artist-sdk/issues)
with your SDK commit, browser/renderer, expected result and a small reproduction.
See the [feedback record](keplers-dream-feedback.md) for reported artist trials.
The [proposal](artist-proposal.md), [feature plan](feature-plan.md) and
[roadmap](roadmap.md) describe future work rather than additional available APIs.
