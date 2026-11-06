import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageStore } from '../../js/images.js';
import { normalizeNote } from '../../js/schema.js';

test('image store works in memory when IndexedDB is unavailable (Node, private mode)', async () => {
  const st = createImageStore(() => true);
  await st.put('a', 'data:image/jpeg;base64,AAA');
  assert.equal(st.src('a'), 'data:image/jpeg;base64,AAA');
  await st.load(['a', 'b']);
  assert.equal(st.src('b'), null, 'unknown id stays empty');
  await st.remove(['a']);
  assert.equal(st.src('a'), null);
  await st.put('c', 'data:x');
  await st.clear();
  assert.equal(st.src('c'), null);
});

test('normalizeNote keeps only valid photo placements and the extra page count', () => {
  const n = normalizeNote({ id: 'x', type: 'free', date: '', fields: {}, extraPages: 2,
    images: [{ id: 'p1', page: 1, x: 10, y: 20, w: 80, ratio: 0.75 }, { id: '', page: 0 }, { page: 'a' }, null, { id: 'p2', page: -3, x: 'bad', y: 5, w: 500, ratio: 2 }] });
  assert.equal(n.images.length, 2);
  assert.deepEqual(n.images[0], { id: 'p1', page: 1, x: 10, y: 20, w: 80, ratio: 0.75 });
  assert.deepEqual(n.images[1], { id: 'p2', page: 0, x: 0, y: 5, w: 182, ratio: 2 }, 'clamped into the page');
  assert.equal(n.extraPages, 2);
  const m = normalizeNote({ id: 'y', type: 'free', fields: {} });
  assert.deepEqual(m.images, []);
  assert.equal(m.extraPages, 0);
});
