// 노트 내용 → A4 페이지들(DOM). 미리보기·인쇄·PDF가 모두 이 결과를 쓴다.
// 여러 줄 칸은 글이 많으면 줄이 늘어나고, 한 장을 넘으면 다음 장으로 이어진다(줄 단위로 나눔).
import { SCHEMAS, weekdayIndex } from './schema.js';
import { t, HTML_LANG } from './i18n.js';
import { sheepSVG, palette } from './sheep.js';

export const LINE_MM = 8;
const LH = (LINE_MM * 96) / 25.4; // 8mm를 CSS px로
const EN_TAG = { reflect: 'Reflect', thanks: 'Thanks', repent: 'Repent', prayer: 'Prayer', fruit: 'Fruit', action: 'Action',
  sermon: 'Sermon', insight: 'Insight', apply: 'Apply' };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

// 다음 장으로 넘길 때 글을 자를 위치: 가능하면 공백·줄바꿈에서 자른다(띄어쓰기가 없는 일본어·중국어는 글자 단위).
export function snapCut(text, len) {
  if (len >= text.length) return [text, ''];
  const start = Math.max(0, len - 40);
  const win = text.slice(start, len);
  const rel = Math.max(win.lastIndexOf('\n'), win.lastIndexOf(' '));
  const cut = rel >= 0 && start + rel > 0 ? start + rel : len;
  return [text.slice(0, cut).replace(/[ \t]+$/, ''), text.slice(cut).replace(/^[ \t]*\n?/, '')];
}

const icon = (kind, ink) => {
  const p = kind === 'note'
    ? '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
    : '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>';
  return `<svg viewBox="0 0 24 24" width="24" height="24"><g fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</g></svg>`;
};

/* ---------- 블록 정의 ----------
   fixed  : 나눌 수 없는 덩어리 (표, 띠)
   single : 제목 + 줄 칸 (칸 안에 글 열이 1~2개)
   row2   : 두 칸이 나란히 (두 칸의 줄 수는 같게)
   prow   : 기도 표의 한 줄 (왼쪽 이름 칸 + 줄 칸)
   열(col): { field, text, cls } 또는 체크리스트 { field, items }                                   */

function headFn(c, num, labelKey, { guideKey, tag, right = '' } = {}) {
  return cont => `<div class="sh"><span class="num">${num}</span><span class="ttl">${c.L(labelKey)}</span>` +
    (cont ? `<span class="cont">${c.L('sheet.cont')}</span>` : (guideKey ? `<span class="guide">${c.L(guideKey)}</span>` : '')) +
    (cont ? (tag ? `<span class="en">${tag}</span>` : '') : (right || (tag ? `<span class="en">${tag}</span>` : ''))) + `</div>`;
}

function linesHTML(n, cols, cls = '') {
  const chk = cols.find(c => c.items);
  let rows = '';
  for (let i = 0; i < n; i++) {
    const it = chk && chk.items[i];
    rows += it ? `<div class="ln chk${it.done ? ' done' : ''}"><span class="one">${esc(it.text)}</span></div>` : '<div class="ln"></div>';
  }
  const overlays = cols.filter(c => !c.items)
    .map(c => `<div class="txt ${c.cls || ''}" data-field="${c.field}">${esc(c.text)}</div>`).join('');
  return `<div class="lines ${cls}${chk ? ' rows' : ''}"${chk ? ` data-field="${chk.field}"` : ''} style="height:${n * LINE_MM}mm">${rows}${overlays}</div>`;
}

function blockHTML(b, n) {
  if (b.type === 'fixed') return b.html;
  if (b.type === 'single') return `<section class="blk">${b.head ? b.head(!!b.cont) : ''}${linesHTML(n, b.cols, b.cls)}</section>`;
  if (b.type === 'row2') return `<div class="row2 blk">${b.parts.map(p => `<section>${p.head(!!b.cont)}${linesHTML(n, p.cols)}</section>`).join('')}</div>`;
  // prow: 첫 줄에는 '04 기도' 제목. 다른 줄이 새 장 맨 위에서 시작하면 '04 기도 (계속)'을 붙여 무엇의 이어짐인지 보이게 한다.
  const sec = b.head && !b.cont ? b.head(false) : b.atTop ? b.sectionHead(true) : '';
  return `<div class="blk prow${sec ? ' first' : ''}">${sec}` +
    `<div class="pray"><div class="k">${b.label}${b.cont ? ` <span class="cont">${b.contLabel}</span>` : ''}${b.sub && !b.cont ? `<small>${b.sub}</small>` : ''}</div>` +
    `<div class="v">${linesHTML(n, b.cols)}</div></div></div>`;
}

const colsOf = b => (b.type === 'row2' ? b.parts.flatMap(p => p.cols) : b.cols || []);
function mapCols(b, fn) {
  if (b.type === 'row2') return { ...b, parts: b.parts.map(p => ({ ...p, cols: p.cols.map(fn) })) };
  return { ...b, cols: b.cols.map(fn) };
}

function toEl(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

/* ---------- 노트 종류별 블록 ---------- */
function blocksFor(note, c, ink) {
  const F = id => note.fields?.[id];
  const txt = (field, cls) => ({ field, text: String(F(field) ?? ''), cls });
  const chk = field => ({ field, items: (F(field) || []).map(x => ({ ...x })) });
  const strip = (kind, key, small, field) => ({ type: 'fixed',
    html: `<div class="strip"><div class="lab">${icon(kind, ink)}${c.L(key)} <small>${small}</small></div><div class="bar one" data-field="${field}">${esc(F(field))}</div></div>` });

  if (note.type === 'devotion') return [
    { type: 'single', auto: true, min: 6, cols: [txt('scripture')],
      head: headFn(c, '01', 'sec.scripture', { guideKey: 'guide.copy',
        right: `<span class="field">${c.L('field.passage')} <i class="one" data-field="scripture_ref">${esc(F('scripture_ref'))}</i></span>` }) },
    strip('note', 'sec.hymn', 'HYMN', 'hymn'),
    { type: 'single', min: 3, cols: [txt('reflect')], head: headFn(c, '02', 'sec.reflect', { guideKey: 'guide.reflect', tag: EN_TAG.reflect }) },
    { type: 'row2', min: 3, parts: [
      { head: headFn(c, '03', 'sec.thanks', { tag: EN_TAG.thanks }), cols: [txt('thanks')] },
      { head: headFn(c, '04', 'sec.repent', { tag: EN_TAG.repent }), cols: [txt('repent')] }] },
    { type: 'row2', min: 3, parts: [
      { head: headFn(c, '05', 'sec.prayer', { tag: EN_TAG.prayer }), cols: [txt('prayer')] },
      { head: headFn(c, '06', 'sec.fruit', { guideKey: 'guide.fruit', tag: EN_TAG.fruit }), cols: [txt('fruit')] }] },
    { type: 'single', min: 2, cols: [chk('action')], head: headFn(c, '07', 'sec.action', { guideKey: 'guide.action', tag: EN_TAG.action }) },
  ];

  if (note.type === 'worship') {
    const sel = new Set(F('service') || []);
    const opts = SCHEMAS.worship.sections[0].fields[0].options.map(o => o.id === 'other'
      ? `<span data-opt="other" class="${sel.has('other') ? 'on' : ''}">${c.L(o.labelKey)} <em>(<i class="one" data-field="service_other">${esc(F('service_other'))}</i>)</em></span>`
      : `<span data-opt="${o.id}" class="${sel.has(o.id) ? 'on' : ''}">${c.L(o.labelKey)}</span>`).join('');
    const prayHead = headFn(c, '04', 'sec.prayer', { tag: EN_TAG.prayer });
    const prow = (field, key, subKey, first) => ({ type: 'prow', min: 2, cols: [txt(field)], head: first ? prayHead : null,
      sectionHead: prayHead, label: c.L(key), sub: subKey ? c.L(subKey) : '', contLabel: c.L('sheet.cont') });
    return [
      { type: 'fixed', html: `<div class="info">
        <div class="k">${c.L('field.service')}</div><div class="span3"><div class="checks">${opts}</div></div>
        <div class="k">${c.L('field.passage')}</div><div class="v one" data-field="passage">${esc(F('passage'))}</div>
        <div class="k">${c.L('field.preacher')}</div><div class="v one" data-field="preacher">${esc(F('preacher'))}</div>
        <div class="k last">${c.L('field.sermonTitle')}</div><div class="span3 last v one" data-field="sermon_title">${esc(F('sermon_title'))}</div>
      </div>` },
      { type: 'single', auto: true, min: 6, cls: 'kw', cols: [txt('sermon_keywords', 'kwcol'), txt('sermon', 'main')],
        head: headFn(c, '01', 'sec.sermon', { guideKey: 'guide.sermon', tag: EN_TAG.sermon }) },
      strip('pen', 'sec.summary', 'SUMMARY', 'summary'),
      { type: 'row2', min: 3, parts: [
        { head: headFn(c, '02', 'sec.insight', { tag: EN_TAG.insight }), cols: [txt('insight')] },
        { head: headFn(c, '03', 'sec.apply', { guideKey: 'guide.apply', tag: EN_TAG.apply }), cols: [chk('apply')] }] },
      prow('prayer_me', 'pray.me', null, true),
      prow('prayer_others', 'pray.others', 'pray.others.sub', false),
      prow('prayer_inter', 'pray.inter', 'pray.inter.sub', false),
    ];
  }

  return [
    { type: 'fixed', html: `<div class="info topic"><div class="k last">${c.L('field.title')}</div><div class="last v one" data-field="title">${esc(F('title'))}</div></div>` },
    { type: 'single', auto: true, min: 1, cls: 'margin', cols: [txt('body')] },
  ];
}

/* ---------- 머리글·바닥글 ---------- */
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

function contHeader(note, c) {
  const s = SCHEMAS[note.type];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(note.date || '');
  return `<header class="cont-head">
    <span class="eyebrow">${c.L(s.eyebrowKey)}</span>
    <span class="ctitle">${c.L(s.titleKey)}</span>
    <span class="cdate">${m ? `${m[1]}.${+m[2]}.${+m[3]}` : ''}</span>
  </header>`;
}

function pageShell(note, c, theme, print, first) {
  const el = document.createElement('div');
  el.className = 'sheet' + (print ? ' print' : '') + (first ? '' : ' cont');
  el.dataset.theme = theme;
  el.dataset.type = note.type;
  el.setAttribute('lang', HTML_LANG[c.lang] || 'ko');
  el.innerHTML = (first ? header(note, c, theme, print) : contHeader(note, c)) + `<div class="body"></div>` +
    `<footer><span class="copy">${c.L('footer.copy')}</span><span class="pg"></span><span class="note">${c.L('footer.notice')}</span></footer>`;
  return el;
}

/* ---------- 페이지 나누기 ---------- */
const bottomOf = el => el.getBoundingClientRect().bottom;
const fits = (body, el) => bottomOf(el) <= bottomOf(body) + 0.5;

function naturalLines(b, body) {
  const el = toEl(blockHTML(b, b.min));
  body.appendChild(el);
  let need = b.min;
  for (const col of colsOf(b)) {
    if (col.items) { need = Math.max(need, col.items.length); continue; }
    const ov = el.querySelector(`.txt[data-field="${col.field}"]`);
    need = Math.max(need, Math.ceil(ov.scrollHeight / LH - 0.1));
  }
  el.remove();
  return need;
}

function linesThatFit(b, body, max) {
  let k = 0;
  const probe = toEl(blockHTML(b, 0));
  body.appendChild(probe);
  k = Math.floor((bottomOf(body) - bottomOf(probe) - 0.5) / LH);
  probe.remove();
  k = Math.min(Math.max(k, 0), max);
  while (k > 0) {
    const el = toEl(blockHTML(b, k));
    body.appendChild(el);
    const ok = fits(body, el);
    el.remove();
    if (ok) break;
    k--;
  }
  return k;
}

function fitLength(ov, text) {
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    ov.textContent = text.slice(0, mid);
    if (ov.scrollHeight <= ov.clientHeight + 1) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function splitBlock(b, k, body) {
  const el = toEl(blockHTML(b, k));
  body.appendChild(el);
  const heads = {}, tails = {};
  for (const col of colsOf(b)) {
    if (col.items) continue;
    const ov = el.querySelector(`.txt[data-field="${col.field}"]`);
    [heads[col.field], tails[col.field]] = snapCut(col.text, fitLength(ov, col.text));
  }
  el.remove();
  const part1 = mapCols(b, col => (col.items ? { ...col, items: col.items.slice(0, k) } : { ...col, text: heads[col.field] }));
  const part2 = mapCols(b, col => (col.items ? { ...col, items: col.items.slice(k) } : { ...col, text: tails[col.field] }));
  part1.fixedN = k;
  part2.cont = true;
  part2.min = Math.max(1, b.min - k);
  delete part2.fixedN;
  return [part1, part2];
}

// note → { pages: [.sheet …], overflows: [한 줄 칸 id …], dispose() }
// 측정을 위해 화면 밖 상자에 그린다. 호출한 쪽에서 pages를 원하는 곳으로 옮긴 뒤 dispose()를 부른다.
// imageSrc(id): 자유 노트 사진의 data URL을 돌려주는 함수
export function buildPages(note, { theme = 'a', lang = 'ko', print = false, imageSrc = () => null } = {}) {
  const c = { lang, L: k => esc(t(lang, k)) };
  const ink = palette(theme, print).ink;
  const host = document.createElement('div');
  host.className = 'measure-host';
  document.body.appendChild(host);

  const pages = [];
  let body = null, placed = [];
  const finishPage = () => {
    if (!body) return;
    const auto = placed.filter(p => p.b.auto).pop();
    if (auto) {
      const last = body.lastElementChild;
      const extra = Math.floor((bottomOf(body) - bottomOf(last) - 0.5) / LH);
      if (extra > 0) {
        const bigger = toEl(blockHTML(auto.b, auto.n + extra));
        body.replaceChild(bigger, auto.el);
        auto.el = bigger; auto.n += extra;
      }
    }
  };
  const newPage = () => {
    finishPage();
    const pg = pageShell(note, c, theme, print, pages.length === 0);
    host.appendChild(pg);
    pages.push(pg);
    body = pg.querySelector('.body');
    placed = [];
  };

  newPage();
  const queue = blocksFor(note, c, ink);
  for (let guard = 0; queue.length && guard < 400; guard++) {
    const b = queue.shift();
    b.atTop = body.children.length === 0;
    const n = b.type === 'fixed' ? 0 : b.fixedN ?? naturalLines(b, body);
    const el = toEl(blockHTML(b, n));
    body.appendChild(el);
    if (fits(body, el)) { placed.push({ b, n, el }); continue; }
    body.removeChild(el);
    const empty = body.children.length === 0;
    if (b.type !== 'fixed') {
      const k = linesThatFit(b, body, n - 1);
      if (k >= 2 || (k >= 1 && empty)) {
        const [p1, p2] = splitBlock(b, k, body);
        const e1 = toEl(blockHTML(p1, k));
        body.appendChild(e1);
        placed.push({ b: p1, n: k, el: e1 });
        queue.unshift(p2);
        newPage();
        continue;
      }
    }
    if (empty) { body.appendChild(el); placed.push({ b, n, el }); continue; } // 한 장보다 큰 고정 블록: 그대로 둔다
    newPage();
    queue.unshift(b);
  }
  finishPage();

  if (note.type === 'free') {
    // '+ 쪽 추가'로 늘린 빈 장 (줄만 있는 장)
    for (let i = 0; i < (note.extraPages || 0); i++) {
      newPage();
      const b = { type: 'single', auto: true, min: 1, cls: 'margin', cols: [{ field: 'body', text: '' }] };
      const el = toEl(blockHTML(b, 1));
      body.appendChild(el);
      placed.push({ b, n: 1, el });
    }
    finishPage();
    placePhotos(pages, note.images || [], imageSrc);
  }

  if (pages.length > 1) pages.forEach((p, i) => { p.querySelector('footer .pg').textContent = `${i + 1} / ${pages.length}`; });
  const overflows = new Set();
  for (const p of pages) for (const id of collectOneLineOverflows(p)) overflows.add(id);
  return { pages, overflows: [...overflows], dispose: () => host.remove() };
}

// 사진을 본문 영역 기준 mm 좌표로 붙인다. 장 밖으로 나가지 않게 위치·크기를 맞춘다.
export const PX_PER_MM = 96 / 25.4;
function placePhotos(pages, photos, imageSrc) {
  for (const ph of photos) {
    const body = pages[Math.min(ph.page, pages.length - 1)].querySelector('.body');
    const bw = body.clientWidth / PX_PER_MM, bh = body.clientHeight / PX_PER_MM;
    let w = Math.min(ph.w, bw);
    if (w * ph.ratio > bh) w = bh / ph.ratio;
    const h = w * ph.ratio;
    const x = Math.min(ph.x, Math.max(0, bw - w)), y = Math.min(ph.y, Math.max(0, bh - h));
    const el = document.createElement('div');
    el.className = 'photo';
    el.dataset.img = ph.id;
    el.setAttribute('data-testid', 'photo');
    el.style.cssText = `left:${x.toFixed(2)}mm;top:${y.toFixed(2)}mm;width:${w.toFixed(2)}mm;height:${h.toFixed(2)}mm`;
    const src = imageSrc(ph.id);
    el.innerHTML = src ? `<img src="${esc(src)}" alt="" draggable="false">` : '<div class="ph-missing"></div>';
    body.appendChild(el);
  }
}

// 한 줄 칸(.one)이 넘쳤는지: 여러 줄 칸은 늘어나므로 넘치지 않는다.
function collectOneLineOverflows(sheetEl) {
  const out = new Set();
  for (const el of sheetEl.querySelectorAll('.one')) {
    if (!el.textContent.trim()) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      const id = el.dataset.field || el.closest('[data-field]')?.dataset.field;
      if (id) out.add(id);
    }
  }
  return out;
}
