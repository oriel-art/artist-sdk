import { requireValue } from './errors.js';

export const RANDOM_VERSION = 'fnv1a-sfc32-v1';

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A reproducible artistic PRNG, not cryptographic or mint-time randomness. */
export function createRandom(seed, stream = 'main') {
  requireValue(typeof seed === 'string' && seed.length > 0 && seed.length <= 4096, 'Seed must be a nonempty string of at most 4096 characters');
  requireValue(typeof stream === 'string', 'Stream must be a string');
  const key = JSON.stringify([seed, stream]);
  let [a, b, c, d] = [0, 1, 2, 3].map(n => hash(`${key}:${n}`));
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = ((a + b | 0) + d | 0);
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11) + t | 0;
    return (t >>> 0) / 4294967296;
  };
  const api = {
    next,
    float(min = 0, max = 1) {
      requireValue(Number.isFinite(min) && Number.isFinite(max) && max >= min && Number.isFinite(max - min), 'Invalid float range');
      return min + next() * (max - min);
    },
    int(min, max) {
      requireValue(Number.isSafeInteger(min) && Number.isSafeInteger(max) && max >= min && max - min < 2 ** 32, 'Invalid inclusive integer range');
      return min + Math.floor(next() * (max - min + 1));
    },
    bool(probability = 0.5) {
      requireValue(Number.isFinite(probability) && probability >= 0 && probability <= 1, 'Probability must be between 0 and 1');
      return next() < probability;
    },
    choice(values, weights) {
      requireValue(Array.isArray(values) && values.length > 0, 'Choices must not be empty');
      if (weights === undefined) return values[api.int(0, values.length - 1)];
      requireValue(Array.isArray(weights) && weights.length === values.length
        && weights.every(w => Number.isFinite(w) && w >= 0), 'Invalid choice weights');
      const total = weights.reduce((sum, w) => sum + w, 0);
      requireValue(total > 0 && Number.isFinite(total), 'Weights must have a finite positive sum');
      let pick = next() * total;
      for (let i = 0; i < weights.length; i++) {
        if (pick < weights[i]) return values[i];
        pick -= weights[i];
      }
      return values[weights.findLastIndex(w => w > 0)];
    },
    normal(mean = 0, deviation = 1) {
      requireValue(Number.isFinite(mean) && Number.isFinite(deviation) && deviation >= 0, 'Invalid normal distribution');
      return mean + deviation * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
    },
    fork(name) {
      requireValue(typeof name === 'string', 'Stream name must be a string');
      return createRandom(seed, JSON.stringify([stream, name]));
    }
  };
  return Object.freeze(api);
}
