import type { Capabilities, CapabilitiesProvider, RequestEvaluator } from './capabilities.js';
import type { Metadata, MetadataProvider } from './metadata.js';
export const DISCOVERY_VERSION: 'oriel-artwork/1.0';
export const DISCOVERY_MEDIA_TYPE: 'application/vnd.oriel.artwork+json';
export interface DiscoveryManifest {
  schemaVersion: 'oriel-artwork/1.0';
  artwork: { id: string; version: string };
  metadata?: Metadata;
  capabilities?: Capabilities;
}
export interface DiscoveryProvider extends Partial<CapabilitiesProvider>, Partial<MetadataProvider> {
  getDiscovery(): DiscoveryManifest;
}
export function parseDiscovery(input: unknown): DiscoveryManifest;
export function serializeDiscovery(input: DiscoveryManifest): string;
export function createDiscovery(description: DiscoveryManifest, options?: { evaluate?: RequestEvaluator }): DiscoveryProvider;
export function registerDiscovery(artwork: {
  id: string;
  version: string;
  manifest(): { queries: Record<string, unknown> };
  registerQuery(name: string, definition: { description: string; handler: () => unknown }): () => void;
}, discovery: Pick<DiscoveryProvider, 'getDiscovery'>): () => void;
