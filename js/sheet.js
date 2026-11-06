// 노트 내용 → A4 시트(DOM). 미리보기·인쇄·PDF가 모두 이 결과를 쓴다.
import { SCHEMAS, weekdayIndex } from './schema.js';
import { t, HTML_LANG } from './i18n.js';
import { sheepSVG, palette } from './sheep.js';

export const LINE_MM = 8;
const EN_TAG = { reflect: 'Reflect', thanks: 'Thanks', repent: 'Repent', prayer: 'Prayer', fruit: 'Fruit', action: 'Action',
  sermon: 'Sermon', insight: 'Insight', apply: 'Apply' };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

const icon = (kind, ink) => {
  const p = kind === 'note'
    ? '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
    : '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>';
  return `<svg viewBox="0 0 24 24" width="24" height="24"><g fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</g></svg>`;
};

function ctx(note, lang) {
  const L = k => esc(t(lang, k));
  const F = id => note.fields?.[id];
  return { L, F, lang };
}

const sh = (c, num, labelKey, { guideKey, tag, right = '' } = {}) =>
  `<div class="sh"><span class="num">${num}</span><span class="ttl">${c.L(labelKey)}</span>` +
  (guideKey ? `<span class="guide">${c.L(guideKey)}</span>` : '') +
  (right || (tag ? `<span class="en">${tag}</span>` : '')) + `</div>`;

const lines = (id, n, text, cls = '') =>
  `<div class="lines ${cls}" data-lines="${n}">${n === 'auto' ? '' : '<div class="ln"></div>'.repeat(n)}` +
  `<div class="txt" data-field="${id}">${esc(text)}</div></div>`;

const checklist = (id, items) =>
  `<div class="lines rows" data-field="${id}">` +
  items.map(it => `<div class="ln chk${it.done ? ' done' : ''}"><span class="one">${esc(it.text)}</span></div>`).join('') + `</div>`;

const section = (inner, cls = '') => `<section class="${cls}">${inner}</section>`;

function header(note, c, theme, print) {
  const s = SCHEMAS[note.type];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(note.date || '');
  const wd = weekdayIndex(note.date);
  const days = t(c.lang, 'days').map((d, i) =>
    `<span data-day="${i}" class="${i === 6 ? 'sun' : ''}${i === wd ? ' on' : ''}">${esc(d)}</span>`).join('');
  return `<header>
    <div class="head-text">
      <div class="eyebrow">${c.L(s.eyebrowKey)} <b>&nbsp;·&nbsp; No. ______</b></div>
      <h1>${c.L(s.titleKey)}</h1>
      <p class="sub">${c.L(s.subKey)}</p>
    </div>
    <div class="sheep">${sheepSVG(theme, { print })}</div>
    <div class="date">
      <div class="lbl">DATE</div>
      <div class="ymd"><span class="f y">${m ? m[1] : '20'}</span>.<span class="f m">${m ? +m[2] : ''}</span>.<span class="f d">${m ? +m[3] : ''}</span></div>
      <div class="days">${days}</div>
    </div>
  </header>`;
}

function devotion(c, ink) {
  return [
    section(sh(c, '01', 'sec.scripture', { guideKey: 'guide.copy',
      right: `<span class="field">${c.L('field.passage')} <i class="one" data-field="scripture_ref">${esc(c.F('scripture_ref'))}</i></span>` }) +
      lines('scripture', 'auto', c.F('scripture')), 'fill'),
    `<div class="strip"><div class="lab">${icon('note', ink)}${c.L('sec.hymn')} <small>HYMN</small></div><div class="bar one" data-field="hymn">${esc(c.F('hymn'))}</div></div>`,
    section(sh(c, '02', 'sec.reflect', { guideKey: 'guide.reflect', tag: EN_TAG.reflect }) + lines('reflect', 3, c.F('reflect'))),
    `<div class="row2">` +
      section(sh(c, '03', 'sec.thanks', { tag: EN_TAG.thanks }) + lines('thanks', 3, c.F('thanks'))) +
      section(sh(c, '04', 'sec.repent', { tag: EN_TAG.repent }) + lines('repent', 3, c.F('repent'))) + `</div>`,
    `<div class="row2">` +
      section(sh(c, '05', 'sec.prayer', { tag: EN_TAG.prayer }) + lines('prayer', 3, c.F('prayer'))) +
      section(sh(c, '06', 'sec.fruit', { guideKey: 'guide.fruit', tag: EN_TAG.fruit }) + lines('fruit', 3, c.F('fruit'))) + `</div>`,
    section(sh(c, '07', 'sec.action', { guideKey: 'guide.action', tag: EN_TAG.action }) + checklist('action', c.F('action') || [])),
  ].join('');
}

function worship(c, ink) {
  const sel = new Set(c.F('service') || []);
  const opts = SCHEMAS.worship.sections[0].fields[0].options.map(o => o.id === 'other'
    ? `<span data-opt="other" class="${sel.has('other') ? 'on' : ''}">${c.L(o.labelKey)} <em>(<i class="one" data-field="service_other">${esc(c.F('service_other'))}</i>)</em></span>`
    : `<span data-opt="${o.id}" class="${sel.has(o.id) ? 'on' : ''}">${c.L(o.labelKey)}</span>`).join('');
  const prayRow = (id, key, subKey) =>
    `<div class="k">${c.L(key)}${subKey ? `<small>${c.L(subKey)}</small>` : ''}</div>` +
    `<div class="v"><div class="ln"></div><div class="ln"></div><div class="txt" data-field="${id}">${esc(c.F(id))}</div></div>`;
  return [
    `<div class="info">
      <div class="k">${c.L('field.service')}</div><div class="span3"><div class="checks">${opts}</div></div>
      <div class="k">${c.L('field.passage')}</div><div class="v one" data-field="passage">${esc(c.F('passage'))}</div>
      <div class="k">${c.L('field.preacher')}</div><div class="v one" data-field="preacher">${esc(c.F('preacher'))}</div>
      <div class="k last">${c.L('field.sermonTitle')}</div><div class="span3 last v one" data-field="sermon_title">${esc(c.F('sermon_title'))}</div>
    </div>`,
    section(sh(c, '01', 'sec.sermon', { guideKey: 'guide.sermon', tag: EN_TAG.sermon }) +
      `<div class="lines kw" data-lines="auto"><div class="txt kwcol" data-field="sermon_keywords">${esc(c.F('sermon_keywords'))}</div>` +
      `<div class="txt main" data-field="sermon">${esc(c.F('sermon'))}</div></div>`, 'fill'),
    `<div class="strip"><div class="lab">${icon('pen', ink)}${c.L('sec.summary')} <small>SUMMARY</small></div><div class="bar one" data-field="summary">${esc(c.F('summary'))}</div></div>`,
    `<div class="row2">` +
      section(sh(c, '02', 'sec.insight', { tag: EN_TAG.insight }) + lines('insight', 3, c.F('insight'))) +
      section(sh(c, '03', 'sec.apply', { guideKey: 'guide.apply', tag: EN_TAG.apply }) + checklist('apply', c.F('apply') || [])) + `</div>`,
    section(sh(c, '04', 'sec.prayer', { tag: EN_TAG.prayer }) +
      `<div class="pray">${prayRow('prayer_me', 'pray.me')}${prayRow('prayer_others', 'pray.others', 'pray.others.sub')}${prayRow('prayer_inter', 'pray.inter', 'pray.inter.sub')}</div>`),
  ].join('');
}

function free(c) {
  return `<div class="info topic"><div class="k last">${c.L('field.title')}</div><div class="last v one" data-field="title">${esc(c.F('title'))}</div></div>` +
    section(lines('body', 'auto', c.F('body'), 'margin'), 'fill');
}

export function renderSheet(note, { theme = 'a', lang = 'ko', print = false } = {}) {
  const c = ctx(note, lang);
  const ink = palette(theme, print).ink;
  const el = document.createElement('div');
  el.className = 'sheet' + (print ? ' print' : '');
  el.dataset.theme = theme;
  el.dataset.type = note.type;
  el.setAttribute('lang', HTML_LANG[lang] || 'ko');
  const body = note.type === 'devotion' ? devotion(c, ink) : note.type === 'worship' ? worship(c, ink) : free(c);
  el.innerHTML = header(note, c, theme, print) + body +
    `<footer><span class="copy">${c.L('footer.copy')}</span><span class="note">${c.L('footer.notice')}</span></footer>`;
  return el;
}

// DOM에 붙인 뒤 호출: 'auto' 줄 칸을 남은 높이만큼 줄로 채운다.
export function layoutSheet(el) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;height:${LINE_MM}mm`;
  el.appendChild(probe);
  const lh = probe.getBoundingClientRect().height || (LINE_MM * 96) / 25.4;
  probe.remove();
  for (const box of el.querySelectorAll('.lines[data-lines="auto"]')) {
    box.querySelectorAll(':scope > .ln').forEach(n => n.remove());
    box.style.flex = ''; box.style.height = '';
    const h = box.getBoundingClientRect().height;
    const n = Math.max(1, Math.floor((h - 1) / lh));
    const first = box.firstChild;
    for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'ln'; box.insertBefore(d, first); }
    box.style.flex = 'none';
    box.style.height = `${n * LINE_MM}mm`;
  }
  return el;
}
