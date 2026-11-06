// 칸 정의(schema) → 입력 폼. 입력이 바뀔 때마다 onChange(note)를 부른다.
import { SCHEMAS } from './schema.js';
import { t } from './i18n.js';
import { esc } from './sheet.js';
import { richInnerHTML, serializeRich, setupRich } from './rich.js';

const autoGrow = ta => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };

function fieldHTML(f, note, lang, showLabel, sectionLabel, rich) {
  const L = k => esc(t(lang, k));
  const v = note.fields[f.id];
  const hasLabel = showLabel && f.labelKey;
  const label = hasLabel ? `<label class="flabel" id="l-${f.id}" for="f-${f.id}">${L(f.labelKey)}</label>` : '';
  const aria = hasLabel ? '' : ` aria-label="${esc(sectionLabel)}"`; // 보이는 라벨이 없으면 섹션 이름을 읽어 준다
  let input = '';
  if (f.kind === 'line') {
    input = `<input id="f-${f.id}" type="text" name="${f.id}" value="${esc(v)}" enterkeyhint="next"${aria}>`;
  } else if (f.kind === 'lines') {
    const rows = f.lines === 'auto' ? f.rows || 6 : f.lines;
    input = `<textarea id="f-${f.id}" name="${f.id}" rows="${rows}"${aria}>${esc(v)}</textarea>`;
  } else if (f.kind === 'checklist') {
    input = v.map((it, i) => {
      const item = esc(t(lang, 'form.item', { n: i + 1 }));
      return `<div class="chk-row">
        <input type="checkbox" name="${f.id}.${i}.done" aria-label="${item} ${L('form.done')}" ${it.done ? 'checked' : ''}>
        <input type="text" name="${f.id}.${i}.text" value="${esc(it.text)}" placeholder="${item}" aria-label="${item}">
      </div>`;
    }).join('');
  } else if (f.kind === 'rich') {
    const lab = hasLabel ? ` aria-labelledby="l-${f.id}"` : aria;
    input = `<div class="rich" id="f-${f.id}" contenteditable="true" role="textbox" aria-multiline="true" name="${f.id}" data-rich="${f.id}" data-testid="rich-body"${lab}>` +
      `${richInnerHTML(v, rich.imageSrc, rich.labels)}</div>
      <div class="rich-bar">
        <button type="button" class="btn primary" data-rich-add>📷 ${L('btn.addPhoto')}</button>
        <span class="page-btns"><button type="button" class="btn ghost small" data-testid="btn-add-page" data-page="add">${L('btn.addPage')}</button>
        <button type="button" class="btn ghost small" data-testid="btn-remove-page" data-page="remove">${L('btn.removePage')}</button></span>
      </div>
      <p class="guide rich-hint">${L('photo.dropHint')}</p>`;
  } else if (f.kind === 'checks') {
    input = `<div class="chips">` + f.options.map(o => `<label class="chip">
        <input type="checkbox" name="${f.id}" value="${o.id}" ${v.includes(o.id) ? 'checked' : ''}><span>${L(o.labelKey)}</span></label>`).join('') + `</div>`;
  }
  return `<div class="fld" data-field-wrap="${f.id}">${label}${input}
    <p class="over-msg" data-testid="overflow-${f.id}" hidden>⚠ ${L('warn.over')}</p></div>`;
}

// rich: 자유 노트 '내용' 편집기 옵션 { imageSrc, addFiles, onDelete, confirm, labels }
export function renderForm(note, { lang, onChange, rich }) {
  const schema = SCHEMAS[note.type];
  const form = document.createElement('form');
  form.className = 'note-form';
  form.setAttribute('data-testid', 'form');
  form.autocomplete = 'off';
  const sections = schema.sections.map(sec => {
    const showLabel = sec.fields.length > 1 || sec.fields[0].labelKey;
    return `<fieldset class="card" data-section="${sec.id}">
      <legend>${esc(t(lang, sec.labelKey))}</legend>
      ${sec.guideKey ? `<p class="guide">${esc(t(lang, sec.guideKey))}</p>` : ''}
      ${sec.fields.map(f => fieldHTML(f, note, lang, showLabel, t(lang, sec.labelKey), rich)).join('')}
    </fieldset>`;
  }).join('');
  form.innerHTML = `<div class="card date-card"><label class="flabel" for="f-date">${esc(t(lang, 'field.date'))}</label>
      <input id="f-date" type="date" name="date" value="${esc(note.date)}"></div>${sections}`;

  const current = JSON.parse(JSON.stringify(note));
  const apply = el => {
    if (el.dataset?.rich) { current.fields[el.dataset.rich] = serializeRich(el); return; }
    const name = el.name;
    if (!name) return;
    if (name === 'date') current.date = el.value;
    else if (el.type === 'checkbox' && !name.includes('.')) {
      current.fields[name] = [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);
    } else if (name.includes('.')) {
      const [id, i, key] = name.split('.');
      current.fields[id][+i][key] = key === 'done' ? el.checked : el.value;
    } else current.fields[name] = el.value;
  };
  const handler = e => {
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    apply(e.target);
    onChange(JSON.parse(JSON.stringify(current)));
  };
  form.addEventListener('input', handler);
  form.addEventListener('change', handler);
  form.addEventListener('submit', e => e.preventDefault());
  // Enter in a one-line input moves to the next field instead of submitting.
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && !e.isComposing) {
      e.preventDefault();
      const all = [...form.querySelectorAll('input:not([type=checkbox]), textarea')];
      all[all.indexOf(e.target) + 1]?.focus();
    }
  });
  requestAnimationFrame(() => form.querySelectorAll('textarea').forEach(autoGrow));
  const richEl = form.querySelector('.rich');
  if (richEl) form.richApi = setupRich(richEl, rich);
  return form;
}

export function markOverflows(form, ids) {
  const over = new Set(ids);
  for (const wrap of form.querySelectorAll('[data-field-wrap]')) {
    const on = over.has(wrap.dataset.fieldWrap);
    wrap.classList.toggle('is-over', on);
    wrap.querySelector('.over-msg').hidden = !on;
  }
}
