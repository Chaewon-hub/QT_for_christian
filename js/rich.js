// 자유 노트 '내용' 편집기: 글과 사진을 한 칸에서. 사진은 [사진 넣기](커서 위치) 또는 파일 끌어다 놓기(놓은 위치)로 넣고,
// 사진을 끌어서 위아래(줄 사이)·양옆으로 옮기기(손가락은 한 번 눌러 고른 뒤), ↑↓←→ 버튼, 모서리 동그라미로 크기 조절.
// 저장 형식은 richbody.js (글 줄 + [[photo:ID:너비%:비율(:가로 위치)]] 줄).
import { parseBody, photoToken, clampW, clampX } from './richbody.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const BLOCKS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE']);

// 가로 위치 x(0~100)는 '남는 폭' 안에서의 위치. 왼쪽 여백 = (100 - 너비) × x / 100 %
const marginOf = (w, x) => ((100 - w) * x) / 100;
const SNAPS = [0, 50, 100];

export function figureHTML({ id, w, ratio, x }, src, labels) {
  const cw = clampW(w), cx = clampX(x);
  const b = (rf, icon, label) => `<button type="button" data-rf="${rf}" data-testid="rich-photo-${rf === 'del' ? 'delete' : rf}" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>`;
  return `<figure class="rfig" contenteditable="false" draggable="false" data-testid="rich-photo" data-id="${esc(id)}" data-w="${cw}" data-x="${cx}" data-ratio="${ratio}"` +
    ` data-side="${cx > 50 ? 'l' : 'r'}" style="width:${cw}%;margin-left:${marginOf(cw, cx)}%;aspect-ratio:${(1 / ratio).toFixed(4)}">` +
    `<img alt="" draggable="false"${src ? ` src="${esc(src)}"` : ''}>` +
    `<span class="rf-tools">${b('up', '↑', labels.up)}${b('down', '↓', labels.down)}${b('left', '←', labels.left)}${b('right', '→', labels.right)}${b('del', '✕', labels.del)}</span>` +
    `<span class="rf-resize" data-testid="rich-photo-resize" aria-hidden="true"></span></figure>`;
}

// 너비·가로 위치를 바꾸고 화면에 반영 (손잡이는 가까운 쪽 모서리: 가운데보다 오른쪽이면 왼쪽 아래)
function setGeom(fig, w, x) {
  const cw = clampW(w), cx = clampX(x);
  fig.dataset.w = String(cw);
  fig.dataset.x = String(cx);
  fig.dataset.side = cx > 50 ? 'l' : 'r';
  fig.style.width = `${cw}%`;
  fig.style.marginLeft = `${marginOf(cw, cx)}%`;
  const fixed = cw >= 100; // 꽉 찬 사진은 옆으로 갈 곳이 없다
  fig.querySelector('[data-rf=left]').disabled = fixed || cx <= 0;
  fig.querySelector('[data-rf=right]').disabled = fixed || cx >= 100;
}

export function richInnerHTML(text, imageSrc, labels) {
  const html = parseBody(text).map(seg => seg.type === 'photo'
    ? figureHTML(seg, imageSrc(seg.id), labels)
    : seg.text.split('\n').map(l => `<div>${l ? esc(l) : '<br>'}</div>`).join('')).join('');
  return html || '<div><br></div>';
}

// 편집기 DOM → 저장 문자열. 브라우저가 만드는 <div>/<br>/글자 조각을 모두 줄로 바꾼다.
export function serializeRich(root) {
  const lines = [];
  let line = null;
  const open = () => { if (line === null) line = ''; };
  const close = () => { if (line !== null) { lines.push(line); line = null; } };
  const visit = node => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        ch.nodeValue.split('\n').forEach((part, i) => { if (i > 0) close(); open(); line += part; });
      } else if (ch.nodeType !== 1) continue;
      else if (ch.matches('figure.rfig')) { close(); lines.push(photoToken({ id: ch.dataset.id, w: +ch.dataset.w, ratio: +ch.dataset.ratio, x: ch.dataset.x })); }
      else if (ch.nodeName === 'BR') { open(); close(); }
      else if (BLOCKS.has(ch.nodeName)) { close(); visit(ch); close(); }
      else visit(ch);
    }
  };
  visit(root);
  close();
  return lines.join('\n');
}

const isEmptyLine = el => el.nodeType === 1 && el.nodeName === 'DIV' && !el.textContent && !el.querySelector('figure');

// 맨 위 단계의 흩어진 글자·인라인 요소를 <div>로 감싸 둔다 (나누기·옮기기를 줄 단위로 하기 위해)
function normalizeTop(rich) {
  let wrap = null;
  for (const ch of [...rich.childNodes]) {
    const inline = ch.nodeType === 3 || (ch.nodeType === 1 && !BLOCKS.has(ch.nodeName) && !ch.matches('figure.rfig') && ch.nodeName !== 'BR');
    if (inline) {
      if (!wrap) { wrap = document.createElement('div'); rich.insertBefore(wrap, ch); }
      wrap.appendChild(ch);
    } else {
      if (ch.nodeName === 'BR') { const d = document.createElement('div'); d.innerHTML = '<br>'; rich.replaceChild(d, ch); }
      wrap = null;
    }
  }
}

const topChild = (rich, node) => { while (node && node.parentNode !== rich) node = node.parentNode; return node; };

// range(커서 또는 놓은 지점) 위치에서 줄을 나누고, 사진을 넣을 '이 요소 앞' 기준을 돌려준다 (null이면 맨 끝)
function splitAt(rich, range) {
  normalizeTop(rich);
  if (!range || !rich.contains(range.startContainer)) return null;
  if (range.startContainer === rich) return rich.childNodes[range.startOffset] || null;
  const top = topChild(rich, range.startContainer);
  if (!top) return null;
  if (top.nodeType === 1 && top.matches('figure.rfig')) return top.nextSibling;
  const head = document.createRange();
  head.setStart(top, 0);
  head.setEnd(range.startContainer, range.startOffset);
  if (!head.toString()) return top; // 줄 맨 앞(또는 빈 줄): 그 줄 앞에
  const tail = document.createRange();
  tail.setStart(range.startContainer, range.startOffset);
  tail.setEnd(top, top.childNodes.length);
  if (!tail.toString()) return top.nextSibling; // 줄 맨 끝: 그 줄 뒤에
  const after = document.createElement('div');
  after.appendChild(tail.extractContents());
  top.after(after);
  return after;
}

function caretRangeAt(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.offsetNode, p.offset);
    return r;
  }
  return null;
}

// 놓은 지점이 사진 위거나 글자가 아닌 곳이면 위·아래 위치로 정한다
function refAtPoint(rich, x, y) {
  const hit = document.elementFromPoint(x, y);
  const fig = hit?.closest?.('figure.rfig');
  if (fig && rich.contains(fig)) {
    const r = fig.getBoundingClientRect();
    return y < r.top + r.height / 2 ? fig : fig.nextSibling;
  }
  const range = caretRangeAt(x, y);
  if (range && rich.contains(range.startContainer) && range.startContainer !== rich) return splitAt(rich, range);
  normalizeTop(rich);
  for (const ch of rich.children) { const r = ch.getBoundingClientRect(); if (y < r.top + r.height / 2) return ch; }
  return null;
}

function ensureTrailingLine(rich) {
  const last = rich.lastElementChild;
  if (!last || last.matches('figure.rfig')) rich.insertAdjacentHTML('beforeend', '<div><br></div>');
}

function caretInto(el) {
  const r = document.createRange();
  r.setStart(el, 0);
  r.collapse(true);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

let lastRange = null;
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.anchorNode) return;
  const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  if (node?.closest('.rich')) lastRange = sel.getRangeAt(0).cloneRange(); // [사진 넣기]를 눌러도 커서 위치를 기억
});

// opts: { imageSrc(id), addFiles(files) → Promise<[{id, ratio, src}]>, onDelete(id), confirm(msg) → Promise<bool>, labels }
export function setupRich(rich, opts) {
  const changed = () => { ensureTrailingLine(rich); rich.dispatchEvent(new Event('input', { bubbles: true })); };
  const select = fig => {
    rich.querySelectorAll('figure.rfig.sel').forEach(f => { if (f !== fig) f.classList.remove('sel'); });
    fig?.classList.add('sel');
  };
  const box = () => { // 글이 들어가는 안쪽 폭(px)과 왼쪽 위치
    const cs = getComputedStyle(rich), r = rich.getBoundingClientRect();
    const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
    return { left: r.left + rich.clientLeft + pl, full: rich.clientWidth - pl - pr };
  };
  for (const fig of rich.querySelectorAll('figure.rfig')) setGeom(fig, +fig.dataset.w, fig.dataset.x);

  async function insertFiles(files, ref) {
    const added = await opts.addFiles(files);
    let last = null;
    for (const p of added) {
      const tpl = document.createElement('template');
      tpl.innerHTML = figureHTML({ id: p.id, w: 100, ratio: p.ratio }, p.src, opts.labels);
      last = tpl.content.firstElementChild;
      setGeom(last, 100, 50);
      if (ref && ref.parentNode === rich) rich.insertBefore(last, ref); else rich.appendChild(last);
    }
    if (!last) return;
    ensureTrailingLine(rich);
    let next = last.nextElementSibling;
    if (!next || next.matches('figure.rfig')) { next = document.createElement('div'); next.innerHTML = '<br>'; last.after(next); }
    rich.focus();
    caretInto(next); // 사진 다음 줄에서 이어서 쓰기
    select(last);
    changed();
  }

  rich.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    e.preventDefault();
    if (files.length) {
      const sel = getSelection();
      insertFiles(files, splitAt(rich, sel.rangeCount ? sel.getRangeAt(0) : null));
      return;
    }
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text) document.execCommand('insertText', false, text); // 서식 없이 글자만
  });

  // 바깥에서 끌어 온 사진 파일·글자만 받는다 (칸 안의 사진 옮기기는 아래 포인터 끌기)
  rich.addEventListener('dragstart', e => { if (e.target.closest?.('figure.rfig')) e.preventDefault(); });
  rich.addEventListener('dragenter', e => { e.preventDefault(); select(null); rich.classList.add('dragover'); }); // 사진 위 버튼 줄이 놓을 자리를 가리지 않게
  rich.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  rich.addEventListener('dragleave', e => { if (!rich.contains(e.relatedTarget)) rich.classList.remove('dragover'); });
  rich.addEventListener('dragend', () => rich.classList.remove('dragover'));
  rich.addEventListener('drop', e => {
    e.preventDefault();
    rich.classList.remove('dragover');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { insertFiles(files, refAtPoint(rich, e.clientX, e.clientY)); return; }
    const text = e.dataTransfer?.getData('text/plain');
    if (text) {
      const r = caretRangeAt(e.clientX, e.clientY);
      if (r) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      document.execCommand('insertText', false, text);
    }
  });

  rich.addEventListener('click', async e => {
    if (justDragged) return;
    const btn = e.target.closest('[data-rf]');
    const fig = e.target.closest('figure.rfig');
    if (!fig) { select(null); return; }
    select(fig);
    if (!btn) return;
    e.preventDefault();
    const rf = btn.dataset.rf, x = +fig.dataset.x;
    if (rf === 'up') { const p = fig.previousElementSibling; if (p) { p.before(fig); changed(); } }
    else if (rf === 'down') { const n = fig.nextElementSibling; if (n) { n.after(fig); changed(); } }
    else if (rf === 'left' || rf === 'right') { // 왼쪽 끝 · 가운데 · 오른쪽 끝 사이를 한 칸씩
      const to = rf === 'left' ? [...SNAPS].reverse().find(v => v < x) : SNAPS.find(v => v > x);
      if (to !== undefined) { setGeom(fig, +fig.dataset.w, to); changed(); }
    }
    else if (btn.dataset.rf === 'del' && (await opts.confirm())) {
      const id = fig.dataset.id;
      const prev = fig.previousElementSibling, next = fig.nextElementSibling;
      fig.remove();
      if (prev && next && isEmptyLine(next) && !prev.matches('figure.rfig')) next.remove(); // 사진 자리에 남는 빈 줄 정리
      opts.onDelete(id);
      changed();
    }
  });

  // 끌기: 사진이 손가락(마우스)을 따라오고, 놓으면 → 가로 위치는 놓은 자리, 세로는 가장 가까운 줄 사이로.
  // 가운데·양 끝 근처에서는 자석처럼 붙는다. 손가락은 이미 고른(파란 테두리) 사진만 끌린다 — 화면 스크롤과 구분.
  // 크기 조절: 모서리 동그라미. 가로 위치(왼쪽·가운데·오른쪽 기준)는 그대로 두고 너비만 바뀐다.
  const drop = document.createElement('div');
  drop.className = 'rf-drop';
  drop.hidden = true;
  let g = null; // 진행 중인 끌기 { mode: 'move' | 'resize', ... }

  const gapsFor = fig => { // 사진을 놓을 수 있는 줄 사이 (사진 바로 앞·뒤는 '제자리'). 떠 있는 사진의 transform은 무시하려고 offsetTop 사용
    const kids = [...rich.children];
    const top0 = rich.getBoundingClientRect().top + rich.clientTop;
    const top = el => top0 + el.offsetTop, bottom = el => top0 + el.offsetTop + el.offsetHeight;
    const out = [];
    for (let i = 0; i <= kids.length; i++) {
      const prev = kids[i - 1], next = kids[i];
      const y = !prev ? top(next) : !next ? bottom(prev) : (bottom(prev) + top(next)) / 2;
      out.push({ y, ref: next || null, same: prev === fig || next === fig });
    }
    return out;
  };

  function moveTo(e) {
    const { fig } = g;
    g.cx = e.clientX; g.cy = e.clientY;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy + (scrollY - g.scroll0);
    // 가로: 남는 폭 안에서 비율로, 8px 안쪽이면 왼쪽 끝·가운데·오른쪽 끝에 붙는다
    const free = (g.box.full * (100 - +fig.dataset.w)) / 100;
    if (free > 0) {
      let x = g.x0 + (dx / free) * 100;
      for (const v of SNAPS) if (Math.abs(((x - v) / 100) * free) < 8) x = v;
      setGeom(fig, +fig.dataset.w, Math.min(100, Math.max(0, x)));
    }
    // 세로: 사진은 손을 따라 위아래로 떠 있고, 놓일 줄 사이에 파란 선 (가로는 칸 안에서 바로 움직여 붙는 모습이 보이게)
    fig.style.transform = `translateY(${dy}px)`;
    const best = gapsFor(fig).reduce((a, c) => (Math.abs(c.y - e.clientY) < Math.abs(a.y - e.clientY) ? c : a));
    g.target = best.same ? null : best;
    drop.hidden = !g.target;
    if (g.target) Object.assign(drop.style, { top: `${g.target.y - 2}px`, left: `${g.box.left}px`, width: `${g.box.full}px` });
  }

  function autoScroll() { // 끄는 중 화면 위·아래 끝에 가면 천천히 스크롤
    if (!g || g.mode !== 'move' || !g.started) return;
    const edge = 90, v = g.cy < edge ? -(edge - g.cy) / 6 : g.cy > innerHeight - edge ? (g.cy - innerHeight + edge) / 6 : 0;
    if (v) { scrollBy(0, v); moveTo({ clientX: g.cx, clientY: g.cy }); }
    g.raf = requestAnimationFrame(autoScroll);
  }

  rich.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('[data-rf]')) return;
    const fig = e.target.closest('figure.rfig');
    if (!fig) return;
    const wasSel = fig.classList.contains('sel');
    select(fig);
    const resize = e.target.closest('.rf-resize');
    if (!resize && e.pointerType !== 'mouse' && !wasSel) return; // 손가락: 먼저 눌러서 고르기
    e.preventDefault();
    g = { mode: resize ? 'resize' : 'move', fig, id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY,
      scroll0: scrollY, x0: +fig.dataset.x, w0: +fig.dataset.w, box: box(), started: !!resize, target: null };
  });

  addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    e.preventDefault();
    if (g.mode === 'resize') {
      const p = ((e.clientX - g.box.left) / g.box.full) * 100, x = g.x0;
      // 오른쪽 모서리: p = x + w(1 - x/100) / 왼쪽 모서리: p = (100 - w)·x/100
      const w = x <= 50 ? (p - x) / (1 - x / 100) : 100 - (100 * p) / x;
      setGeom(g.fig, w, x);
      return;
    }
    if (!g.started) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return;
      g.started = true;
      g.fig.classList.add('moving');
      document.body.appendChild(drop);
      g.raf = requestAnimationFrame(autoScroll);
    }
    moveTo(e);
  }, { passive: false });

  let justDragged = false;
  const finish = cancel => e => {
    if (!g || e.pointerId !== g.id) return;
    const { fig, mode, started, target, x0, w0 } = g;
    cancelAnimationFrame(g.raf);
    g = null;
    drop.hidden = true;
    drop.remove();
    fig.classList.remove('moving');
    fig.style.transform = '';
    if (!started) return;
    justDragged = true; // 끌기 끝의 click이 선택을 풀지 않게
    setTimeout(() => { justDragged = false; }, 0);
    if (cancel) { setGeom(fig, w0, x0); return; }
    if (mode === 'move' && target) {
      if (target.ref) rich.insertBefore(fig, target.ref); else rich.appendChild(fig);
      fig.scrollIntoView({ block: 'nearest' });
    }
    changed();
  };
  addEventListener('pointerup', finish(false));
  addEventListener('pointercancel', finish(true));

  return {
    // [사진 넣기] 버튼: 마지막 커서 위치에 (없으면 맨 끝에)
    insertAtCaret(files) {
      const range = lastRange && rich.contains(lastRange.startContainer) ? lastRange : null;
      return insertFiles(files, range ? splitAt(rich, range) : null);
    },
    refreshImages(imageSrc) {
      for (const fig of rich.querySelectorAll('figure.rfig')) {
        const img = fig.querySelector('img');
        const src = imageSrc(fig.dataset.id);
        if (src && img.getAttribute('src') !== src) img.src = src;
      }
    },
  };
}
