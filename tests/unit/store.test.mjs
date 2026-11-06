import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEYS } from '../../js/store.js';

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
class DeniedStorage {
  getItem() { throw new Error('SecurityError'); }
  setItem() { throw new Error('SecurityError'); }
  removeItem() { throw new Error('SecurityError'); }
}
class QuotaStorage extends FakeStorage {
  setItem(k, v) {
    if (k === KEYS.notes) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
    super.setItem(k, v);
  }
}
const note = (id, date, extra = {}) => ({ id, type: 'devotion', date, updatedAt: '2026-01-01T00:00:00.000Z', fields: { thanks: 'x' }, ...extra });

test('unavailable storage falls back to "none" mode', () => {
  for (const s of [null, new DeniedStorage()]) {
    const st = createStore(s);
    assert.equal(st.available, false);
    assert.equal(st.effectiveMode(), 'none');
    st.saveNote(note('a', '2026-11-08'));
    assert.equal(st.listNotes().length, 1, 'still works in memory');
  }
});

test('fresh storage has no mode chosen yet and default settings', () => {
  const st = createStore(new FakeStorage());
  assert.equal(st.available, true);
  const s = st.getSettings();
  assert.equal(s.storageMode, null);
  assert.equal(s.theme, 'a');
  assert.equal(s.lang, null);
});

test('settings persist across instances', () => {
  const fs = new FakeStorage();
  createStore(fs).setSettings({ theme: 'b', lang: 'ja', storageMode: 'local' });
  const s = createStore(fs).getSettings();
  assert.deepEqual([s.theme, s.lang, s.storageMode], ['b', 'ja', 'local']);
});

test('local mode persists notes across instances', () => {
  const fs = new FakeStorage();
  const st = createStore(fs);
  st.setSettings({ storageMode: 'local' });
  const saved = st.saveNote(note('a', '2026-11-08'));
  assert.ok(saved.updatedAt > '2026-01-01', 'updatedAt refreshed');
  const st2 = createStore(fs);
  assert.equal(st2.listNotes().length, 1);
  assert.equal(st2.getNote('a').fields.thanks, 'x');
});

test('none mode never writes notes to storage', () => {
  const fs = new FakeStorage();
  const st = createStore(fs);
  st.setSettings({ storageMode: 'none' });
  st.saveNote(note('a', '2026-11-08'));
  assert.equal(fs.getItem(KEYS.notes), null);
  assert.equal(st.listNotes().length, 1, 'kept in memory for this session');
  assert.equal(createStore(fs).listNotes().length, 0);
});

test('switching local → none deletes notes stored on the device', () => {
  const fs = new FakeStorage();
  const st = createStore(fs);
  st.setSettings({ storageMode: 'local' });
  st.saveNote(note('a', '2026-11-08'));
  assert.notEqual(fs.getItem(KEYS.notes), null);
  st.setSettings({ storageMode: 'none' });
  assert.equal(fs.getItem(KEYS.notes), null);
});

test('switching none → local persists the notes written in this session', () => {
  const fs = new FakeStorage();
  const st = createStore(fs);
  st.setSettings({ storageMode: 'none' });
  st.saveNote(note('a', '2026-11-08'));
  st.setSettings({ storageMode: 'local' });
  assert.equal(createStore(fs).listNotes().length, 1);
});

test('corrupted data is backed up and the app starts fresh', () => {
  const fs = new FakeStorage();
  fs.setItem(KEYS.settings, JSON.stringify({ storageMode: 'local' }));
  fs.setItem(KEYS.notes, '{broken');
  const st = createStore(fs);
  assert.equal(st.recovered, true);
  assert.equal(st.listNotes().length, 0);
  assert.equal(fs.getItem(KEYS.notes + ':corrupt'), '{broken');
});

test('quota errors are reported without throwing', () => {
  const st = createStore(new QuotaStorage());
  st.setSettings({ storageMode: 'local' });
  assert.doesNotThrow(() => st.saveNote(note('a', '2026-11-08')));
  assert.equal(st.lastError, 'quota');
  assert.equal(st.listNotes().length, 1);
});

test('notes are listed newest date first, then most recently updated', () => {
  const st = createStore(new FakeStorage());
  st.setSettings({ storageMode: 'local' });
  st.saveNote(note('old', '2026-11-01'));
  st.saveNote(note('new', '2026-11-08'));
  st.saveNote(note('new2', '2026-11-08'));
  assert.deepEqual(st.listNotes().map(n => n.id), ['new2', 'new', 'old']);
});

test('delete and clear', () => {
  const fs = new FakeStorage();
  const st = createStore(fs);
  st.setSettings({ storageMode: 'local' });
  st.saveNote(note('a', '2026-11-01'));
  st.saveNote(note('b', '2026-11-02'));
  st.deleteNote('a');
  assert.deepEqual(createStore(fs).listNotes().map(n => n.id), ['b']);
  assert.equal(st.countNotes(), 1);
  st.clearNotes();
  assert.equal(createStore(fs).listNotes().length, 0);
});

test('returned notes are copies (callers cannot mutate the store by accident)', () => {
  const st = createStore(new FakeStorage());
  st.saveNote(note('a', '2026-11-01'));
  st.getNote('a').fields.thanks = 'changed';
  assert.equal(st.getNote('a').fields.thanks, 'x');
});
