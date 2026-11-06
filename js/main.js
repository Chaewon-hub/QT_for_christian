// 앱 시작점: 화면 전환(#/…), 저장, 미리보기, 인쇄, PDF.
import { SCHEMAS, NOTE_TYPES, newNote, normalizeNote, summarize, weekdayIndex } from './schema.js';
import { t, detectLang, LANGS, HTML_LANG } from './i18n.js';
import { createStore } from './store.js';
import { renderForm, markOverflows } from './form.js';
import { buildPages, esc, PX_PER_MM } from './sheet.js';
import { createImageStore, fileToPhoto } from './images.js';
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
  if (editor.note.type === 'free') decoratePhotos(list);
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
  editor = { note, persisted, dirty: false };
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
            <button type="button" class="btn small" data-act="add-photo">📷 ${L('btn.addPhoto')}</button>
            <button type="button" class="btn small ghost" data-testid="btn-add-page">${L('btn.addPage')}</button>
            <button type="button" class="btn small ghost" data-testid="btn-remove-page" ${note.extraPages ? '' : 'disabled'}>${L('btn.removePage')}</button>
          </span>` : ''}
          <button type="button" class="btn ghost" data-testid="btn-preview-close">✕ ${L('btn.close')}</button></div>
        ${note.type === 'free' ? `<p class="pv-hint">${L('photo.hint')}</p>` : ''}
        <div class="pv-pages"></div>
      </aside>
    </div>
    <input type="file" accept="image/*" multiple hidden data-testid="photo-input">
  </div>`;
  const form = renderForm(note, {
    lang: lang(),
    onChange: updated => {
      editor.note = { ...updated, images: editor.note.images, extraPages: editor.note.extraPages };
      editor.dirty = true;
      clearTimeout(editor.renderTimer); editor.renderTimer = setTimeout(renderPreview, 120);
      clearTimeout(editor.saveTimer); editor.saveTimer = setTimeout(saveNow, 600);
      setStatus();
    },
  });
  $('.form-col', app).appendChild(form);
  if (note.type === 'free') { $('.form-col', app).insertAdjacentHTML('beforeend', '<section class="card photo-card"></section>'); renderPhotoCard(); setupPhotoEditing(); }
  $('[data-testid=btn-pdf]', app).onclick = e => doPdf(e.currentTarget);
  $('[data-testid=btn-print]', app).onclick = doPrint;
  $('[data-testid=btn-preview]', app).onclick = openPreview;
  $('[data-testid=btn-preview-close]', app).onclick = () => document.body.classList.remove('pv-open');
  $('[data-testid=btn-delete]', app).onclick = async () => {
    if (await confirmDialog(t(lang(), 'confirm.delete'), { okLabel: t(lang(), 'btn.delete'), danger: true })) {
      store.deleteNote(editor.note.id);
      images.remove(editor.note.images.map(p => p.id));
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
  if (note.images.length) images.load(note.images.map(p => p.id)).then(() => { if (editor) { renderPreview(); renderPhotoCard(); } });
}

function openPreview() {
  flushRender();
  document.body.classList.add('pv-open');
  requestAnimationFrame(fitPreview);
}

/* ---------- 자유 노트 사진 ---------- */
function photoChanged({ now = false } = {}) {
  editor.dirty = true;
  clearTimeout(editor.saveTimer); editor.saveTimer = setTimeout(saveNow, 600);
  setStatus();
  clearTimeout(editor.renderTimer);
  if (now) renderPreview(); else editor.renderTimer = setTimeout(renderPreview, 60);
  renderPhotoCard();
  const rm = $('[data-testid=btn-remove-page]', app);
  if (rm) rm.disabled = !editor.note.extraPages;
}

function renderPhotoCard() {
  const card = $('.photo-card', app);
  if (!card || !editor) return;
  const list = editor.note.images;
  card.innerHTML = `<h3>${L('form.photos')}${list.length ? ` <small>${L('photo.count', { n: list.length })}</small>` : ''}</h3>
    <p class="guide">${L('photo.hint')}</p>
    ${list.length ? `<div class="thumbs">${list.map(p => {
      const src = images.src(p.id);
      return `<div class="thumb" data-testid="photo-thumb">${src ? `<img src="${esc(src)}" alt="">` : ''}
        <button type="button" class="thumb-del" data-del="${esc(p.id)}" aria-label="${L('btn.delete')}">✕</button></div>`;
    }).join('')}</div>` : ''}
    <div class="photo-actions">
      <button type="button" class="btn primary" data-act="add-photo">📷 ${L('btn.addPhoto')}</button>
      ${list.length ? `<button type="button" class="btn ghost" data-act="arrange">${L('btn.arrange')}</button>` : ''}
    </div>`;
}

async function addPhotos(files) {
  let added = 0;
  for (const file of files) {
    try {
      const { dataUrl, ratio } = await fileToPhoto(file);
      const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await images.put(id, dataUrl);
      const w = ratio > 1.2 ? 70 : 100;
      editor.note.images.push({ id, page: Math.max(0, (editor.pageCount || 1) - 1), x: (182 - w) / 2, y: 30 + added * 12, w, ratio });
      editor.selected = id;
      added++;
    } catch (e) {
      console.warn(e);
      toast(t(lang(), 'photo.fail'), 5000);
    }
  }
  if (!added) return;
  photoChanged({ now: true });
  openPreview();
  requestAnimationFrame(() => $(`.pv-pages .photo[data-img="${editor.selected}"]`, app)?.scrollIntoView({ block: 'center' }));
}

async function deletePhoto(id) {
  if (!(await confirmDialog(t(lang(), 'confirm.deletePhoto'), { okLabel: t(lang(), 'btn.delete'), danger: true }))) return;
  editor.note.images = editor.note.images.filter(p => p.id !== id);
  if (editor.selected === id) editor.selected = null;
  await images.remove([id]);
  photoChanged({ now: true });
}

function movePhotoPage(id, delta) {
  const p = editor.note.images.find(x => x.id === id);
  if (!p) return;
  p.page = Math.min(Math.max(0, Math.min(p.page, editor.pageCount - 1) + delta), editor.pageCount - 1);
  photoChanged({ now: true });
  $(`.pv-pages .photo[data-img="${id}"]`, app)?.scrollIntoView({ block: 'center' });
}

// 선택한 사진에만 도구(쪽 이동·빼기)와 크기 조절 손잡이를 붙인다.
function decoratePhotos(list) {
  for (const el of list.querySelectorAll('.photo')) {
    el.classList.add('editable');
    if (el.dataset.img !== editor.selected) continue;
    el.classList.add('selected');
    el.insertAdjacentHTML('beforeend', `<div class="ph-tools">
        <button type="button" data-act="prev" data-testid="photo-prev-page">↑ ${L('photo.prev')}</button>
        <button type="button" data-act="next" data-testid="photo-next-page">↓ ${L('photo.next')}</button>
        <button type="button" data-act="del" data-testid="photo-delete" aria-label="${L('btn.delete')}">✕</button>
      </div><div class="ph-resize" data-testid="photo-resize" aria-hidden="true"></div>`);
  }
}

function setupPhotoEditing() {
  const input = $('[data-testid=photo-input]', app);
  const pv = $('.preview-col', app), list = $('.pv-pages', app);
  input.onchange = () => { const files = [...input.files]; input.value = ''; if (files.length) addPhotos(files); };
  $('.editor', app).addEventListener('click', e => {
    const b = e.target.closest('[data-act], [data-del]');
    if (!b || !editor) return;
    if (b.dataset.del) return deletePhoto(b.dataset.del);
    const act = b.dataset.act, id = b.closest('.photo')?.dataset.img;
    if (act === 'add-photo') input.click();
    else if (act === 'arrange') openPreview();
    else if (act === 'prev' || act === 'next') movePhotoPage(id, act === 'prev' ? -1 : 1);
    else if (act === 'del') deletePhoto(id);
  });
  $('[data-testid=btn-add-page]', app).onclick = () => { editor.note.extraPages = (editor.note.extraPages || 0) + 1; photoChanged({ now: true }); };
  $('[data-testid=btn-remove-page]', app).onclick = () => {
    if (!editor.note.extraPages) return;
    editor.note.extraPages--;
    const last = Math.max(0, editor.pageCount - 2);
    for (const p of editor.note.images) if (p.page > last) p.page = last; // 빼는 장의 사진은 앞 장으로
    photoChanged({ now: true });
  };

  let drag = null;
  const bodyOf = el => el.closest('.body');
  const wrapOf = el => el.closest('.pv-page');
  list.addEventListener('pointerdown', e => {
    if (!editor || e.button > 0 || e.target.closest('.ph-tools')) return;
    const el = e.target.closest('.photo');
    if (!el) {
      if (editor.selected) { editor.selected = null; renderPreview(); }
      return;
    }
    e.preventDefault();
    if (editor.selected !== el.dataset.img) {
      editor.selected = el.dataset.img;
      list.querySelectorAll('.photo.selected').forEach(p => { p.classList.remove('selected'); p.querySelector('.ph-tools')?.remove(); p.querySelector('.ph-resize')?.remove(); });
      el.classList.add('selected');
      decoratePhotos(list);
    }
    const r = el.getBoundingClientRect(), s = +wrapOf(el).dataset.scale || 1;
    const ph = editor.note.images.find(p => p.id === el.dataset.img);
    drag = { el, ph, s, mode: e.target.closest('.ph-resize') ? 'resize' : 'move', moved: false, x0: e.clientX, y0: e.clientY,
      grabX: (e.clientX - r.left) / s / PX_PER_MM, grabY: (e.clientY - r.top) / s / PX_PER_MM };
    el.setPointerCapture?.(e.pointerId);
  });
  list.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.moved = true;
    const { el, ph } = drag;
    if (drag.mode === 'move') {
      // 손가락이 다른 장 위로 가면 그 장으로 옮긴다
      for (const w of list.children) {
        const wr = w.getBoundingClientRect();
        if (e.clientY >= wr.top && e.clientY <= wr.bottom) { const b = w.querySelector('.body'); if (b && bodyOf(el) !== b) b.appendChild(el); break; }
      }
      const body = bodyOf(el), s = +wrapOf(el).dataset.scale || 1, br = body.getBoundingClientRect();
      const bw = body.clientWidth / PX_PER_MM, bh = body.clientHeight / PX_PER_MM;
      const w = parseFloat(el.style.width), h = w * ph.ratio;
      const x = Math.min(Math.max(0, (e.clientX - br.left) / s / PX_PER_MM - drag.grabX), Math.max(0, bw - w));
      const y = Math.min(Math.max(0, (e.clientY - br.top) / s / PX_PER_MM - drag.grabY), Math.max(0, bh - h));
      el.style.left = `${x}mm`; el.style.top = `${y}mm`;
    } else {
      const body = bodyOf(el), s = drag.s, r = el.getBoundingClientRect();
      const bw = body.clientWidth / PX_PER_MM, bh = body.clientHeight / PX_PER_MM;
      const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
      const maxW = Math.max(20, Math.min(bw - x, (bh - y) / ph.ratio));
      const w = Math.min(Math.max(20, (e.clientX - r.left) / s / PX_PER_MM), maxW);
      el.style.width = `${w}mm`; el.style.height = `${w * ph.ratio}mm`;
    }
    // 화면 끝 가까이 끌면 미리보기를 스크롤
    const pr = pv.getBoundingClientRect();
    if (e.clientY < pr.top + 70) pv.scrollTop -= 14; else if (e.clientY > pr.bottom - 70) pv.scrollTop += 14;
  });
  const end = () => {
    if (!drag) return;
    const { el, moved } = drag;
    drag = null;
    if (!moved || !editor) return;
    const ph = editor.note.images.find(p => p.id === el.dataset.img);
    if (!ph) return;
    ph.page = [...list.children].indexOf(wrapOf(el));
    ph.x = parseFloat(el.style.left); ph.y = parseFloat(el.style.top); ph.w = parseFloat(el.style.width);
    photoChanged();
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
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
