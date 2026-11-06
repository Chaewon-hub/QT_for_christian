import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageStore } from '../../js/images.js';
import { normalizeNote } from '../../js/schema.js';
import { parseBody, photoToken, photoIdsOf } from '../../js/richbody.js';

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

test('photo lines: token format, parsing between text, clamping, invalid tokens stay text', () => {
  assert.equal(photoToken({ id: 'ph1', w: 60.4, ratio: 0.75 }), '[[photo:ph1:60:0.7500]]');
  const body = 'a\nb\n[[photo:ph1:60:0.7500]]\n\nc\n[[photo:ph2:5:2]]';
  assert.deepEqual(parseBody(body), [
    { type: 'text', text: 'a\nb' },
    { type: 'photo', id: 'ph1', w: 60, ratio: 0.75, x: 50 },
    { type: 'text', text: '\nc' },
    { type: 'photo', id: 'ph2', w: 20, ratio: 2, x: 50 },
  ]);
  assert.deepEqual(parseBody('[[photo:bad:50:0]]'), [{ type: 'text', text: '[[photo:bad:50:0]]' }], 'ratio 0 is not a photo');
  assert.deepEqual(parseBody(''), [{ type: 'text', text: '' }]);
  assert.deepEqual(photoIdsOf(body), ['ph1', 'ph2']);
  assert.deepEqual(parseBody('[[photo:p:150:1]]')[0].w, 100, 'width is at most 100%');
});

test('photo lines keep a horizontal position (0 left … 50 centre … 100 right); centre is the default and is not written', () => {
  assert.equal(photoToken({ id: 'p', w: 40, ratio: 1, x: 0 }), '[[photo:p:40:1.0000:0]]');
  assert.equal(photoToken({ id: 'p', w: 40, ratio: 1, x: 100 }), '[[photo:p:40:1.0000:100]]');
  assert.equal(photoToken({ id: 'p', w: 40, ratio: 1, x: 50 }), '[[photo:p:40:1.0000]]');
  assert.equal(photoToken({ id: 'p', w: 40, ratio: 1 }), '[[photo:p:40:1.0000]]', 'v1.3 photos (no x) stay centred');
  assert.equal(photoToken({ id: 'p', w: 40, ratio: 1, x: 37.6 }), '[[photo:p:40:1.0000:38]]');
  assert.equal(parseBody('[[photo:p:40:1.0000:0]]')[0].x, 0);
  assert.equal(parseBody('[[photo:p:40:1.0000:250]]')[0].x, 100, 'clamped');
  assert.equal(parseBody('[[photo:p:40:1.0000]]')[0].x, 50);
  const t = 'a\n[[photo:p:40:1.0000:12]]\nb';
  assert.equal(parseBody(t).map(s => (s.type === 'photo' ? photoToken(s) : s.text)).join('\n'), t, 'round trip');
});

test('normalizeNote moves v1.2 page-placed photos into the body as photo lines', () => {
  const n = normalizeNote({ id: 'x', type: 'free', fields: { body: '첫 줄' }, extraPages: 2,
    images: [{ id: 'p1', page: 1, x: 10, y: 20, w: 91, ratio: 0.75 }, { id: '' }, null] });
  assert.equal(n.fields.body, '첫 줄\n[[photo:p1:50:0.7500]]');
  assert.equal('images' in n, false);
  assert.equal(n.extraPages, 2);
  const m = normalizeNote({ id: 'y', type: 'free', fields: {} });
  assert.equal(m.fields.body, '');
  assert.equal(m.extraPages, 0);
});
