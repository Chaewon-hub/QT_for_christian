// 노트 3종의 칸 정의. 폼(form.js)과 A4 시트(sheet.js)가 모두 이 정의를 따른다.
// kind: line(한 줄) | lines(여러 줄, lines=숫자 또는 'auto') | checklist(체크+한 줄 × items) | checks(복수 선택)

export const NOTE_TYPES = ['devotion', 'worship', 'free'];

export const SCHEMAS = {
  devotion: {
    type: 'devotion', titleKey: 'sheet.devotion.title', subKey: 'sheet.devotion.sub', eyebrowKey: 'eyebrow.devotion',
    sections: [
      { id: 'scripture', labelKey: 'sec.scripture', guideKey: 'guide.copy', fields: [
        { id: 'scripture_ref', kind: 'line', labelKey: 'field.passage' },
        { id: 'scripture', kind: 'lines', lines: 'auto', rows: 6 },
      ] },
      { id: 'hymn', labelKey: 'sec.hymn', fields: [{ id: 'hymn', kind: 'line' }] },
      { id: 'reflect', labelKey: 'sec.reflect', guideKey: 'guide.reflect', fields: [{ id: 'reflect', kind: 'lines', lines: 3 }] },
      { id: 'thanks', labelKey: 'sec.thanks', fields: [{ id: 'thanks', kind: 'lines', lines: 3 }] },
      { id: 'repent', labelKey: 'sec.repent', fields: [{ id: 'repent', kind: 'lines', lines: 3 }] },
      { id: 'prayer', labelKey: 'sec.prayer', fields: [{ id: 'prayer', kind: 'lines', lines: 3 }] },
      { id: 'fruit', labelKey: 'sec.fruit', guideKey: 'guide.fruit', fields: [{ id: 'fruit', kind: 'lines', lines: 3 }] },
      { id: 'action', labelKey: 'sec.action', guideKey: 'guide.action', fields: [{ id: 'action', kind: 'checklist', items: 2 }] },
    ],
  },
  worship: {
    type: 'worship', titleKey: 'sheet.worship.title', subKey: 'sheet.worship.sub', eyebrowKey: 'eyebrow.worship',
    sections: [
      { id: 'info', labelKey: 'sec.info', fields: [
        { id: 'service', kind: 'checks', labelKey: 'field.service', options: [
          { id: 'sun', labelKey: 'svc.sun' }, { id: 'dawn', labelKey: 'svc.dawn' }, { id: 'wed', labelKey: 'svc.wed' },
          { id: 'fri', labelKey: 'svc.fri' }, { id: 'other', labelKey: 'svc.other' }] },
        { id: 'service_other', kind: 'line', labelKey: 'form.other' },
        { id: 'passage', kind: 'line', labelKey: 'field.passage' },
        { id: 'preacher', kind: 'line', labelKey: 'field.preacher' },
        { id: 'sermon_title', kind: 'line', labelKey: 'field.sermonTitle' },
      ] },
      { id: 'sermon', labelKey: 'sec.sermon', guideKey: 'guide.sermon', fields: [
        { id: 'sermon_keywords', kind: 'lines', lines: 'auto', rows: 3, labelKey: 'form.keywords' },
        { id: 'sermon', kind: 'lines', lines: 'auto', rows: 8, labelKey: 'form.body' },
      ] },
      { id: 'summary', labelKey: 'sec.summary', fields: [{ id: 'summary', kind: 'line' }] },
      { id: 'insight', labelKey: 'sec.insight', fields: [{ id: 'insight', kind: 'lines', lines: 3 }] },
      { id: 'apply', labelKey: 'sec.apply', guideKey: 'guide.apply', fields: [{ id: 'apply', kind: 'checklist', items: 3 }] },
      { id: 'prayer', labelKey: 'sec.prayer', fields: [
        { id: 'prayer_me', kind: 'lines', lines: 2, labelKey: 'pray.me' },
        { id: 'prayer_others', kind: 'lines', lines: 2, labelKey: 'pray.others' },
        { id: 'prayer_inter', kind: 'lines', lines: 2, labelKey: 'pray.inter' },
      ] },
    ],
  },
  free: {
    type: 'free', titleKey: 'sheet.free.title', subKey: 'sheet.free.sub', eyebrowKey: 'eyebrow.free',
    sections: [
      { id: 'main', labelKey: 'sec.freeMain', fields: [
        { id: 'title', kind: 'line', labelKey: 'field.title' },
        { id: 'body', kind: 'lines', lines: 'auto', rows: 12, labelKey: 'form.body' },
      ] },
    ],
  },
};

export const fieldList = type => SCHEMAS[type].sections.flatMap(s => s.fields);

function emptyValue(f) {
  if (f.kind === 'checklist') return Array.from({ length: f.items }, () => ({ text: '', done: false }));
  if (f.kind === 'checks') return [];
  return '';
}

export function emptyFields(type) {
  return Object.fromEntries(fieldList(type).map(f => [f.id, emptyValue(f)]));
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function todayISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newNote(type, date = todayISO()) {
  if (!SCHEMAS[type]) throw new Error(`unknown note type: ${type}`);
  return { id: makeId(), type, date, updatedAt: new Date().toISOString(), fields: emptyFields(type) };
}

// 오래된 버전으로 저장된 노트에 새 칸이 생겨도 깨지지 않도록 기본값으로 채운다.
export function normalizeNote(note) {
  const fields = { ...emptyFields(note.type), ...(note.fields || {}) };
  for (const f of fieldList(note.type)) {
    if (f.kind === 'checklist') {
      const arr = Array.isArray(fields[f.id]) ? fields[f.id] : [];
      fields[f.id] = Array.from({ length: f.items }, (_, i) => ({ text: String(arr[i]?.text ?? ''), done: !!arr[i]?.done }));
    } else if (f.kind === 'checks') {
      fields[f.id] = Array.isArray(fields[f.id]) ? fields[f.id].filter(v => f.options.some(o => o.id === v)) : [];
    } else fields[f.id] = String(fields[f.id] ?? '');
  }
  return { ...note, fields };
}

export function summarize(note, max = 40) {
  for (const f of fieldList(note.type)) {
    const v = note.fields?.[f.id];
    let s = '';
    if (typeof v === 'string') s = v;
    else if (f.kind === 'checklist' && Array.isArray(v)) s = v.map(x => x.text).filter(Boolean).join(' / ');
    s = s.replace(/\s+/g, ' ').trim();
    if (s) return s.length > max ? s.slice(0, max) + '…' : s;
  }
  return '';
}

// 날짜 문자열 → 요일 번호 (0=월 … 6=일). 잘못된 날짜면 -1.
export function weekdayIndex(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return -1;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(d)) return -1;
  return (d.getDay() + 6) % 7;
}
