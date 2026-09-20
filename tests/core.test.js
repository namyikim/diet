const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareRevision,
  legacyFragmentPath,
  mergeData,
  restoreSections,
  sanitizeData,
  serializeData,
  updateExercise,
  updateMeal,
  validatePassphrase,
} = require('../core.js');

test('legacy day timestamps become per-meal revisions, including deletion tombstones', () => {
  const data = sanitizeData({
    '2026-09-18': { t: 1_700_000_000_000, b: [{ k: 350, f: '토스트' }] },
  });

  assert.deepEqual(data['2026-09-18'].r, {
    b: { n: 1_700_000_000_000, d: 'legacy' },
    l: { n: 1_700_000_000_000, d: 'legacy' },
    d: { n: 1_700_000_000_000, d: 'legacy' },
    s: { n: 1_700_000_000_000, d: 'legacy' },
    x: { n: 0, d: 'legacy' },
  });
});

test('concurrent edits to different meals are both preserved', () => {
  const phone = sanitizeData({
    '2026-09-18': {
      r: {
        b: { n: 11, d: 'phone' },
        l: { n: 10, d: 'seed' },
        d: { n: 10, d: 'seed' },
        s: { n: 10, d: 'seed' },
      },
      b: [{ k: 500, f: '아침' }],
      d: [{ k: 400, f: '기존 저녁' }],
    },
  });
  const pc = sanitizeData({
    '2026-09-18': {
      r: {
        b: { n: 10, d: 'seed' },
        l: { n: 10, d: 'seed' },
        d: { n: 11, d: 'pc' },
        s: { n: 10, d: 'seed' },
      },
      b: [{ k: 300, f: '기존 아침' }],
      d: [{ k: 700, f: '저녁' }],
    },
  });

  const merged = mergeData(phone, pc)['2026-09-18'];

  assert.deepEqual(merged.b, [{ k: 500, f: '아침' }]);
  assert.deepEqual(merged.d, [{ k: 700, f: '저녁' }]);
});

test('a newer meal deletion does not erase another meal', () => {
  const local = sanitizeData({
    '2026-09-18': {
      r: {
        b: { n: 12, d: 'phone' },
        l: { n: 10, d: 'seed' },
        d: { n: 10, d: 'seed' },
        s: { n: 10, d: 'seed' },
      },
    },
  });
  const remote = sanitizeData({
    '2026-09-18': {
      r: {
        b: { n: 11, d: 'pc' },
        l: { n: 10, d: 'seed' },
        d: { n: 13, d: 'pc' },
        s: { n: 10, d: 'seed' },
      },
      b: [{ k: 350, f: '삭제 전 아침' }],
      d: [{ k: 700, f: '저녁' }],
    },
  });

  const merged = mergeData(local, remote)['2026-09-18'];

  assert.equal(merged.b, undefined);
  assert.deepEqual(merged.d, [{ k: 700, f: '저녁' }]);
  assert.deepEqual(merged.r.b, { n: 12, d: 'phone' });
});

test('revision ties are deterministic and do not depend on wall-clock time', () => {
  assert.equal(compareRevision({ n: 9, d: 'phone' }, { n: 9, d: 'pc' }), 1);
  assert.equal(compareRevision({ n: 9, d: 'pc' }, { n: 9, d: 'phone' }), -1);
  assert.equal(compareRevision({ n: 10, d: 'a' }, { n: 9, d: 'z' }), 1);
});

test('updating one meal advances only that meal revision', () => {
  const original = sanitizeData({
    '2026-09-18': {
      r: {
        b: { n: 20, d: 'seed' },
        l: { n: 20, d: 'seed' },
        d: { n: 20, d: 'seed' },
        s: { n: 20, d: 'seed' },
      },
      b: [{ k: 300, f: '아침' }],
      d: [{ k: 500, f: '저녁' }],
    },
  });

  const updated = updateMeal(original, '2026-09-18', 'b', [{ k: 450, f: '새 아침' }], 'phone');

  assert.deepEqual(updated['2026-09-18'].b, [{ k: 450, f: '새 아침' }]);
  assert.deepEqual(updated['2026-09-18'].d, [{ k: 500, f: '저녁' }]);
  assert.deepEqual(updated['2026-09-18'].r.b, { n: 21, d: 'phone' });
  assert.deepEqual(updated['2026-09-18'].r.d, { n: 20, d: 'seed' });
});

test('new connection passphrases require at least 16 characters', () => {
  assert.equal(validatePassphrase('short-pass'), false);
  assert.equal(validatePassphrase('긴문장도열여섯글자미만'), false);
  assert.equal(validatePassphrase('correct horse battery staple'), true);
});

test('serialization keeps revisions and uses stable date and meal ordering', () => {
  const text = serializeData({
    '2026-09-19': {
      r: {
        s: { n: 4, d: 'phone' },
        d: { n: 3, d: 'phone' },
        l: { n: 2, d: 'phone' },
        b: { n: 1, d: 'phone' },
      },
      x: { m: 45, km: 5.2 },
    },
    '2026-09-18': { t: 10, b: [{ k: 350, f: '토스트' }] },
  });

  assert.equal(text, [
    '{',
    '"2026-09-18":{"t":10,"r":{"b":{"n":10,"d":"legacy"},"l":{"n":10,"d":"legacy"},"d":{"n":10,"d":"legacy"},"s":{"n":10,"d":"legacy"},"x":{"n":0,"d":"legacy"}},"b":[{"k":350,"f":"토스트"}]},',
    '"2026-09-19":{"t":4,"r":{"b":{"n":1,"d":"phone"},"l":{"n":2,"d":"phone"},"d":{"n":3,"d":"phone"},"s":{"n":4,"d":"phone"},"x":{"n":0,"d":"legacy"}},"x":{"m":45,"km":5.2}}',
    '}',
    '',
  ].join('\n'));
});

test('cancelling restores only meals touched by the editor', () => {
  const opened = sanitizeData({
    '2026-09-18': {
      t: 10,
      b: [{ k: 300, f: '기존 아침' }],
      d: [{ k: 400, f: '기존 저녁' }],
    },
  });
  let current = updateMeal(opened, '2026-09-18', 'b', [{ k: 500, f: '수정한 아침' }], 'phone');
  const remote = updateMeal(opened, '2026-09-18', 'd', [{ k: 700, f: '원격 저녁' }], 'pc');
  current = mergeData(current, remote);

  const restored = restoreSections(current, '2026-09-18', opened['2026-09-18'], ['b'], 'phone')['2026-09-18'];

  assert.deepEqual(restored.b, [{ k: 300, f: '기존 아침' }]);
  assert.deepEqual(restored.d, [{ k: 700, f: '원격 저녁' }]);
});

test('exercise merges on its own, next to the meals of the same day', () => {
  const phone = updateExercise(sanitizeData({}), '2026-09-18', { m: 40, km: 5.25 }, 'phone');
  const pc = updateMeal(sanitizeData({}), '2026-09-18', 'b', [{ k: 300, f: '아침' }], 'pc');

  const merged = mergeData(phone, pc)['2026-09-18'];

  assert.deepEqual(merged.x, { m: 40, km: 5.25 });
  assert.deepEqual(merged.b, [{ k: 300, f: '아침' }]);
});

test('exercise minutes and distance are clamped, and an empty entry is removed', () => {
  const walked = updateExercise(sanitizeData({}), '2026-09-18', { m: '95', km: '3.456' }, 'phone');
  assert.deepEqual(walked['2026-09-18'].x, { m: 95, km: 3.46 });

  const capped = updateExercise(walked, '2026-09-18', { m: 5000, km: -2 }, 'phone');
  assert.deepEqual(capped['2026-09-18'].x, { m: 1440, km: 0 });

  const cleared = updateExercise(capped, '2026-09-18', { m: 0, km: 0 }, 'phone');
  assert.equal(cleared['2026-09-18'].x, undefined);
  assert.deepEqual(cleared['2026-09-18'].r.x, { n: 3, d: 'phone' });
});

test('cancelling restores a touched exercise entry', () => {
  const opened = updateExercise(sanitizeData({}), '2026-09-18', { m: 30, km: 3 }, 'phone');
  const edited = updateExercise(opened, '2026-09-18', { m: 90, km: 9 }, 'phone');

  const restored = restoreSections(edited, '2026-09-18', opened['2026-09-18'], ['x'], 'phone')['2026-09-18'];

  assert.deepEqual(restored.x, { m: 30, km: 3 });
});

test('legacy token fragments are scrubbed without decoding them', () => {
  assert.equal(legacyFragmentPath('#connect=raw-token-payload', '/diet/', '?mode=compact'), '/diet/?mode=compact');
  assert.equal(legacyFragmentPath('#other=value', '/diet/', ''), null);
  assert.equal(legacyFragmentPath('', '/diet/', ''), null);
});
