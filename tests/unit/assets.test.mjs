import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sheepSVG, palette } from '../../js/sheep.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('sheep SVG uses concrete colors only (so it survives PDF capture)', () => {
  for (const theme of ['a', 'b']) for (const print of [false, true]) {
    const svg = sheepSVG(theme, { print });
    assert.ok(svg.startsWith('<svg'), 'is an svg');
    assert.ok(!svg.includes('var('), `no CSS variables (${theme}, print=${print})`);
    assert.ok(svg.includes(palette(theme, print).accent), 'uses theme accent (cross)');
    assert.ok(svg.includes(palette(theme, print).sakura), 'has cherry blossoms');
  }
  assert.equal(palette('a', true).bg.toUpperCase(), '#FFFFFF', 'print palette is white');
});

test('service worker pre-caches files that exist', () => {
  const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = 'qtnote-v\d+\.\d+\.\d+'/);
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const must of ['./', 'index.html', 'js/main.js', 'css/sheet.css', 'assets/vendor/jspdf.umd.min.js', 'assets/vendor/html2canvas.min.js', 'manifest.webmanifest'])
    assert.ok(list.includes(must), `precache includes ${must}`);
  for (const p of list) if (p !== './') assert.ok(existsSync(path.join(ROOT, p)), `exists: ${p}`);
});

test('manifest has what "Add to Home Screen" needs', () => {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name && m.start_url);
  const sizes = m.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const i of m.icons) assert.ok(existsSync(path.join(ROOT, i.src)), `icon ${i.src}`);
});

test('every font file referenced by fonts.css exists', () => {
  const css = readFileSync(path.join(ROOT, 'assets/fonts/fonts.css'), 'utf8');
  const urls = [...css.matchAll(/url\(\.\/([^)]+)\)/g)].map(m => m[1]);
  assert.ok(urls.length > 10);
  for (const u of urls) assert.ok(existsSync(path.join(ROOT, 'assets/fonts', u)), u);
});
