import test from 'node:test';
import assert from 'node:assert/strict';
import { testParameters, parameterCases } from '../src/testing.js';
import { createArtwork } from '../src/index.js';

const definitions = {
  count: { type: 'integer', min: 0, max: 10 },
  phase: { type: 'number', min: -1, max: 1 },
  enabled: { type: 'boolean', probability: 0 },
  mode: { type: 'choice', choices: [false, 0, '0'], weights: [0, 0, 1] }
};

test('seed reports are repeatable, preserve scalar types, and do not affect an artwork', () => {
  const art = createArtwork({ id: 'testing', version: '1', seed: 'live', parameters: definitions });
  const before = art.getState(), stream = art.random(), reference = art.random();
  const report = testParameters(definitions, { prefix: 'kepler', count: 200 });
  assert.deepEqual(report, testParameters(definitions, { prefix: 'kepler', count: 200 }));
  assert.equal(report.samples[0].seed, 'kepler:0'); assert.equal(report.count, 200);
  assert.equal(report.checked, false); assert.equal(report.passed, null);
  assert.deepEqual(report.summary.mode.counts, [{ value: false, count: 0 }, { value: 0, count: 0 }, { value: '0', count: 200 }]);
  assert.deepEqual(report.summary.enabled.counts, [{ value: false, count: 200 }, { value: true, count: 0 }]);
  assert.ok(report.summary.phase.min >= -1 && report.summary.phase.max <= 1);
  assert.equal(report.summary.phase.histogram.counts.reduce((a, b) => a + b), 200);
  assert.deepEqual(art.getState(), before); assert.equal(stream.next(), reference.next());
});

test('defaults and explicit pins are honored rather than bypassed to manufacture variation', () => {
  const defs = { ...definitions, count: { ...definitions.count, default: 3 } };
  const defaults = testParameters(defs, { count: 8 });
  assert.deepEqual([defaults.summary.count.min, defaults.summary.count.max, defaults.summary.count.mean], [3, 3, 3]);
  const pinned = testParameters(defs, { seeds: ['a', 'b'], overrides: { count: 0, mode: false } });
  assert.deepEqual(pinned.samples.map(s => s.values.count), [0, 0]);
  assert.equal(pinned.summary.mode.counts[0].count, 2);
  assert.deepEqual(pinned.overrides, { count: 0, mode: false });
});

test('artist checks report reproducible failures, exceptions, and reject accidental async checks', () => {
  const report = testParameters(definitions, { seeds: ['a', 'b', 'c'], check: (values, { seed }) => {
    if (seed === 'a') return true;
    if (seed === 'b') return 'Too dense for this composition';
    throw new Error('Invalid orbit');
  } });
  assert.equal(report.passed, 1);
  assert.deepEqual(report.failures.map(f => [f.seed, f.message]), [['b', 'Too dense for this composition']]);
  assert.deepEqual(report.failures[0].values, report.samples[1].values);
  assert.deepEqual(report.errors.map(e => [e.seed, e.stage, e.message]), [['c', 'check', 'Invalid orbit']]);
  assert.throws(() => testParameters(definitions, { count: 1, check: async () => true }), /synchronous/);
  assert.throws(() => testParameters(definitions, { count: 1, check: () => undefined }), /must return/);
});

test('boundary cases cover numeric endpoints and all boolean/choice values, one field at a time', () => {
  const values = { count: 4, phase: 0, enabled: false, mode: '0' };
  const cases = parameterCases(definitions, { seed: 'kepler', values });
  assert.deepEqual(cases[0].values, values);
  for (const c of cases.slice(1)) {
    assert.equal(Object.keys(values).filter(id => c.values[id] !== values[id]).length, 1);
    assert.equal(c.seed, 'kepler');
  }
  for (const [id, alternatives] of Object.entries({ count: [0, 10], phase: [-1, 1], enabled: [false, true], mode: [false, 0, '0'] }))
    for (const value of alternatives) assert.ok(cases.some(c => c.values[id] === value));
  assert.equal(new Set(cases.map(c => JSON.stringify(c.values))).size, cases.length);
});

test('invalid definitions are caught even when defaults or overrides would hide them', () => {
  for (const definition of [
    { type: 'boolean', probability: 2, default: false },
    { type: 'choice', choices: ['a'], weights: [0], default: 'a' },
    { type: 'integer', min: 0, max: 2 ** 32, default: 0 },
    { type: 'number', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, default: 0 },
    { type: 'integer', min: 0, max: 10, default: 11 }
  ]) assert.throws(() => testParameters({ value: definition }, { count: 1, overrides: { value: definition.default } }), e => e.code === 'INVALID_INPUT');
  for (const options of [{ count: 0 }, { count: 10001 }, { seeds: [] }, { seeds: [''] }, { prefix: '' }])
    assert.throws(() => testParameters(definitions, options), e => e.code === 'INVALID_INPUT');
});

test('constant ranges and extreme finite values produce usable statistics', () => {
  const report = testParameters({ fixed: { type: 'number', min: 1e308, max: 1e308 } }, { count: 20 });
  assert.equal(report.summary.fixed.mean, 1e308);
  assert.deepEqual(report.summary.fixed.histogram.counts, [20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});
