import { createCapabilities, type Capabilities, type RenderRequest } from '@oriel-art/capabilities';
import { createMetadata, type Metadata } from '@oriel-art/metadata';
import { createDiscovery, parseDiscovery, registerDiscovery } from '@oriel-art/artist-sdk/discovery';
import { getCapabilities } from '@oriel-art/artist-sdk/capabilities';
import { resolveLocalizedText } from '@oriel-art/artist-sdk/metadata';

const capabilities: Capabilities = { schemaVersion: '1.0', technical: { rendering: {
  width: { min: 1, max: 4096 }, height: { min: 1, max: 4096 }, maxPixels: 4096 ** 2, formats: ['image/png']
} } };
const metadata: Metadata = { schemaVersion: '1.0', project: { id: 'demo', title: { en: 'Demo' }, creators: [{ name: 'Artist' }] } };
const request: RenderRequest = { width: 100, height: 100, format: 'image/png' };
const provider = createCapabilities(capabilities, { evaluate: async (_, { signal }) => ({ supported: !signal.aborted }) });
provider.validateRequest(request);
await provider.evaluateRequest?.(request, { timeout: 100 });
createMetadata(metadata).getProvenanceReferences();
getCapabilities(capabilities);
resolveLocalizedText(metadata.project.title, 'en');
const discovery = createDiscovery({ schemaVersion: 'oriel-artwork/1.0', artwork: { id: 'demo', version: '1' }, metadata, capabilities });
parseDiscovery(discovery.getDiscovery());
registerDiscovery({ id: 'demo', version: '1', manifest: () => ({ queries: {} }), registerQuery: () => () => {} }, discovery);
// @ts-expect-error requests must specify a MIME format
const missingFormat: RenderRequest = { width: 100, height: 100 };
// @ts-expect-error references cannot assert verified identity
createMetadata({ ...metadata, provenance: [{ kind: 'identity', uri: 'did:example:artist', verified: true }] });
// @ts-expect-error print units are explicit
const invalidUnit: RenderRequest = { ...request, print: { width: 1, height: 1, unit: 'pixels', dpi: 300 } };
void missingFormat; void invalidUnit;
