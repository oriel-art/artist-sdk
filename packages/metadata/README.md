# @oriel-art/metadata

Dependency-free ESM for artwork project/edition descriptions, multilingual text,
licenses, and unverified identity, blockchain, and archive references. Includes
TypeScript declarations. This package is in local development and is not published
by this change.

```js
import { createMetadata, resolveLocalizedText } from '@oriel-art/metadata';

const artwork = createMetadata({
  schemaVersion: '1.0',
  defaultLocale: 'en',
  project: { id: 'tidal-lines', title: { en: 'Tidal Lines', fr: 'Lignes de marée' },
    creators: [{ name: 'Example Artist' }], medium: 'Generative software' },
  edition: { id: 'tidal-lines-7', number: 7, total: 100 }
});
resolveLocalizedText(artwork.getMetadata().project.title, 'fr');
artwork.getProvenanceReferences(); // []
```

Exports `createMetadata`, `getMetadata`, `getProvenanceReferences`,
`resolveLocalizedText`, and `METADATA_VERSION`. Reference URIs are never fetched
or verified. No identity service, wallet, or blockchain connection is required.

The full contract and discovery integration are included in `dist/guide.md`
(maintained in the repository's `docs/capabilities-and-metadata.md`). Sources are under `src/` at the
repository root; `npm run build` generates this package's standalone `dist/`.
