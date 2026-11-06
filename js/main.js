// 앱 시작점: 화면 전환(#/…), 저장, 미리보기, 인쇄, PDF.
import { SCHEMAS, NOTE_TYPES, newNote, normalizeNote, summarize, weekdayIndex } from './schema.js';
import { t, detectLang, LANGS, HTML_LANG } from './i18n.js';
import { createStore } from './store.js';
import { renderForm, markOverflows } from './form.js';
import { buildPages, esc, PX_PER_MM } from './sheet.js';
import { createImageStore, fileToPhoto } from './images.js';
import { photoIdsOf } from './richbody.js';
import { sheepSVG } from './sheep.js';
import { savePdf } from './pdf.js';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app'), printRoot = $('#print-root'), modalRoot = $('#modal-root'), toastEl = $('#toast');

function safeLocalStorage() { try { return window.localStorage; } catch { return null; } }
const store = createStore(safeLocalStorage());
const images = createImageStore(() => store.effectiveMode() === 'local');
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
      await images.clear();
    }
    if (r.value === 'none') await images.clearPersisted();
    store.setSettings({ storageMode: r.value });
    if (r.value === 'local') await images.persistAll();
    viewSettings();
  });
  app.querySelectorAll('input[name=theme]').forEach(r => r.onchange = () => { store.setSettings({ theme: r.value }); applyChrome(); viewSettings(); });
  $('select[name=lang]', app).onchange = e => { store.setSettings({ lang: e.target.value }); applyChrome(); viewSettings(); };
  $('[data-testid=btn-install]', app).onclick = async () => { if (installEvent) { installEvent.prompt(); installEvent = null; viewSettings(); } };
  $('[data-testid=btn-clear]', app).onclick = async () => {
    if (await confirmDialog(t(lang(), 'confirm.clear', { n: store.countNotes() }), { danger: true })) { store.clearNotes(); await images.clear(); viewSettings(); }
  };
}

/* ---------- 작성 화면 ---------- */
let editor = null; // { note, persisted, sheetEl, timers }

function leaveEditor() {
  if (!editor) return;
  if (editor.note.type === 'free' && editor.added.size) {
    const keep = new Set(photoIdsOf(editor.note.fields.body));
    const orphans = [...editor.added].filter(id => !keep.has(id)); // 키보드로 지운 사진 등
    if (orphans.length) images.remove(orphans);
  }
  clearTimeout(editor.saveTimer); clearTimeout(editor.renderTimer);
  if (editor.dirty) saveNow();
  editor.ro?.disconnect();
  editor = null;
  printRoot.innerHTML = '';
  document.body.classList.remove('has-print', 'pv-open');
}

function saveNow() {
  if (!editor) return;
  // 저장본(복사본)으로 바꿔 끼우지 않는다: 끌고 있는 사진 등 화면이 잡고 있는 객체가 낡지 않도록
  editor.note.updatedAt = store.saveNote(editor.note).updatedAt;
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

// 노트를 A4 페이지들로 나눠 미리보기(닫혀 있어도 계산은 한다)에 넣고, 쪽수·한 줄 칸 경고를 갱신한다.
function renderPreview() {
  if (!editor) return;
  const built = buildPages(editor.note, { theme: theme(), lang: lang(), imageSrc: images.src });
  const list = $('.pv-pages', app);
  list.replaceChildren(...built.pages.map(p => { const w = document.createElement('div'); w.className = 'pv-page'; w.appendChild(p); return w; }));
  built.dispose();
  editor.pageCount = built.pages.length;
  editor.overflows = built.overflows;
  markOverflows($('.note-form', app), editor.overflows);
  const badge = $('[data-testid=page-count]', app);
  badge.textContent = t(lang(), 'status.pages', { n: editor.pageCount });
  badge.classList.toggle('multi', editor.pageCount > 1);
  fitPreview();
}

function fitPreview() {
  const list = $('.pv-pages', app);
  if (!list) return;
  const avail = list.clientWidth;
  for (const w of list.children) {
    const sheet = w.firstElementChild;
    const natural = sheet.offsetWidth || 794, naturalH = sheet.offsetHeight || 1123;
    const s = Math.min(1, avail / natural);
    sheet.style.transform = `scale(${s})`;
    w.dataset.scale = String(s);
    w.style.setProperty('--inv', String(1 / s)); // 사진 손잡이를 화면에서 일정한 크기로
    w.style.width = `${natural * s}px`;
    w.style.height = `${naturalH * s}px`;
  }
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
  const built = buildPages(editor.note, { theme: theme(), lang: lang(), print: true, imageSrc: images.src });
  printRoot.replaceChildren(...built.pages);
  built.dispose();
  document.body.classList.add('has-print');
}
window.addEventListener('beforeprint', () => { if (editor) preparePrint(); });

async function doPdf(btn) {
  if (!(await checkOverflowFirst())) return;
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.textContent = t(lang(), 'pdf.making');
  try {
    const r = await savePdf(editor.note, { theme: theme(), lang: lang(), imageSrc: images.src });
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
  editor = { note, persisted, dirty: false, added: new Set() };
  app.innerHTML = `<div class="editor">
    <div class="ed-top">
      <header class="topbar ed">
        <a class="btn ghost" href="#/" data-testid="btn-back">← ${L('btn.back')}</a>
        <h1 class="title">${L('type.' + note.type)}</h1>
        <span class="page-count" data-testid="page-count"></span>
        <span class="save-status" data-testid="save-status" aria-live="polite"></span>
        <button type="button" class="btn ghost danger-text small" data-testid="btn-delete" ${persisted ? '' : 'hidden'}>${L('btn.delete')}</button>
      </header>
      <div class="actions" role="toolbar">
        <button type="button" class="btn ghost" data-testid="btn-preview"><span class="ico">👁</span> ${L('btn.preview')}</button>
        <button type="button" class="btn ghost" data-testid="btn-print"><span class="ico">🖨</span> ${L('btn.print')}</button>
        <button type="button" class="btn primary" data-testid="btn-pdf"><span class="ico">⬇</span> ${L('btn.pdf')}</button>
      </div>
    </div>
    <div class="ed-body">
      <div class="form-col"></div>
      <aside class="preview-col" data-testid="preview" aria-label="${L('preview.title')}">
        <div class="pv-head"><span>${L('preview.title')}</span>
          ${note.type === 'free' ? `<span class="pv-tools">
            <button type="button" class="btn small ghost" data-testid="pv-add-page" data-page="add">${L('btn.addPage')}</button>
            <button type="button" class="btn small ghost" data-testid="pv-remove-page" data-page="remove">${L('btn.removePage')}</button>
          </span>` : ''}
          <span class="pv-actions">
            <button type="button" class="btn small ghost" data-testid="pv-print">🖨 ${L('btn.print')}</button>
            <button type="button" class="btn small primary" data-testid="pv-pdf">⬇ ${L('btn.pdf')}</button>
          </span>
          <button type="button" class="btn ghost" data-testid="btn-preview-close">✕ ${L('btn.close')}</button></div>
        <div class="pv-pages"></div>
      </aside>
    </div>
    <input type="file" accept="image/*" multiple hidden data-testid="photo-input">
  </div>`;
  const form = renderForm(note, {
    lang: lang(),
    rich: note.type === 'free' ? {
      imageSrc: images.src,
      labels: { up: t(lang(), 'photo.up'), down: t(lang(), 'photo.down'), left: t(lang(), 'photo.left'), right: t(lang(), 'photo.right'), del: t(lang(), 'btn.delete') },
      addFiles: addPhotoFiles,
      onDelete: id => images.remove([id]),
      confirm: () => confirmDialog(t(lang(), 'confirm.deletePhoto'), { okLabel: t(lang(), 'btn.delete'), danger: true }),
    } : null,
    onChange: updated => {
      editor.note = { ...updated, extraPages: editor.note.extraPages }; // 쪽 수는 폼 밖(쪽 추가 버튼)에서 관리
      editor.dirty = true;
      clearTimeout(editor.renderTimer); editor.renderTimer = setTimeout(renderPreview, 120);
      clearTimeout(editor.saveTimer); editor.saveTimer = setTimeout(saveNow, 600);
      setStatus();
    },
  });
  $('.form-col', app).appendChild(form);
  editor.form = form;
  if (note.type === 'free') setupFreeNote();
  $('[data-testid=btn-pdf]', app).onclick = e => doPdf(e.currentTarget);
  $('[data-testid=btn-print]', app).onclick = doPrint;
  // 미리보기 화면 안에서도 바로 인쇄·PDF 저장 (미리보기가 화면을 덮어 아래 버튼이 가려지므로)
  $('[data-testid=pv-pdf]', app).onclick = e => doPdf(e.currentTarget);
  $('[data-testid=pv-print]', app).onclick = doPrint;
  $('[data-testid=btn-preview]', app).onclick = openPreview;
  $('[data-testid=btn-preview-close]', app).onclick = () => document.body.classList.remove('pv-open');
  $('[data-testid=btn-delete]', app).onclick = async () => {
    if (await confirmDialog(t(lang(), 'confirm.delete'), { okLabel: t(lang(), 'btn.delete'), danger: true })) {
      store.deleteNote(editor.note.id);
      images.remove(photoIdsOf(editor.note.fields.body));
      editor.dirty = false;
      leaveEditor();
      location.hash = '#/';
    }
  };
  editor.ro = new ResizeObserver(fitPreview);
  editor.ro.observe($('.pv-pages', app));
  setStatus();
  renderPreview();
  document.fonts.ready.then(() => { if (editor) renderPreview(); });
  const ids = note.type === 'free' ? photoIdsOf(note.fields.body) : [];
  if (ids.length) images.load(ids).then(() => { if (editor) { editor.form.richApi?.refreshImages(images.src); renderPreview(); } });
}

function openPreview() {
  flushRender();
  document.body.classList.add('pv-open');
  requestAnimationFrame(fitPreview);
}

/* ---------- 자유 노트: 사진(내용 칸에서 넣기) · 쪽 추가 ---------- */
async function addPhotoFiles(files) {
  const out = [];
  for (const file of files) {
    try {
      const { dataUrl, ratio } = await fileToPhoto(file);
      const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await images.put(id, dataUrl);
      editor?.added.add(id);
      out.push({ id, ratio, src: dataUrl });
    } catch (e) {
      console.warn(e);
      toast(t(lang(), 'photo.fail'), 5000);
    }
  }
  return out;
}

function pagesChanged() {
  editor.dirty = true;
  clearTimeout(editor.saveTimer); editor.saveTimer = setTimeout(saveNow, 600);
  setStatus();
  renderPreview();
  updatePageButtons();
}

function updatePageButtons() {
  app.querySelectorAll('[data-page="remove"]').forEach(b => { b.disabled = !editor.note.extraPages; });
}

function setupFreeNote() {
  const input = $('[data-testid=photo-input]', app);
  input.onchange = () => { const files = [...input.files]; input.value = ''; if (files.length) editor.form.richApi.insertAtCaret(files); };
  $('[data-rich-add]', app).onclick = () => input.click();
  $('.editor', app).addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b || !editor) return;
    if (b.dataset.page === 'add') editor.note.extraPages = (editor.note.extraPages || 0) + 1;
    else if (editor.note.extraPages) editor.note.extraPages--;
    pagesChanged();
  });
  updatePageButtons();
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
