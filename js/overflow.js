// 칸 넘침 판정. 시트에서 data-field가 붙은 요소의 내용이 칸보다 크면 넘친 것으로 본다.
export function isOverflowing(el, tol = 1) {
  return el.scrollHeight > el.clientHeight + tol || el.scrollWidth > el.clientWidth + tol;
}

export function collectOverflows(sheetEl) {
  const over = new Set();
  for (const el of sheetEl.querySelectorAll('[data-field]')) {
    const id = el.dataset.field;
    const parts = el.classList.contains('rows') ? el.querySelectorAll('.one') : [el];
    if ([...parts].some(p => p.textContent.trim() && isOverflowing(p))) over.add(id);
  }
  return [...over];
}
