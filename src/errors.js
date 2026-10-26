export class ArtworkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ArtworkError';
    this.code = code;
  }
}

export function requireValue(condition, message, code = 'INVALID_INPUT') {
  if (!condition) throw new ArtworkError(code, message);
}

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function identifier(value) {
  requireValue(typeof value === 'string' && /^[a-zA-Z][\w.-]{0,99}$/.test(value)
    && !['__proto__', 'constructor', 'prototype'].includes(value), 'Invalid identifier');
  return value;
}

export function seedValue(seed) {
  requireValue(typeof seed === 'string' && seed.length > 0 && seed.length <= 4096, 'Seed must be a nonempty string of at most 4096 characters');
  return seed;
}

export function synchronous(value, label) {
  if (value?.then) { Promise.resolve(value).catch(() => {}); requireValue(false, `${label} must be synchronous`); }
  return value;
}
