// 자유 노트 '내용' 편집기: 글과 사진을 한 칸에서. 사진은 [사진 넣기](커서 위치) 또는 파일 끌어다 놓기(놓은 위치)로 넣고,
// PC는 끌어서 옮기기, 모든 기기에서 ↑·↓ 버튼으로 옮기기, 오른쪽 아래 동그라미로 크기 조절.
// 저장 형식은 richbody.js (글 줄 + [[photo:ID:너비%:비율]] 줄).
import { parseBody, photoToken, clampW } from './richbody.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const BLOCKS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE']);

export function figureHTML({ id, w, ratio }, src, labels) {
  return `<figure class="rfig" contenteditable="false" draggable="true" data-testid="rich-photo" data-id="${esc(id)}" data-w="${clampW(w)}" data-ratio="${ratio}"` +
    ` style="width:${clampW(w)}%;aspect-ratio:${(1 / ratio).toFixed(4)}">` +
    `<img alt="" draggable="false"${src ? ` src="${esc(src)}"` : ''}>` +
    `<span class="rf-tools"><button type="button" data-rf="up" data-testid="rich-photo-up" aria-label="${esc(labels.up)}">↑ ${esc(labels.up)}</button>` +
    `<button type="button" data-rf="down" data-testid="rich-photo-down" aria-label="${esc(labels.down)}">↓ ${esc(labels.down)}</button>` +
    `<button type="button" data-rf="del" data-testid="rich-photo-delete" aria-label="${esc(labels.del)}">✕</button></span>` +
    `<span class="rf-resize" data-testid="rich-photo-resize" aria-hidden="true"></span></figure>`;
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
      else if (ch.matches('figure.rfig')) { close(); lines.push(photoToken({ id: ch.dataset.id, w: +ch.dataset.w, ratio: +ch.dataset.ratio })); }
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

  async function insertFiles(files, ref) {
    const added = await opts.addFiles(files);
    let last = null;
    for (const p of added) {
      const tpl = document.createElement('template');
      tpl.innerHTML = figureHTML({ id: p.id, w: 100, ratio: p.ratio }, p.src, opts.labels);
      last = tpl.content.firstElementChild;
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

  let dragFig = null;
  rich.addEventListener('dragstart', e => {
    const fig = e.target.closest?.('figure.rfig');
    if (!fig) return;
    dragFig = fig;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });
  rich.addEventListener('dragend', () => { dragFig = null; rich.classList.remove('dragover'); });
  rich.addEventListener('dragenter', e => { e.preventDefault(); rich.classList.add('dragover'); });
  rich.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = dragFig ? 'move' : 'copy'; });
  rich.addEventListener('dragleave', e => { if (!rich.contains(e.relatedTarget)) rich.classList.remove('dragover'); });
  rich.addEventListener('drop', e => {
    e.preventDefault();
    rich.classList.remove('dragover');
    if (dragFig) {
      const fig = dragFig; dragFig = null;
      const ref = refAtPoint(rich, e.clientX, e.clientY);
      if (ref !== fig && ref !== fig.nextSibling) { if (ref && ref.parentNode === rich) rich.insertBefore(fig, ref); else rich.appendChild(fig); }
      select(fig);
      changed();
      return;
    }
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
    const btn = e.target.closest('[data-rf]');
    const fig = e.target.closest('figure.rfig');
    if (!fig) { select(null); return; }
    select(fig);
    if (!btn) return;
    e.preventDefault();
    if (btn.dataset.rf === 'up') { const p = fig.previousElementSibling; if (p) { p.before(fig); changed(); } }
    else if (btn.dataset.rf === 'down') { const n = fig.nextElementSibling; if (n) { n.after(fig); changed(); } }
    else if (btn.dataset.rf === 'del' && (await opts.confirm())) {
      const id = fig.dataset.id;
      const prev = fig.previousElementSibling, next = fig.nextElementSibling;
      fig.remove();
      if (prev && next && isEmptyLine(next) && !prev.matches('figure.rfig')) next.remove(); // 사진 자리에 남는 빈 줄 정리
      opts.onDelete(id);
      changed();
    }
  });

  // 크기 조절: 가운데 정렬이라 손잡이가 움직인 거리의 2배만큼 너비가 바뀐다
  let rs = null;
  rich.addEventListener('pointerdown', e => {
    const h = e.target.closest('.rf-resize');
    if (!h) return;
    e.preventDefault();
    const fig = h.closest('figure.rfig');
    select(fig);
    fig.draggable = false;
    h.setPointerCapture?.(e.pointerId);
    const r = fig.getBoundingClientRect();
    rs = { fig, cx: r.left + r.width / 2, full: rich.clientWidth - parseFloat(getComputedStyle(rich).paddingLeft) - parseFloat(getComputedStyle(rich).paddingRight) };
  });
  rich.addEventListener('pointermove', e => {
    if (!rs) return;
    const w = clampW(((2 * (e.clientX - rs.cx)) / rs.full) * 100);
    rs.fig.style.width = `${w}%`;
    rs.fig.dataset.w = String(w);
  });
  const end = () => { if (!rs) return; rs.fig.draggable = true; rs = null; changed(); };
  rich.addEventListener('pointerup', end);
  rich.addEventListener('pointercancel', end);

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
