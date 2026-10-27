import { requireValue, object } from './errors.js';

// Bounded, data-only snapshots. Never call toJSON, accessors, or artwork hooks.
export function data(value, maxBytes = 32768) {
  let nodes = 0, bytes = 0;
  const charge = count => {
    bytes += count;
    requireValue(bytes <= maxBytes, 'Description exceeds byte limit', 'LIMIT');
  };
  // Count the UTF-8 bytes of a JSON string without allocating an encoded copy.
  // JSON escapes lone surrogates and control characters; pairs encode as UTF-8.
  const string = value => {
    requireValue(value.length + 2 <= maxBytes - bytes, 'Description exceeds byte limit', 'LIMIT');
    charge(2);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code === 34 || code === 92) charge(2);
      else if (code < 32) charge([8, 9, 10, 12, 13].includes(code) ? 2 : 6);
      else if (code < 128) charge(1);
      else if (code < 2048) charge(2);
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { charge(4); i++; }
        else charge(6);
      } else charge(code >= 0xdc00 && code <= 0xdfff ? 6 : 3);
    }
  };
  const seen = new Set();
  const visit = (v, depth) => {
    requireValue(++nodes <= 5000 && depth <= 20, 'Description exceeds structural limits', 'LIMIT');
    if (typeof v === 'string') { string(v); return v; }
    if (v === null || typeof v === 'boolean') { charge(v === null || v === true ? 4 : 5); return v; }
    if (typeof v === 'number') {
      requireValue(Number.isFinite(v), 'Numbers must be finite'); charge(String(v).length); return v;
    }
    requireValue(Array.isArray(v) || object(v), 'Expected JSON data');
    requireValue(!seen.has(v), 'Circular data is not supported');
    seen.add(v);
    const array = Array.isArray(v);
    if (array) requireValue(v.length <= 5000 - nodes, 'Description exceeds structural limits', 'LIMIT');
    charge(2); // Braces or brackets.
    const result = array ? [] : {};
    let count = 0;
    for (const key of Reflect.ownKeys(v)) {
      if (array && key === 'length') continue;
      if (count++) charge(1); // Comma.
      requireValue(typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key), 'Unsafe data key');
      if (array) requireValue(/^(0|[1-9]\d*)$/.test(key) && Number(key) < v.length, 'Invalid array key');
      else { string(key); charge(1); } // Key and colon, before reading its value.
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      requireValue(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'Accessors and hidden properties are not supported');
      result[key] = visit(descriptor.value, depth + 1);
    }
    if (array) requireValue(count === v.length, 'Sparse arrays are not supported');
    seen.delete(v);
    return result;
  };
  return visit(value, 0);
}

export function fields(value, allowed, label) {
  requireValue(object(value), `${label} must be an object`);
  for (const key of Object.keys(value)) requireValue(allowed.includes(key), `Unknown ${label} field: ${key}`);
}
export function text(value, label, max = 2000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `Invalid ${label}`);
}
export function positive(value, label, integer = false) {
  requireValue(Number.isFinite(value) && value > 0 && (!integer || Number.isSafeInteger(value)), `Invalid ${label}`);
}
export function list(value, label, check, allowEmpty = false) {
  requireValue(Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 100, `Invalid ${label}`);
  value.forEach(check);
}
export function range(value, label, integer = false) {
  fields(value, ['min', 'max'], label);
  positive(value.min, label, integer); positive(value.max, label, integer);
  requireValue(value.min <= value.max, `Invalid ${label} range`);
}
export function uri(value) {
  text(value, 'reference URI', 4000);
  let parsed;
  try { parsed = new URL(value); } catch { requireValue(false, 'Invalid reference URI'); }
  requireValue(['https:', 'http:', 'ipfs:', 'ar:', 'did:', 'urn:'].includes(parsed.protocol)
    && !parsed.username && !parsed.password, 'Unsupported reference URI');
}
