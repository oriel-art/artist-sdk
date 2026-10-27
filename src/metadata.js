import { requireValue } from './errors.js';
import { data, fields, text, positive, list, uri } from './description-data.js';

export const METADATA_VERSION = '1.0';
function localized(value, label) {
  if (typeof value === 'string') return text(value, label, 10000);
  fields(value, Object.keys(value ?? {}), label);
  requireValue(Object.keys(value).length > 0 && Object.keys(value).length <= 50, 'Invalid translations');
  for (const [locale, content] of Object.entries(value)) {
    try { requireValue(Intl.getCanonicalLocales(locale).length === 1, 'Invalid locale'); }
    catch { requireValue(false, `Invalid locale: ${locale}`); }
    text(content, label, 10000);
  }
}
function reference(value) {
  fields(value, ['kind', 'uri', 'label'], 'reference');
  requireValue(['identity', 'blockchain', 'archive', 'other'].includes(value.kind), 'Invalid reference kind');
  uri(value.uri);
  if (value.label !== undefined) text(value.label, 'reference label');
}
function content(value, edition = false) {
  fields(value, ['id', 'title', 'description', 'creators', 'medium', 'date', 'artistStatement', 'license', ...(edition ? ['number', 'total'] : [])], edition ? 'edition' : 'project');
  text(value.id, 'id', 300);
  if (!edition || value.title !== undefined) localized(value.title, 'title');
  for (const key of ['description', 'medium', 'artistStatement']) if (value[key] !== undefined) localized(value[key], key);
  if (!edition || value.creators !== undefined) list(value.creators, 'creators', creator => {
    fields(creator, ['name', 'role', 'references'], 'creator');
    text(creator.name, 'creator name', 300);
    if (creator.role !== undefined) text(creator.role, 'creator role', 300);
    if (creator.references !== undefined) list(creator.references, 'creator references', reference, true);
  });
  if (value.date !== undefined) {
    text(value.date, 'date', 10);
    requireValue(/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value.date), 'Date must use YYYY, YYYY-MM, or YYYY-MM-DD');
    const full = value.date.length === 4 ? `${value.date}-01-01` : value.date.length === 7 ? `${value.date}-01` : value.date;
    requireValue(Number.isFinite(Date.parse(full)) && new Date(full).toISOString().startsWith(full), 'Invalid calendar date');
  }
  if (value.license !== undefined) {
    fields(value.license, ['name', 'uri', 'text'], 'license');
    text(value.license.name, 'license name', 300);
    if (value.license.uri !== undefined) uri(value.license.uri);
    if (value.license.text !== undefined) localized(value.license.text, 'license text');
  }
  if (value.number !== undefined) positive(value.number, 'edition number', true);
  if (value.total !== undefined) positive(value.total, 'edition total', true);
  requireValue(value.number === undefined || value.total === undefined || value.number <= value.total, 'Edition number exceeds total');
}

/** References are artist-supplied claims, never verified identities or ownership. */
export function getMetadata(description) {
  const value = data(description);
  fields(value, ['schemaVersion', 'defaultLocale', 'project', 'edition', 'provenance'], 'metadata');
  requireValue(value.schemaVersion === METADATA_VERSION, 'Unsupported metadata schema version');
  if (value.defaultLocale !== undefined) {
    text(value.defaultLocale, 'default locale', 100);
    try { requireValue(Intl.getCanonicalLocales(value.defaultLocale).length === 1, 'Invalid default locale'); }
    catch { requireValue(false, 'Invalid default locale'); }
  }
  content(value.project);
  if (value.edition !== undefined) content(value.edition, true);
  if (value.provenance !== undefined) list(value.provenance, 'provenance', reference, true);
  return value;
}
export function getProvenanceReferences(description) { return getMetadata(description).provenance ?? []; }

/** Deterministic locale fallback: exact, language, default, first declared. */
export function resolveLocalizedText(value, locale, defaultLocale) {
  value = data(value);
  localized(value, 'localized text');
  if (typeof value === 'string') return value;
  const entries = Object.entries(value);
  for (const wanted of [locale, locale?.split('-')[0], defaultLocale]) {
    const match = entries.find(([key]) => key.toLowerCase() === wanted?.toLowerCase());
    if (match) return match[1];
  }
  return entries[0][1];
}
export function createMetadata(description) {
  const metadata = getMetadata(description);
  return Object.freeze({ getMetadata: () => data(metadata), getProvenanceReferences: () => data(metadata.provenance ?? []) });
}
