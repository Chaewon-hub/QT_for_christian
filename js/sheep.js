// 양 그림 (현재: 벚꽃 버전). PDF 캡처(html2canvas)에서도 색이 유지되도록 CSS 변수 대신 실제 색 값을 넣는다.
// 다른 그림으로 바꿀 때는 이 파일의 sheepSVG만 교체하면 된다.

const PALETTES = {
  a: { bg: '#F5F2EC', ink: '#2B2A28', accent: '#C2603A', sun: '#F1DACD', sakura: '#F3B9B4' },
  b: { bg: '#FAF6EA', ink: '#1D2A47', accent: '#D39C2C', sun: '#F4E1A9', sakura: '#F4C2CB' },
};

export function palette(theme, print = false) {
  const p = { ...(PALETTES[theme] || PALETTES.a) };
  if (print) p.bg = '#FFFFFF';
  return p;
}

const PETAL = 'M0 0 C-3.6 -2.6 -3.9 -7.4 -1.6 -9.6 L0 -8.2 L1.6 -9.6 C3.9 -7.4 3.6 -2.6 0 0 Z';

function flower(c, x, y, r, rot) {
  const k = r / 9.6;
  let petals = '';
  for (let i = 0; i < 5; i++) petals += `<path d="${PETAL}" transform="rotate(${i * 72})"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})">` +
    `<g fill="${c.sakura}" stroke="${c.ink}" stroke-width="${(1.3 / k).toFixed(3)}" stroke-linejoin="round">${petals}</g>` +
    `<circle r="1.9" fill="${c.accent}"/></g>`;
}

function petal(c, x, y, size, rot) {
  const k = size / 9.6;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})">` +
    `<path d="${PETAL}" fill="${c.sakura}" stroke="${c.ink}" stroke-width="${(1.2 / k).toFixed(3)}" stroke-linejoin="round"/></g>`;
}

const WOOL = 'M50.00 39.00 A7.91 7.91 0 0 1 63.48 41.75 A7.41 7.41 0 0 1 73.87 49.37 A6.79 6.79 0 0 1 78.79 60.11 A6.63 6.63 0 0 1 77.12 71.51 A7.08 7.08 0 0 1 69.23 80.96 A7.70 7.70 0 0 1 56.94 86.30 A7.98 7.98 0 0 1 43.06 86.30 A7.70 7.70 0 0 1 30.77 80.96 A7.08 7.08 0 0 1 22.88 71.51 A6.63 6.63 0 0 1 21.21 60.11 A6.79 6.79 0 0 1 26.13 49.37 A7.41 7.41 0 0 1 36.52 41.75 A7.91 7.91 0 0 1 50.00 39.00 Z';

function lamb(c) {
  const S = `stroke="${c.ink}"`, F = `fill="${c.bg}"`;
  return `<g stroke-linecap="round" stroke-linejoin="round" fill="none">
    <g ${S} stroke-width="6.6"><path d="M41.5 82 V96.5"/><path d="M58.5 82 V96.5"/></g>
    <g stroke="${c.bg}" stroke-width="3.4"><path d="M41.5 82 V93"/><path d="M58.5 82 V93"/></g>
    <path ${S} stroke-width="1.7" ${F} d="${WOOL}"/>
    <path ${S} stroke-width="1.7" ${F} d="M40.5 36 Q30 31 25.5 37.5 Q31 42 40.5 40 Z"/>
    <path ${S} stroke-width="1.7" ${F} d="M59.5 36 Q70 31 74.5 37.5 Q69 42 59.5 40 Z"/>
    <ellipse cx="50" cy="42.5" rx="10.5" ry="12.5" ${S} stroke-width="1.7" ${F}/>
    <path ${S} stroke-width="1.7" ${F} d="M40.50 32.50 A3.64 3.64 0 0 1 46.83 32.50 A3.64 3.64 0 0 1 53.17 32.50 A3.64 3.64 0 0 1 59.50 32.50 Q50 37 40.5 32.5 Z"/>
    <path ${S} stroke-width="1.5" d="M47.4 49.6 Q50 51.8 52.6 49.6"/>
    <path ${S} stroke-width="1.6" fill="${c.accent}" d="M47.6 57 H52.4 V63 H58.6 V67.8 H52.4 V86 H47.6 V67.8 H41.4 V63 H47.6 Z"/>
    <g ${S} stroke-width="7.6"><path d="M29.5 61.5 Q33 73 44 72.6"/><path d="M70.5 61.5 Q67 73 56 72.6"/></g>
    <g stroke="${c.bg}" stroke-width="4.2"><path d="M29.5 61.5 Q33 73 41.2 72.8"/><path d="M70.5 61.5 Q67 73 58.8 72.8"/></g>
  </g>
  <circle cx="45.6" cy="44" r="1.5" fill="${c.ink}"/><circle cx="54.4" cy="44" r="1.5" fill="${c.ink}"/>
  <circle cx="42.6" cy="48.4" r="1.9" fill="${c.accent}" fill-opacity=".45"/><circle cx="57.4" cy="48.4" r="1.9" fill="${c.accent}" fill-opacity=".45"/>`;
}

export function sheepSVG(theme = 'a', { print = false } = {}) {
  const c = palette(theme, print);
  const blossoms =
    flower(c, 13, 44, 8, 10) + flower(c, 88, 24, 7, -14) + flower(c, 90, 72, 5.5, 20) + flower(c, 9, 80, 4.8, -8) +
    petal(c, 28, 16, 4.4, 35) + petal(c, 55, 8, 3.8, -30) + petal(c, 96, 49, 3.8, 70) + petal(c, 4, 62, 3.6, -50) + petal(c, 80, 92, 3.4, 15);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="lamb with a cross">` +
    `<circle cx="68" cy="34" r="22" fill="${c.sun}"/>${blossoms}${lamb(c)}</svg>`;
}
