// 자유 노트 '내용'의 저장 형식: 보통 글 줄 + 사진 줄 [[photo:ID:너비%:높이/너비]]
// 예) "첫째 날\n[[photo:ph1:60:0.7500]]\n둘째 날"
export const PHOTO_MIN = 20, PHOTO_MAX = 100;
const RE = /^\[\[photo:([A-Za-z0-9_-]+):(\d{1,3}):(\d+(?:\.\d+)?)\]\]$/;

export const clampW = w => Math.min(PHOTO_MAX, Math.max(PHOTO_MIN, Math.round(+w || PHOTO_MAX)));

export function photoToken({ id, w, ratio }) {
  return `[[photo:${id}:${clampW(w)}:${(+ratio).toFixed(4)}]]`;
}

export function parsePhotoLine(line) {
  const m = RE.exec(line);
  if (!m || !(+m[3] > 0)) return null;
  return { type: 'photo', id: m[1], w: clampW(m[2]), ratio: +m[3] };
}

export function parseBody(text) {
  const out = [];
  let buf = null;
  for (const line of String(text ?? '').split('\n')) {
    const ph = parsePhotoLine(line);
    if (ph) {
      if (buf !== null) out.push({ type: 'text', text: buf.join('\n') });
      buf = null;
      out.push(ph);
    } else (buf ||= []).push(line);
  }
  if (buf !== null || !out.length) out.push({ type: 'text', text: (buf || ['']).join('\n') });
  return out;
}

export const photoIdsOf = text => parseBody(text).filter(s => s.type === 'photo').map(s => s.id);
