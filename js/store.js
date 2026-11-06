// 저장소. 노트는 메모리에 두고, storageMode === 'local'일 때만 localStorage에 쓴다.
// 서버로는 아무것도 보내지 않는다.
export const KEYS = { notes: 'qtnote:v1:notes', settings: 'qtnote:v1:settings' };
const DEFAULT_SETTINGS = { storageMode: null, theme: 'a', lang: null };

const clone = o => JSON.parse(JSON.stringify(o));

function probe(storage) {
  if (!storage) return false;
  try {
    const k = 'qtnote:probe';
    storage.setItem(k, '1');
    storage.removeItem(k);
    return true;
  } catch { return false; }
}

export function createStore(storage) {
  const available = probe(storage);
  const mem = new Map();
  let settings = { ...DEFAULT_SETTINGS };
  const api = { available, recovered: false, lastError: null };

  const read = k => { try { return storage.getItem(k); } catch { return null; } };
  const write = (k, v) => {
    if (!available) return true;
    try { storage.setItem(k, v); return true; }
    catch (e) { api.lastError = /quota/i.test(e?.name || '') || /quota/i.test(e?.message || '') ? 'quota' : 'write'; return false; }
  };
  const remove = k => { if (available) try { storage.removeItem(k); } catch { /* ignore */ } };

  if (available) {
    try { settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(read(KEYS.settings) || '{}')) }; } catch { /* keep defaults */ }
    if (settings.storageMode === 'local') {
      const raw = read(KEYS.notes);
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr)) throw new Error('not an array');
          for (const n of arr) if (n && n.id) mem.set(n.id, n);
        } catch {
          write(KEYS.notes + ':corrupt', raw);
          remove(KEYS.notes);
          api.recovered = true;
        }
      }
    }
  }

  const effectiveMode = () => (available ? settings.storageMode || 'none' : 'none');
  const persist = () => {
    if (effectiveMode() !== 'local') return true;
    const ok = write(KEYS.notes, JSON.stringify([...mem.values()]));
    if (ok) api.lastError = null;
    return ok;
  };

  Object.assign(api, {
    effectiveMode,
    getSettings: () => ({ ...settings, storageMode: available ? settings.storageMode : 'none' }),
    setSettings(patch) {
      const prevMode = settings.storageMode;
      settings = { ...settings, ...patch };
      write(KEYS.settings, JSON.stringify(settings));
      if ('storageMode' in patch && patch.storageMode !== prevMode) {
        if (patch.storageMode === 'local') persist();
        else remove(KEYS.notes);
      }
      return api.getSettings();
    },
    listNotes() {
      return [...mem.values()].map(clone).sort((a, b) =>
        (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },
    getNote: id => (mem.has(id) ? clone(mem.get(id)) : null),
    saveNote(note) {
      let stamp = new Date().toISOString();
      // 같은 밀리초에 연속 저장해도 순서가 보장되도록 단조 증가시킨다.
      for (const n of mem.values()) if (n.updatedAt >= stamp) stamp = new Date(Date.parse(n.updatedAt) + 1).toISOString();
      const saved = { ...clone(note), updatedAt: stamp };
      mem.set(saved.id, saved);
      persist();
      return clone(saved);
    },
    deleteNote(id) { mem.delete(id); persist(); },
    clearNotes() { mem.clear(); remove(KEYS.notes); },
    countNotes: () => mem.size,
    hasUnsaved: () => effectiveMode() === 'none' && mem.size > 0,
  });
  return api;
}
