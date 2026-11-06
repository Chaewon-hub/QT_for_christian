// PDF 바로 다운로드: A4 페이지들을 화면 밖에 그려 한 장씩 이미지로 캡처(html2canvas) → 여러 쪽 PDF(jsPDF).
// 이 파일은 불러올 때 DOM을 건드리지 않는다 (pdfFileName은 Node 테스트에서도 쓰임).
import { buildPages } from './sheet.js';
import { palette } from './sheep.js';

export function pdfFileName(note) {
  return `QTNote_${note.type}${note.date ? '_' + note.date : ''}.pdf`;
}

const scripts = {};
function loadScript(src) {
  scripts[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => { delete scripts[src]; reject(new Error(`failed to load ${src}`)); };
    document.head.appendChild(s);
  });
  return scripts[src];
}

const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

export async function makePdfBlob(note, { theme = 'a', lang = 'ko', imageSrc } = {}) {
  await Promise.all([loadScript('assets/vendor/html2canvas.min.js'), loadScript('assets/vendor/jspdf.umd.min.js')]);
  await document.fonts.ready;
  const built = buildPages(note, { theme, lang, imageSrc });
  await Promise.all([...built.pages.flatMap(p => [...p.querySelectorAll('img')])].map(img => img.decode?.().catch(() => {})));
  try {
    await frames();
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    for (let i = 0; i < built.pages.length; i++) {
      // 캡처할 장만 맨 위에 보이게 한다 (화면 밖 위치에서도 잘리지 않도록)
      built.pages.forEach((p, j) => { p.style.display = j === i ? '' : 'none'; });
      const el = built.pages[i];
      const canvas = await window.html2canvas(el, {
        scale: 2.5, backgroundColor: palette(theme).bg, logging: false, useCORS: false,
        windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
      });
      if (i > 0) doc.addPage('a4', 'portrait');
      doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    doc.setProperties({ title: pdfFileName(note).replace(/\.pdf$/, ''), creator: 'QT Note' });
    return doc.output('blob');
  } finally {
    built.dispose();
  }
}

// 스마트폰에서는 공유 창(파일에 저장·LINE 등), 그 밖에는 바로 다운로드.
export async function savePdf(note, opts) {
  const blob = await makePdfBlob(note, opts);
  const name = pdfFileName(note);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && typeof File === 'function' && navigator.canShare) {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; }
      catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
