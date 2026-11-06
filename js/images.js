// 사진 저장소: 화면에 그릴 때 바로 쓰도록 메모리에 두고, '이 기기에 보관' 모드일 때만 IndexedDB에도 저장한다.
// 서버로는 아무것도 보내지 않는다. IndexedDB를 쓸 수 없는 환경(Node 테스트, 일부 시크릿 모드)에서는 메모리만 쓴다.
const DB = 'qtnote-images', STORE = 'images';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createImageStore(isPersistent) {
  const mem = new Map();
  let dbp = null;
  const db = () => (dbp ||= (globalThis.indexedDB ? openDB().catch(() => null) : Promise.resolve(null)));
  const run = async (mode, fn) => {
    const d = await db();
    if (!d) return undefined;
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  const quiet = p => p.catch(err => { console.warn('image store', err); });

  return {
    src: id => mem.get(id) || null,
    async put(id, dataUrl) {
      mem.set(id, dataUrl);
      if (isPersistent()) await quiet(run('readwrite', st => st.put(dataUrl, id)));
    },
    async load(ids) {
      for (const id of ids) {
        if (mem.has(id)) continue;
        const v = await quiet(run('readonly', st => st.get(id)));
        if (typeof v === 'string') mem.set(id, v);
      }
    },
    async remove(ids) {
      ids.forEach(id => mem.delete(id));
      await quiet(run('readwrite', st => { ids.forEach(id => st.delete(id)); }));
    },
    async clear() {
      mem.clear();
      await quiet(run('readwrite', st => st.clear()));
    },
    async clearPersisted() { await quiet(run('readwrite', st => st.clear())); },
    async persistAll() {
      for (const [id, v] of mem) await quiet(run('readwrite', st => st.put(v, id)));
    },
  };
}

// 고른 사진 파일 → 긴 변 maxPx 이하로 줄인 JPEG data URL (+ 높이/너비 비율)
export async function fileToPhoto(file, maxPx = 1600, quality = 0.85) {
  let src, w, h, cleanup = () => {};
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = src.width; h = src.height; cleanup = () => src.close?.();
  } catch {
    const url = URL.createObjectURL(file);
    src = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('cannot decode image'));
      im.src = url;
    });
    w = src.naturalWidth; h = src.naturalHeight; cleanup = () => URL.revokeObjectURL(url);
  }
  try {
    const k = Math.min(1, maxPx / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    const g = canvas.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, canvas.width, canvas.height); // 투명 PNG도 흰 바탕으로
    g.drawImage(src, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), ratio: canvas.height / canvas.width };
  } finally {
    cleanup();
  }
}
