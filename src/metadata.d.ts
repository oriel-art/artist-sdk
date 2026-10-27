export const METADATA_VERSION: '1.0';
export type LocalizedText = string | Record<string, string>;
/** Descriptive references only: no identity, ownership, or authenticity verification. */
export interface ProvenanceReference { kind: 'identity' | 'blockchain' | 'archive' | 'other'; uri: string; label?: string }
export interface Creator { name: string; role?: string; references?: ProvenanceReference[] }
export interface License { name: string; uri?: string; text?: LocalizedText }
export interface ProjectMetadata {
  id: string;
  title: LocalizedText;
  creators: Creator[];
  description?: LocalizedText;
  medium?: LocalizedText;
  /** YYYY, YYYY-MM, or YYYY-MM-DD. */
  date?: string;
  artistStatement?: LocalizedText;
  license?: License;
}
export interface EditionMetadata extends Partial<Omit<ProjectMetadata, 'id'>> { id: string; number?: number; total?: number }
export interface Metadata {
  schemaVersion: '1.0';
  defaultLocale?: string;
  project: ProjectMetadata;
  /** Kept separate from project metadata; no implicit license or identity merging. */
  edition?: EditionMetadata;
  provenance?: ProvenanceReference[];
}
export interface MetadataProvider { getMetadata(): Metadata; getProvenanceReferences(): ProvenanceReference[] }
export function getMetadata(description: unknown): Metadata;
export function getProvenanceReferences(description: unknown): ProvenanceReference[];
export function resolveLocalizedText(value: LocalizedText, locale?: string, defaultLocale?: string): string;
export function createMetadata(description: Metadata): MetadataProvider;
