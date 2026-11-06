import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT, LANGS, t, detectLang } from '../../js/i18n.js';
import { NOTE_TYPES, SCHEMAS, newNote, emptyFields, fieldList, summarize } from '../../js/schema.js';
import { pdfFileName } from '../../js/pdf.js';
import { snapCut } from '../../js/sheet.js';

test('snapCut splits long text at a natural boundary for the next page', () => {
  assert.deepEqual(snapCut('hello world foo', 13), ['hello world', 'foo']);
  assert.deepEqual(snapCut('a\nb', 2), ['a', 'b']);
  assert.deepEqual(snapCut('가나다라마바사', 3), ['가나다', '라마바사'], 'no spaces (CJK): cut by character');
  assert.deepEqual(snapCut('abc', 5), ['abc', '']);
  const [h, t] = snapCut('주님께서 오늘도 함께하심을 감사드립니다', 12); // 12글자째는 '함께하' 중간 → 단어 앞에서 자른다
  assert.equal(h, '주님께서 오늘도');
  assert.equal(t, '함께하심을 감사드립니다');
});

test('lines fields declare a minimum number of lines', () => {
  for (const type of NOTE_TYPES) for (const f of fieldList(type))
    if (f.kind === 'lines') assert.ok((f.lines === 'auto' ? f.min : f.lines) >= 1, `${type}.${f.id}`);
});

test('all four languages have exactly the same keys', () => {
  assert.deepEqual(LANGS, ['ko', 'ja', 'en', 'zh']);
  const base = Object.keys(DICT.ko).sort();
  for (const l of LANGS) assert.deepEqual(Object.keys(DICT[l]).sort(), base, `keys of ${l}`);
});

test('no empty translations', () => {
  for (const l of LANGS) for (const [k, v] of Object.entries(DICT[l])) {
    assert.ok(Array.isArray(v) ? v.length === 7 : String(v).trim().length > 0, `${l}.${k}`);
  }
});

test('t() substitutes variables and falls back to Korean, then to the key', () => {
  assert.equal(t('ko', 'confirm.clear', { n: 3 }).includes('3'), true);
  assert.equal(t('xx', 'btn.pdf'), DICT.ko['btn.pdf']);
  assert.equal(t('ko', 'no.such.key'), 'no.such.key');
});

test('detectLang maps browser languages', () => {
  assert.equal(detectLang(['ja-JP', 'en']), 'ja');
  assert.equal(detectLang(['zh-TW']), 'zh');
  assert.equal(detectLang(['en-US']), 'en');
  assert.equal(detectLang(['fr-FR']), 'ko');
  assert.equal(detectLang([]), 'ko');
});

test('schemas: three types, unique field ids, known kinds, translated labels', () => {
  assert.deepEqual(NOTE_TYPES, ['devotion', 'worship', 'free']);
  for (const type of NOTE_TYPES) {
    const s = SCHEMAS[type];
    for (const k of [s.titleKey, s.subKey, s.eyebrowKey]) assert.ok(DICT.ko[k], `${type} ${k}`);
    const ids = fieldList(type).map(f => f.id);
    assert.equal(new Set(ids).size, ids.length, `unique ids in ${type}`);
    for (const sec of s.sections) {
      assert.ok(DICT.ko[sec.labelKey], `label ${sec.labelKey}`);
      if (sec.guideKey) assert.ok(DICT.ko[sec.guideKey], `guide ${sec.guideKey}`);
      for (const f of sec.fields) {
        assert.ok(['line', 'lines', 'checklist', 'checks'].includes(f.kind), `${f.id} kind`);
        if (f.labelKey) assert.ok(DICT.ko[f.labelKey], `field label ${f.labelKey}`);
        if (f.kind === 'lines') assert.ok(f.lines === 'auto' || f.lines > 0);
        if (f.kind === 'checklist') assert.ok(f.items > 0);
        if (f.kind === 'checks') for (const o of f.options) assert.ok(DICT.ko[o.labelKey], o.labelKey);
      }
    }
  }
});

test('emptyFields gives the right empty value for each kind', () => {
  const d = emptyFields('devotion');
  assert.equal(d.thanks, '');
  assert.deepEqual(d.action, [{ text: '', done: false }, { text: '', done: false }]);
  const w = emptyFields('worship');
  assert.deepEqual(w.service, []);
  assert.equal(w.apply.length, 3);
});

test('newNote creates a dated note with an id', () => {
  const n = newNote('free', '2026-11-08');
  assert.equal(n.type, 'free');
  assert.equal(n.date, '2026-11-08');
  assert.ok(n.id && n.id.length >= 8);
  assert.notEqual(newNote('free', '2026-11-08').id, n.id);
});

test('summarize picks the first written text, shortened', () => {
  const n = newNote('devotion', '2026-11-08');
  assert.equal(summarize(n), '');
  n.fields.reflect = '주님은 포도나무, 우리는 가지. '.repeat(5);
  const s = summarize(n);
  assert.ok(s.startsWith('주님은 포도나무'));
  assert.ok(s.length <= 41);
});

test('pdfFileName uses type and date in ASCII', () => {
  assert.equal(pdfFileName({ type: 'devotion', date: '2026-11-08' }), 'QTNote_devotion_2026-11-08.pdf');
  assert.equal(pdfFileName({ type: 'worship', date: '' }), 'QTNote_worship.pdf');
});
