import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = mkdtempSync(path.join(os.tmpdir(), 'qtnote-e2e-'));
const T = { timeout: 120_000 };
const DESKTOP = { viewport: { width: 1440, height: 1000 } };

let server, browser;
before(async () => { server = await startServer(ROOT); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

async function open({ mode = 'local', lang = 'ko', ctxOpts = DESKTOP } = {}) {
  const ctx = await browser.newContext({ locale: 'ko-KR', ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept()); // '저장 안 함' 모드의 페이지 나가기 경고(beforeunload)는 '나가기'로 응답
  await page.goto(server.url + `?lang=${lang}`);
  await page.getByTestId('setup').waitFor();
  if (mode) await page.getByTestId(`setup-${mode}`).click();
  return { ctx, page, errors };
}
// 미리보기는 여러 장일 수 있고 닫혀 있을 수도 있으므로 textContent로 모든 장의 글을 모은다.
const sheets = page => page.getByTestId('preview').locator('.sheet');
const firstSheet = page => sheets(page).first();
const fieldText = async (page, id) =>
  (await page.getByTestId('preview').locator(`[data-field="${id}"]`).allTextContents()).join('\n');
const settle = page => page.waitForTimeout(450);
const squash = s => s.replace(/\s+/g, '');
const pdfPages = file => +execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/)[1];

test('first run shows the storage choice; local mode keeps notes after reload', T, async () => {
  const { ctx, page, errors } = await open({ mode: 'local' });
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="thanks"]').fill('오늘도 숨 쉴 수 있어서 감사');
  await page.getByTestId('save-status').filter({ hasText: /저장됨/ }).waitFor();
  await page.reload();
  assert.equal(await page.getByTestId('setup').count(), 0, 'no setup dialog on second visit');
  await page.getByTestId('btn-back').click().catch(() => {});
  await page.getByTestId('note-item').first().waitFor();
  assert.equal(await page.getByTestId('note-item').count(), 1);
  assert.match(await page.getByTestId('note-item').first().innerText(), /감사/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('devotion note: typed text appears on the A4 sheet and the weekday is marked', T, async () => {
  const { ctx, page, errors } = await open();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="date"]').fill('2026-11-08'); // Sunday
  await page.locator('[name="scripture_ref"]').fill('요한복음 15:1-8');
  await page.locator('[name="scripture"]').fill('나는 참포도나무요 내 아버지는 농부라');
  await page.locator('[name="action.0.text"]').fill('가족에게 먼저 인사하기');
  await page.locator('[name="action.0.done"]').check();
  await settle(page);
  assert.match(await fieldText(page, 'scripture_ref'), /요한복음 15:1-8/);
  assert.match(await fieldText(page, 'scripture'), /참포도나무/);
  assert.match(await fieldText(page, 'action'), /가족에게/);
  assert.equal(await firstSheet(page).locator('[data-field="action"] .done').count(), 1);
  assert.equal(await firstSheet(page).locator('.days [data-day="6"].on').count(), 1, 'Sunday circled');
  assert.equal(await firstSheet(page).locator('.days .on').count(), 1);
  assert.match(await firstSheet(page).locator('.ymd').textContent(), /2026[\s\S]*11[\s\S]*8/);
  assert.match(await firstSheet(page).locator('footer').textContent(), /본 양식의 무단 복제 및 사용을 금합니다/);
  assert.equal(await firstSheet(page).locator('h1').textContent(), '데일리 묵상 노트');
  assert.equal(await firstSheet(page).locator('.sheep svg').count(), 1, 'sheep drawn');
  assert.equal(await sheets(page).count(), 1, 'short note fits on one page');
  assert.match(await page.getByTestId('page-count').textContent(), /1/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('long multi-line text grows the box instead of being cut; long one-line text still warns', T, async () => {
  const { ctx, page } = await open();
  await page.getByTestId('new-devotion').click();
  const long = '하나님께서 오늘도 함께하심을 감사드립니다. '.repeat(12).trim();
  await page.locator('[name="thanks"]').fill(long);
  await settle(page);
  assert.equal(await page.locator('[data-field-wrap="thanks"]').evaluate(e => e.classList.contains('is-over')), false, 'no warning: the box grows');
  assert.equal(squash(await fieldText(page, 'thanks')), squash(long), 'every character is on the sheet');
  const grown = await firstSheet(page).locator('[data-field="thanks"]').first().evaluate(e => e.closest('.lines').querySelectorAll('.ln').length);
  assert.ok(grown > 3, `thanks box grew to ${grown} lines`);
  await page.locator('[name="hymn"]').fill('주 안에 있는 나에게 딴 근심 있으랴 십자가 밑에 나아가 내 짐을 풀었네 '.repeat(3));
  await settle(page);
  assert.equal(await page.locator('[data-field-wrap="hymn"]').evaluate(e => e.classList.contains('is-over')), true, 'one-line field warns');
  assert.equal(await page.getByTestId('overflow-hymn').isVisible(), true);
  await page.locator('[name="hymn"]').fill('주 안에 있는 나에게');
  await settle(page);
  assert.equal(await page.locator('[data-field-wrap="hymn"]').evaluate(e => e.classList.contains('is-over')), false);
  await ctx.close();
});

test('very long devotion continues on extra pages in print and PDF, without losing text', T, async () => {
  const { ctx, page, errors } = await open();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="date"]').fill('2026-11-08');
  const long = '주님의 은혜가 오늘도 넘칩니다. '.repeat(70) + 'ENDMARKTHANKS';
  await page.locator('[name="thanks"]').fill(long);
  await page.locator('[name="action.0.text"]').fill('ACTIONMARK');
  await settle(page);
  const n = await sheets(page).count();
  assert.ok(n >= 2, `pages in preview: ${n}`);
  assert.match(await page.getByTestId('page-count').textContent(), new RegExp(String(n)));
  assert.equal(squash(await fieldText(page, 'thanks')), squash(long), 'split across pages without losing text');
  assert.match(await sheets(page).nth(1).locator('header').textContent(), /데일리 묵상 노트/, 'continuation header');
  assert.match(await sheets(page).nth(1).textContent(), /\(계속\)/, 'continued section is marked');
  // print
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByTestId('btn-print').click();
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 10_000 });
  const pfile = path.join(TMP, 'long-print.pdf');
  await page.pdf({ path: pfile, preferCSSPageSize: true, printBackground: true });
  assert.equal(pdfPages(pfile), n, 'printed pages = preview pages');
  const text = execFileSync('pdftotext', [pfile, '-']).toString();
  assert.match(text, /ENDMARKTHANKS/);
  assert.match(text, /ACTIONMARK/);
  // PDF download
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByTestId('btn-pdf').click()]);
  const dfile = path.join(TMP, 'long-dl.pdf');
  await dl.saveAs(dfile);
  assert.equal(pdfPages(dfile), n, 'downloaded PDF pages = preview pages');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('free note adds pages automatically when the body is long', T, async () => {
  const { ctx, page } = await open();
  await page.getByTestId('new-free').click();
  await page.locator('[name="title"]').fill('수련회 메모');
  const body = Array.from({ length: 70 }, (_, i) => `${i + 1}번째 줄 메모입니다`).join('\n') + '\nLASTLINEMARK';
  await page.locator('[name="body"]').fill(body);
  await settle(page);
  const n = await sheets(page).count();
  assert.ok(n >= 3, `free note pages: ${n}`);
  assert.equal(squash(await fieldText(page, 'body')), squash(body));
  assert.match(await sheets(page).last().locator('footer').textContent(), new RegExp(`${n}\\s*/\\s*${n}`), 'page numbers');
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByTestId('btn-print').click();
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 10_000 });
  const pfile = path.join(TMP, 'free-print.pdf');
  await page.pdf({ path: pfile, preferCSSPageSize: true, printBackground: true });
  assert.equal(pdfPages(pfile), n);
  assert.match(execFileSync('pdftotext', [pfile, '-']).toString(), /LASTLINEMARK/);
  await ctx.close();
});

test('PC: the preview appears only after pressing the button', T, async () => {
  const { ctx, page } = await open();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="thanks"]').fill('미리보기 확인');
  await settle(page);
  assert.equal(await page.getByTestId('preview').isVisible(), false, 'hidden at first');
  const formBox = await page.getByTestId('form').boundingBox();
  assert.ok(formBox.width >= 600, `form uses the screen (${formBox.width}px)`);
  await page.getByTestId('btn-preview').click();
  await page.getByTestId('preview').waitFor({ state: 'visible' });
  const box = await firstSheet(page).boundingBox();
  assert.ok(box.width > 400 && box.x >= 0, `sheet visible (${box.width}px)`);
  await page.getByTestId('btn-preview-close').click();
  await page.getByTestId('preview').waitFor({ state: 'hidden' });
  await ctx.close();
});

test('free note photos go into the content box: button at the cursor, file drop at the pointer, resize, move, keep, print, delete', T, async () => {
  const { ctx, page, errors } = await open();
  await page.getByTestId('new-free').click();
  const rich = page.getByTestId('rich-body');
  const figs = rich.getByTestId('rich-photo');
  const layout = () => rich.evaluate(r => [...r.children].map(c => (c.matches('[data-testid=rich-photo]') ? 'P' : c.textContent.trim())).filter(Boolean).join('|'));
  // 1) 버튼: 커서 위치(첫 줄 다음)에 들어가고, 이어서 쓰면 사진 뒤에 써진다
  await rich.click();
  await page.keyboard.type('BEFORELINE');
  await page.keyboard.press('Enter');
  await page.getByTestId('photo-input').setInputFiles(path.join(ROOT, 'assets/icons/icon-512.png'));
  await figs.first().waitFor();
  await page.keyboard.type('AFTERLINE');
  await settle(page);
  assert.equal(await layout(), 'BEFORELINE|P|AFTERLINE');
  const order = await page.getByTestId('preview').evaluate(pv => {
    const h = pv.querySelector('.sheet').innerHTML;
    return [h.indexOf('BEFORELINE'), h.indexOf('data-testid="photo"'), h.indexOf('AFTERLINE')];
  });
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `sheet order ${order}`);
  // 2) 파일을 첫 줄 맨 앞에 끌어다 놓으면 그 자리에 들어간다
  const line = await rich.locator('div', { hasText: 'BEFORELINE' }).first().boundingBox();
  await page.evaluate(async ({ x, y }) => {
    const blob = await (await fetch('assets/icons/icon-192.png')).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'drop.png', { type: 'image/png' }));
    const el = document.querySelector('[data-testid=rich-body]');
    for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, { x: line.x + 1, y: line.y + line.height / 2 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=rich-body] [data-testid=rich-photo]').length === 2);
  await settle(page);
  assert.equal(await layout(), 'P|BEFORELINE|P|AFTERLINE');
  // 3) 모서리를 끌어 크기 줄이기 → 미리보기에도 반영
  const fig2 = figs.nth(1);
  await fig2.click();
  const w0 = (await fig2.boundingBox()).width;
  const hb = await fig2.getByTestId('rich-photo-resize').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 160, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  const w1 = (await fig2.boundingBox()).width;
  assert.ok(w1 < w0 - 80, `shrunk ${w0} -> ${w1}`);
  const sheetW = await page.getByTestId('preview').getByTestId('photo').evaluateAll(ps => ps.map(p => p.getBoundingClientRect().width));
  assert.ok(sheetW.length === 2 && sheetW[1] < sheetW[0] - 10, `sheet widths ${sheetW}`);
  // 3-2) 양옆: ← 버튼으로 왼쪽 끝 → 미리보기도 왼쪽에 붙는다
  const pv = page.getByTestId('preview');
  const gaps = () => pv.evaluate(p => {
    const s = p.querySelector('.sheet .body').getBoundingClientRect();
    return [...p.querySelectorAll('[data-testid=photo]')].map(ph => { const r = ph.getBoundingClientRect(); return [Math.round(r.left - s.left), Math.round(s.right - r.right)]; });
  });
  await fig2.getByTestId('rich-photo-left').click();
  await settle(page);
  assert.equal(await fig2.getAttribute('data-x'), '0');
  assert.ok(await fig2.getByTestId('rich-photo-left').isDisabled(), 'already at the left edge');
  assert.ok(await figs.nth(0).getByTestId('rich-photo-left').isDisabled(), 'a full-width photo cannot move sideways');
  let g2 = (await gaps())[1];
  assert.ok(g2[0] <= 2 && g2[1] > 30, `sheet: photo on the left ${g2}`);
  // 3-3) 마우스로 오른쪽 끝까지 끌기 (순서는 그대로, 끝에 자석처럼 붙음)
  await fig2.scrollIntoViewIfNeeded();
  let b2 = await fig2.boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(1180, b2.y + b2.height / 2, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  assert.equal(await fig2.getAttribute('data-x'), '100');
  assert.equal(await layout(), 'P|BEFORELINE|P|AFTERLINE', 'a sideways drag keeps the order');
  g2 = (await gaps())[1];
  assert.ok(g2[1] <= 2 && g2[0] > 30, `sheet: photo on the right ${g2}`);
  // 3-4) 위로 끌어 BEFORELINE 위(줄 사이)에 놓기
  b2 = await fig2.boundingBox();
  const bl = await rich.locator('div', { hasText: 'BEFORELINE' }).first().boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2, bl.y - 2, { steps: 10 });
  assert.ok(await page.locator('.rf-drop').isVisible(), 'a blue line shows where it will land');
  await page.mouse.up();
  await settle(page);
  assert.equal(await layout(), 'P|P|BEFORELINE|AFTERLINE');
  assert.equal(await fig2.getAttribute('data-x'), '100', 'keeps its side');
  assert.equal(await page.locator('.rf-drop').count(), 0);
  // 4) ↓ 버튼으로 한 칸씩 아래로
  await figs.nth(1).getByTestId('rich-photo-down').click();
  await settle(page);
  assert.equal(await layout(), 'P|BEFORELINE|P|AFTERLINE');
  await figs.nth(0).click();
  await figs.nth(0).getByTestId('rich-photo-down').click();
  await settle(page);
  assert.equal(await layout(), 'BEFORELINE|P|P|AFTERLINE');
  // 5) 새로고침 후에도 그대로 (사진 데이터 포함)
  await page.getByTestId('save-status').filter({ hasText: /저장됨/ }).waitFor();
  await page.reload();
  await figs.first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=rich-body] [data-testid=rich-photo] img')].every(i => i.complete && i.naturalWidth > 0));
  assert.equal(await layout(), 'BEFORELINE|P|P|AFTERLINE');
  assert.deepEqual(await figs.evaluateAll(fs => fs.map(f => f.dataset.x)), ['50', '100'], 'side positions are kept after reload');
  // 6) 페이지 추가
  await settle(page);
  const before = await sheets(page).count();
  await page.getByTestId('btn-add-page').click();
  await settle(page);
  assert.equal(await sheets(page).count(), before + 1);
  // 7) 인쇄에 사진 2장이 들어가고, PDF도 같은 쪽수
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByTestId('btn-print').click();
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 10_000 });
  const pfile = path.join(TMP, 'photo-print.pdf');
  await page.pdf({ path: pfile, preferCSSPageSize: true, printBackground: true });
  assert.equal(pdfPages(pfile), before + 1);
  const imgs = execFileSync('pdfimages', ['-list', pfile]).toString().trim().split('\n').slice(2).filter(l => /image/.test(l));
  assert.ok(imgs.length >= 2, `images in print: ${imgs.length}`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByTestId('btn-pdf').click()]);
  const dfile = path.join(TMP, 'photo-dl.pdf');
  await dl.saveAs(dfile);
  assert.equal(pdfPages(dfile), before + 1);
  // 8) 미리보기에는 편집 도구가 없다 (보기 전용)
  await page.getByTestId('btn-preview').click();
  await page.getByTestId('preview').waitFor({ state: 'visible' });
  assert.equal(await page.getByTestId('preview').getByTestId('photo').count(), 2);
  assert.equal(await page.getByTestId('preview').locator('[data-testid^="rich-photo"], [data-testid="photo-resize"]').count(), 0);
  await page.getByTestId('btn-preview-close').click();
  await page.getByTestId('preview').waitFor({ state: 'hidden' });
  // 9) ✕로 사진 빼기, 빈 페이지 빼기
  await figs.nth(0).click();
  await figs.nth(0).getByTestId('rich-photo-delete').click();
  await page.getByTestId('confirm-ok').click();
  await settle(page);
  assert.equal(await figs.count(), 1);
  assert.equal(await page.getByTestId('preview').getByTestId('photo').count(), 1);
  const withExtra = await sheets(page).count(); // 사진이 빠져 글 분량이 줄었으므로 다시 센다
  await page.getByTestId('btn-remove-page').click();
  await settle(page);
  assert.equal(await sheets(page).count(), withExtra - 1);
  assert.ok(await page.getByTestId('btn-remove-page').isDisabled(), 'no extra page left to remove');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the preview screen has its own print and PDF buttons', T, async () => {
  const { ctx, page, errors } = await open();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="thanks"]').fill('미리보기에서 바로 저장');
  await page.getByTestId('btn-preview').click();
  await page.getByTestId('preview').waitFor({ state: 'visible' });
  await settle(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId('pv-pdf').click()]);
  const file = path.join(TMP, 'pv.pdf');
  await dl.saveAs(file);
  assert.equal(pdfPages(file), 1);
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByTestId('pv-print').click();
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 10_000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('PDF download produces a one-page A4 PDF under 3 MB for a short note', T, async () => {
  const { ctx, page, errors } = await open();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="date"]').fill('2026-11-08');
  await page.locator('[name="reflect"]').fill('주님 안에 거하는 삶');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId('btn-pdf').click()]);
  assert.equal(dl.suggestedFilename(), 'QTNote_devotion_2026-11-08.pdf');
  const file = path.join(TMP, 'dl.pdf');
  await dl.saveAs(file);
  assert.equal(readFileSync(file).subarray(0, 4).toString(), '%PDF');
  const info = execFileSync('pdfinfo', [file]).toString();
  assert.match(info, /Pages:\s+1/);
  assert.match(info, /Page size:\s+595\.\d+ x 841\.\d+/);
  assert.ok(statSync(file).size < 3e6, `size ${statSync(file).size}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('print layout: only the sheet is printed, on one A4 page', T, async () => {
  const { ctx, page } = await open();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="prayer"]').fill('교회와 가족을 위해 기도합니다');
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByTestId('btn-print').click();
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 10_000 });
  const file = path.join(TMP, 'print.pdf');
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  assert.equal(pdfPages(file), 1);
  const text = execFileSync('pdftotext', [file, '-']).toString();
  assert.match(text, /교회와 가족을 위해 기도합니다/);
  assert.doesNotMatch(text, /PDF 저장|미리보기/, 'app buttons are not printed');
  await ctx.close();
});

test('none mode does not keep notes after reload', T, async () => {
  const { ctx, page } = await open({ mode: 'none' });
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="thanks"]').fill('저장하지 않는 감사');
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => localStorage.getItem('qtnote:v1:notes')), null);
  await page.reload();
  await page.getByTestId('mode-banner').waitFor();
  assert.equal(await page.getByTestId('note-item').count(), 0);
  await ctx.close();
});

test('language switch changes the sheet and the UI', T, async () => {
  const expect = { ja: ['デボーションノート', 'PDF保存'], en: ['Daily Devotion', 'Save PDF'], zh: ['每日灵修笔记', '保存PDF'] };
  const { ctx, page } = await open();
  for (const [lang, [title, pdfLabel]] of Object.entries(expect)) {
    await page.getByTestId('btn-settings').click();
    await page.locator('select[name="lang"]').selectOption(lang);
    await page.getByTestId('btn-back').click();
    await page.getByTestId('new-devotion').click();
    await settle(page);
    assert.equal(await firstSheet(page).locator('h1').textContent(), title, lang);
    assert.match(await page.getByTestId('btn-pdf').innerText(), new RegExp(pdfLabel));
    assert.equal(await firstSheet(page).getAttribute('lang'), lang === 'zh' ? 'zh-CN' : lang);
    await page.getByTestId('btn-back').click();
  }
  await ctx.close();
});

test('worship and free notes render their fields', T, async () => {
  const { ctx, page, errors } = await open();
  await page.getByTestId('new-worship').click();
  await page.locator('[name="service"][value="sun"]').check();
  await page.locator('[name="service"][value="other"]').check();
  await page.locator('[name="service_other"]').fill('청년부');
  await page.locator('[name="preacher"]').fill('김목사');
  await page.locator('[name="sermon_keywords"]').fill('포도나무');
  await page.locator('[name="sermon"]').fill('열매는 머무름에서 나온다');
  await page.locator('[name="apply.1.text"]').fill('매일 10분 말씀 읽기');
  await page.locator('[name="prayer_inter"]').fill('선교사님들');
  await settle(page);
  assert.equal(await firstSheet(page).locator('[data-opt="sun"].on').count(), 1);
  assert.equal(await firstSheet(page).locator('[data-opt="dawn"].on').count(), 0);
  assert.match(await fieldText(page, 'service_other'), /청년부/);
  for (const [id, re] of [['preacher', /김목사/], ['sermon_keywords', /포도나무/], ['sermon', /머무름/], ['apply', /10분/], ['prayer_inter', /선교사/]])
    assert.match(await fieldText(page, id), re, id);
  assert.equal(await sheets(page).count(), 1);
  await page.getByTestId('btn-back').click();
  await page.getByTestId('new-free').click();
  await page.locator('[name="title"]').fill('수련회 메모');
  await page.locator('[name="body"]').fill('첫째 날: 찬양과 말씀');
  await settle(page);
  assert.match(await fieldText(page, 'title'), /수련회 메모/);
  assert.match(await fieldText(page, 'body'), /찬양과 말씀/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('delete note removes it from the list', T, async () => {
  const { ctx, page } = await open();
  await page.getByTestId('new-free').click();
  await page.locator('[name="title"]').fill('지울 노트');
  await page.getByTestId('save-status').filter({ hasText: /저장됨/ }).waitFor();
  await page.getByTestId('btn-back').click();
  await page.getByTestId('note-item').first().waitFor();
  assert.equal(await page.getByTestId('note-item').count(), 1);
  await page.getByTestId('note-item').first().click();
  await page.getByTestId('btn-delete').click();
  await page.getByTestId('confirm-ok').click();
  await page.getByTestId('new-devotion').waitFor();
  assert.equal(await page.getByTestId('note-item').count(), 0);
  await ctx.close();
});

test('mobile viewport: form is usable and the preview fits the screen', T, async () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
  const { ctx, page } = await open({ ctxOpts: { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } });
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="thanks"]').fill('모바일에서 쓰는 감사');
  const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(docWidth <= viewport.width + 1, `no horizontal scroll (${docWidth})`);
  await page.getByTestId('btn-preview').click();
  await page.getByTestId('preview').waitFor({ state: 'visible' });
  const box = await firstSheet(page).boundingBox();
  assert.ok(box.width <= viewport.width + 1 && box.width > viewport.width * 0.8, `sheet width ${box.width}`);
  assert.match(await fieldText(page, 'thanks'), /모바일에서/);
  await ctx.close();
});

test('manifest and icons are served for "Add to Home Screen"', T, async () => {
  const { ctx, page } = await open({ mode: null });
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await page.request.get(new URL(href, server.url).href);
  assert.equal(res.status(), 200);
  const m = await res.json();
  for (const icon of m.icons) assert.equal((await page.request.get(new URL(icon.src, server.url).href)).status(), 200, icon.src);
  assert.ok(await page.locator('link[rel="apple-touch-icon"]').count());
  await ctx.close();
});

test('offline: the app opens and works after the first visit', T, async () => {
  const { ctx, page } = await open();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="thanks"]').fill('오프라인 감사');
  await settle(page);
  assert.match(await fieldText(page, 'thanks'), /오프라인 감사/);
  await ctx.close();
});

test('no network requests to other origins', T, async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const foreign = [];
  page.on('request', r => { if (!r.url().startsWith(server.url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url()); });
  await page.goto(server.url);
  await page.getByTestId('setup-local').click();
  await page.getByTestId('new-devotion').click();
  await page.locator('[name="thanks"]').fill('개인정보');
  await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId('btn-pdf').click()]);
  assert.deepEqual(foreign, []);
  await ctx.close();
});
