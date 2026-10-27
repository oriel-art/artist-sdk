# @oriel-art/capabilities

Dependency-free ESM for describing and negotiating generative artwork rendering,
printing, interaction, animation, and reproducibility capabilities. Includes
TypeScript declarations. This package is in local development and is not published
by this change.

```js
import { createCapabilities } from '@oriel-art/capabilities';

const artwork = createCapabilities({
  schemaVersion: '1.0',
  technical: { rendering: {
    width: { min: 1, max: 4096 }, height: { min: 1, max: 4096 },
    maxPixels: 16777216, formats: ['image/png']
  } },
  artist: { rendering: { aspectRatios: [1] } }
});
artwork.getCapabilities();
artwork.validateRequest({ width: 1024, height: 1024, format: 'image/png' });
// { status: 'supported', issues: [] }
```

Exports `createCapabilities`, `getCapabilities`, `validateRequest`,
`evaluateRequest`, and `CAPABILITIES_VERSION`. Optional async evaluators are
supplied as `createCapabilities(description, { evaluate })`. Static limits always
apply. A `supported` decision describes declarations, not a guaranteed export.

The full contract and discovery integration are included in `dist/guide.md`
(maintained in the repository's `docs/capabilities-and-metadata.md`). Sources are under `src/` at the
repository root; `npm run build` generates this package's standalone `dist/`.
