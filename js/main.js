// 앱 시작점: 화면 전환(#/…), 저장, 미리보기, 인쇄, PDF.
import { SCHEMAS, NOTE_TYPES, newNote, normalizeNote, summarize, weekdayIndex } from './schema.js';
import { t, detectLang, LANGS, HTML_LANG } from './i18n.js';
import { createStore } from './store.js';
import { renderForm, markOverflows } from './form.js';
import { renderSheet, layoutSheet, esc } from './sheet.js';
import { collectOverflows } from './overflow.js';
import { sheepSVG } from './sheep.js';
import { savePdf } from './pdf.js';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app'), printRoot = $('#print-root'), modalRoot = $('#modal-root'), toastEl = $('#toast');

function safeLocalStorage() { try { return window.localStorage; } catch { return null; } }
const store = createStore(safeLocalStorage());
const urlLang = new URLSearchParams(location.search).get('lang');

const S = () => store.getSettings();
const lang = () => S().lang || (LANGS.includes(urlLang) ? urlLang : detectLang(navigator.languages || [navigator.language]));
const theme = () => S().theme || 'a';
const L = (k, v) => esc(t(lang(), k, v));

function applyChrome() {
  document.documentElement.lang = HTML_LANG[lang()];
  document.body.dataset.theme = theme();
  document.title = 'QT Note';
}

/* ---------- 작은 UI 도구 ---------- */
let toastTimer;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function confirmDialog(message, { okLabel = t(lang(), 'btn.ok'), danger = false } = {}) {
  return new Promise(resolve => {
    modalRoot.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" data-testid="confirm">
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-testid="confirm-cancel">${L('btn.cancel')}</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-testid="confirm-ok">${esc(okLabel)}</button>
      </div></div></div>`;
    const done = v => { modalRoot.innerHTML = ''; resolve(v); };
    $('[data-testid=confirm-ok]', modalRoot).onclick = () => done(true);
    $('[data-testid=confirm-cancel]', modalRoot).onclick = () => done(false);
    $('[data-testid=confirm-ok]', modalRoot).focus();
  });
}

function setupDialog() {
  modalRoot.innerHTML = `<div class="modal-back"><div class="modal setup" role="dialog" aria-modal="true" data-testid="setup">
    <div class="setup-sheep">${sheepSVG(theme())}</div>
    <h2>${L('setup.title')}</h2>
    <button type="button" class="choice" data-testid="setup-local"><b>${L('setup.local')}</b><span>${L('setup.local.desc')}</span></button>
    <button type="button" class="choice" data-testid="setup-none"><b>${L('setup.none')}</b><span>${L('setup.none.desc')}</span></button>
    <p class="hint">${L('setup.note')}</p>
  </div></div>`;
  for (const mode of ['local', 'none']) {
    $(`[data-testid=setup-${mode}]`, modalRoot).onclick = () => {
      store.setSettings({ storageMode: mode, lang: S().lang || lang() });
      modalRoot.innerHTML = '';
      route();
    };
  }
}

const fmtDate = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '—';
  const wd = weekdayIndex(iso);
  return `${m[1]}.${m[2]}.${m[3]}${wd >= 0 ? ` (${t(lang(), 'days')[wd]})` : ''}`;
};

function banner() {
  if (!store.available) return `<p class="banner" data-testid="mode-banner">${L('home.unavailable')}</p>`;
  if (store.recovered) return `<p class="banner warn">${L('home.recovered')}</p>`;
  if (store.effectiveMode() === 'none') return `<p class="banner" data-testid="mode-banner">${L('home.noneMode')}</p>`;
  return '';
}

/* ---------- 홈 ---------- */
function viewHome() {
  leaveEditor();
  const notes = store.listNotes();
  app.innerHTML = `<div class="shell">
    <header class="topbar">
      <div class="brand"><span class="logo">${sheepSVG(theme())}</span><div><b>${L('app.name')}</b><small>${L('app.tagline')}</small></div></div>
      <a class="btn ghost" href="#/settings" data-testid="btn-settings">⚙ ${L('btn.settings')}</a>
    </header>
    ${banner()}
    <h2 class="h">${L('home.new')}</h2>
    <div class="new-grid">${NOTE_TYPES.map(tp => `<a class="new-card" href="#/new/${tp}" data-testid="new-${tp}">
      <b>${L('type.' + tp)}</b><span>${L(`type.${tp}.desc`)}</span></a>`).join('')}</div>
    <h2 class="h">${L('home.saved')}</h2>
    ${notes.length ? `<ul class="note-list">${notes.map(n => `<li><a href="#/edit/${encodeURIComponent(n.id)}" data-testid="note-item">
        <span class="d">${esc(fmtDate(n.date))}</span><span class="tp tp-${n.type}">${L('type.' + n.type)}</span>
        <span class="sm">${esc(summarize(n)) || L('list.empty')}</span></a></li>`).join('')}</ul>`
      : `<p class="empty">${L('home.empty')}</p>`}
  </div>`;
}

/* ---------- 설정 ---------- */
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });

function viewSettings() {
  leaveEditor();
  const s = S();
  const mode = store.effectiveMode();
  app.innerHTML = `<div class="shell">
    <header class="topbar"><a class="btn ghost" href="#/" data-testid="btn-back">← ${L('btn.back')}</a><h1 class="title">${L('btn.settings')}</h1><span></span></header>
    <section class="card"><h3>${L('settings.storage')}</h3>
      ${['local', 'none'].map(m => `<label class="radio"><input type="radio" name="storageMode" value="${m}" ${mode === m ? 'checked' : ''} ${store.available ? '' : 'disabled'}>
        <span><b>${L('setup.' + m)}</b><small>${L(`setup.${m}.desc`)}</small></span></label>`).join('')}
    </section>
    <section class="card"><h3>${L('settings.theme')}</h3><div class="theme-row">
      ${['a', 'b'].map(th => `<label class="radio theme-opt t-${th}"><input type="radio" name="theme" value="${th}" ${theme() === th ? 'checked' : ''}>
        <span class="mini">${sheepSVG(th)}</span><span><b>${L('theme.' + th)}</b></span></label>`).join('')}
    </div></section>
    <section class="card"><h3>${L('settings.lang')}</h3>
      <select name="lang">${LANGS.map(l => `<option value="${l}" ${lang() === l ? 'selected' : ''}>${esc(t(l, 'lang.' + l))}</option>`).join('')}</select>
    </section>
    <section class="card"><h3>${L('settings.install')}</h3>
      <button type="button" class="btn primary" data-testid="btn-install" ${installEvent ? '' : 'hidden'}>${L('btn.install')}</button>
      <p class="hint">${L('install.ios')}</p><p class="hint">${L('install.android')}</p>
    </section>
    <section class="card"><h3>${L('settings.data')}</h3>
      <p class="hint">${L('settings.privacy')}</p>
      <button type="button" class="btn danger" data-testid="btn-clear" ${store.countNotes() ? '' : 'disabled'}>${L('settings.clear')}</button>
    </section>
  </div>`;

  app.querySelectorAll('input[name=storageMode]').forEach(r => r.onchange = async () => {
    if (r.value === 'none' && store.effectiveMode() === 'local' && store.countNotes()) {
      const ok = await confirmDialog(t(lang(), 'confirm.toNone', { n: store.countNotes() }), { danger: true });
      if (!ok) return viewSettings();
      store.clearNotes();
    }
    store.setSettings({ storageMode: r.value });
    viewSettings();
  });
  app.querySelectorAll('input[name=theme]').forEach(r => r.onchange = () => { store.setSettings({ theme: r.value }); applyChrome(); viewSettings(); });
  $('select[name=lang]', app).onchange = e => { store.setSettings({ lang: e.target.value }); applyChrome(); viewSettings(); };
  $('[data-testid=btn-install]', app).onclick = async () => { if (installEvent) { installEvent.prompt(); installEvent = null; viewSettings(); } };
  $('[data-testid=btn-clear]', app).onclick = async () => {
    if (await confirmDialog(t(lang(), 'confirm.clear', { n: store.countNotes() }), { danger: true })) { store.clearNotes(); viewSettings(); }
  };
}

/* ---------- 작성 화면 ---------- */
let editor = null; // { note, persisted, sheetEl, timers }

function leaveEditor() {
  if (!editor) return;
  clearTimeout(editor.saveTimer); clearTimeout(editor.renderTimer);
  if (editor.dirty) saveNow();
  editor.ro?.disconnect();
  editor = null;
  printRoot.innerHTML = '';
  document.body.classList.remove('has-print', 'pv-open');
}

function saveNow() {
  if (!editor) return;
  editor.note = store.saveNote(editor.note);
  editor.dirty = false;
  if (!editor.persisted) {
    editor.persisted = true;
    history.replaceState(null, '', `#/edit/${encodeURIComponent(editor.note.id)}`);
    $('[data-testid=btn-delete]', app).hidden = false;
  }
  setStatus();
}

function setStatus() {
  const el = $('[data-testid=save-status]', app);
  if (!el || !editor) return;
  if (store.effectiveMode() === 'none') el.textContent = t(lang(), 'status.none');
  else if (store.lastError) el.textContent = t(lang(), 'status.error');
  else el.textContent = editor.persisted && !editor.dirty ? `✓ ${t(lang(), 'status.saved')}` : '';
  el.classList.toggle('err', !!store.lastError && store.effectiveMode() === 'local');
}

function renderPreview() {
  if (!editor) return;
  const host = $('.pv-inner', app);
  const el = renderSheet(editor.note, { theme: theme(), lang: lang() });
  host.replaceChildren(el);
  layoutSheet(el);
  editor.sheetEl = el;
  editor.overflows = collectOverflows(el);
  markOverflows($('.note-form', app), editor.overflows);
  fitPreview();
}

function fitPreview() {
  const scaleBox = $('.pv-scale', app), inner = $('.pv-inner', app);
  if (!scaleBox || !inner?.firstChild) return;
  const natural = inner.firstChild.offsetWidth || 794, naturalH = inner.firstChild.offsetHeight || 1123;
  let s = Math.min(1.25, scaleBox.clientWidth / natural);
  const top = $('.ed-top', app)?.offsetHeight || 0;
  document.documentElement.style.setProperty('--edtop', `${top}px`);
  if (window.matchMedia('(min-width: 1024px)').matches) {
    // PC에서는 A4 한 장이 화면 높이 안에 다 보이도록 맞춘다.
    s = Math.min(s, Math.max(0.3, (window.innerHeight - top - 64) / naturalH));
  }
  inner.style.transform = `scale(${s})`;
  inner.style.marginLeft = `${Math.max(0, (scaleBox.clientWidth - natural * s) / 2)}px`;
  scaleBox.style.height = `${naturalH * s}px`;
}

// 입력 직후 미리보기·인쇄·PDF를 눌러도 최신 내용으로 판단하도록, 대기 중인 미리보기 갱신을 바로 실행한다.
function flushRender() {
  if (!editor?.renderTimer) return;
  clearTimeout(editor.renderTimer);
  editor.renderTimer = null;
  renderPreview();
}

async function checkOverflowFirst() {
  flushRender();
  const n = editor?.overflows?.length || 0;
  return n === 0 || confirmDialog(t(lang(), 'confirm.overflow', { n }));
}

async function doPrint() {
  if (!(await checkOverflowFirst())) return;
  preparePrint();
  await document.fonts.ready;
  window.print();
}

function preparePrint() {
  if (!editor) return;
  const el = renderSheet(editor.note, { theme: theme(), lang: lang(), print: true });
  printRoot.replaceChildren(el);
  layoutSheet(el);
  document.body.classList.add('has-print');
}
window.addEventListener('beforeprint', () => { if (editor) preparePrint(); });

async function doPdf(btn) {
  if (!(await checkOverflowFirst())) return;
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.textContent = t(lang(), 'pdf.making');
  try {
    const r = await savePdf(editor.note, { theme: theme(), lang: lang() });
    if (r !== 'cancelled') toast(t(lang(), 'pdf.done'));
  } catch (e) {
    console.warn(e);
    toast(t(lang(), 'pdf.fail'), 6000);
  } finally {
    btn.disabled = false; btn.innerHTML = label;
  }
}

function viewEditor(note, persisted) {
  leaveEditor();
  note = normalizeNote(note);
  editor = { note, persisted, dirty: false };
  app.innerHTML = `<div class="editor">
    <div class="ed-top">
      <header class="topbar ed">
        <a class="btn ghost" href="#/" data-testid="btn-back">← ${L('btn.back')}</a>
        <h1 class="title">${L('type.' + note.type)}</h1>
        <span class="save-status" data-testid="save-status" aria-live="polite"></span>
        <button type="button" class="btn ghost danger-text small" data-testid="btn-delete" ${persisted ? '' : 'hidden'}>${L('btn.delete')}</button>
      </header>
      <div class="actions" role="toolbar">
        <button type="button" class="btn ghost only-mobile" data-testid="btn-preview"><span class="ico">👁</span> ${L('btn.preview')}</button>
        <button type="button" class="btn ghost" data-testid="btn-print"><span class="ico">🖨</span> ${L('btn.print')}</button>
        <button type="button" class="btn primary" data-testid="btn-pdf"><span class="ico">⬇</span> ${L('btn.pdf')}</button>
      </div>
    </div>
    <div class="ed-body">
      <div class="form-col"></div>
      <aside class="preview-col" data-testid="preview" aria-label="${L('preview.title')}">
        <div class="pv-head"><span>${L('preview.title')}</span><button type="button" class="btn ghost only-mobile" data-testid="btn-preview-close">✕ ${L('btn.close')}</button></div>
        <div class="pv-scale"><div class="pv-inner"></div></div>
      </aside>
    </div>
  </div>`;
  const form = renderForm(note, {
    lang: lang(),
    onChange: updated => {
      editor.note = updated; editor.dirty = true;
      clearTimeout(editor.renderTimer); editor.renderTimer = setTimeout(renderPreview, 120);
      clearTimeout(editor.saveTimer); editor.saveTimer = setTimeout(saveNow, 600);
      setStatus();
    },
  });
  $('.form-col', app).appendChild(form);
  $('[data-testid=btn-pdf]', app).onclick = e => doPdf(e.currentTarget);
  $('[data-testid=btn-print]', app).onclick = doPrint;
  $('[data-testid=btn-preview]', app).onclick = () => { flushRender(); document.body.classList.add('pv-open'); requestAnimationFrame(fitPreview); };
  $('[data-testid=btn-preview-close]', app).onclick = () => document.body.classList.remove('pv-open');
  $('[data-testid=btn-delete]', app).onclick = async () => {
    if (await confirmDialog(t(lang(), 'confirm.delete'), { okLabel: t(lang(), 'btn.delete'), danger: true })) {
      store.deleteNote(editor.note.id);
      editor.dirty = false;
      leaveEditor();
      location.hash = '#/';
    }
  };
  editor.ro = new ResizeObserver(fitPreview);
  editor.ro.observe($('.pv-scale', app));
  setStatus();
  renderPreview();
  document.fonts.ready.then(() => { if (editor) renderPreview(); });
}

/* ---------- 라우팅 ---------- */
function route() {
  applyChrome();
  if (S().storageMode == null && store.available) { viewHome(); setupDialog(); return; }
  const h = location.hash.replace(/^#\/?/, '');
  const [view, arg] = h.split('/');
  if (view === 'new' && SCHEMAS[arg]) return viewEditor(newNote(arg), false);
  if (view === 'edit' && arg) {
    const n = store.getNote(decodeURIComponent(arg));
    if (n) return viewEditor(n, true);
    history.replaceState(null, '', '#/');
  }
  if (view === 'settings') return viewSettings();
  viewHome();
}
window.addEventListener('hashchange', route);
window.addEventListener('resize', () => { if (editor) fitPreview(); });
// 스마트폰에서 다른 앱으로 넘어갈 때는 beforeunload가 오지 않을 수 있어서, 화면이 가려질 때도 저장한다.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && editor?.dirty) saveNow(); });
window.addEventListener('beforeunload', e => {
  if (editor?.dirty) saveNow();
  if (store.hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('pv-open'); });

route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
}
