// 앱 아이콘(PNG) 생성: node tools/make-icons.mjs  (Playwright 필요)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sheepSVG, palette } from '../js/sheep.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/icons');
const bg = palette('a').bg;

const page = (size, pad, radius) => `<!doctype html><html><body style="margin:0;background:transparent">
  <div style="width:${size}px;height:${size}px;background:${bg};border-radius:${radius}px;display:flex;align-items:center;justify-content:center">
    <div style="width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px">${sheepSVG('a').replace('width="100" height="100"', 'width="100%" height="100%"')}</div>
  </div></body></html>`;

const targets = [
  ['icon-192.png', 192, 0.06, 0], ['icon-512.png', 512, 0.06, 0],
  ['icon-maskable-512.png', 512, 0.16, 0], ['apple-touch-icon.png', 180, 0.08, 0], ['favicon-32.png', 32, 0.02, 0],
];
const browser = await chromium.launch();
for (const [name, size, pad, radius] of targets) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(page(size, pad, radius));
  await p.screenshot({ path: path.join(OUT, name), omitBackground: true });
  await p.close();
}
await browser.close();
console.log('icons written to', OUT);
