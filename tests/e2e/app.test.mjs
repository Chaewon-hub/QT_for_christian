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
const T = { timeout: 90_000 };

let server, browser;
before(async () => { server = await startServer(ROOT); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

async function open({ mode = 'local', lang = 'ko', ctxOpts = {} } = {}) {
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
const sheet = page => page.getByTestId('preview').locator('.sheet');
const field = (page, id) => sheet(page).locator(`[data-field="${id}"]`);

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
  await page.waitForTimeout(400);
  assert.match(await field(page, 'scripture_ref').innerText(), /요한복음 15:1-8/);
  assert.match(await field(page, 'scripture').innerText(), /참포도나무/);
  assert.match(await field(page, 'action').innerText(), /가족에게/);
  assert.equal(await sheet(page).locator('[data-field="action"] .done').count(), 1);
  assert.equal(await sheet(page).locator('.days [data-day="6"].on').count(), 1, 'Sunday circled');
  assert.equal(await sheet(page).locator('.days .on').count(), 1);
  assert.match(await sheet(page).locator('.ymd').innerText(), /2026[\s\S]*11[\s\S]*8/);
  assert.match(await sheet(page).locator('footer').innerText(), /본 양식의 무단 복제 및 사용을 금합니다/);
  assert.equal(await sheet(page).locator('h1').innerText(), '데일리 묵상 노트');
  assert.equal(await sheet(page).locator('.sheep svg').count(), 1, 'sheep drawn');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('overflow warning appears for long text and disappears when shortened', T, async () => {
  const { ctx, page } = await open();
  await page.getByTestId('new-devotion').click();
  const wrap = page.locator('[data-field-wrap="thanks"]');
  await page.locator('[name="thanks"]').fill('짧은 감사');
  await page.waitForTimeout(400);
  assert.equal(await wrap.evaluate(e => e.classList.contains('is-over')), false);
  await page.locator('[name="thanks"]').fill('하나님께서 오늘도 함께하심을 감사드립니다. '.repeat(12));
  await page.waitForTimeout(400);
  assert.equal(await wrap.evaluate(e => e.classList.contains('is-over')), true);
  assert.equal(await page.getByTestId('overflow-thanks').isVisible(), true);
  await page.locator('[name="thanks"]').fill('짧은 감사');
  await page.waitForTimeout(400);
  assert.equal(await wrap.evaluate(e => e.classList.contains('is-over')), false);
  await ctx.close();
});

test('PDF download produces a one-page A4 PDF under 3 MB', T, async () => {
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
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 10_000 }); // 글꼴 준비 후 인쇄 창을 연다
  const file = path.join(TMP, 'print.pdf');
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  assert.match(execFileSync('pdfinfo', [file]).toString(), /Pages:\s+1/);
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
    assert.equal(await sheet(page).locator('h1').innerText(), title, lang);
    assert.match(await page.getByTestId('btn-pdf').innerText(), new RegExp(pdfLabel));
    assert.equal(await sheet(page).getAttribute('lang'), lang === 'zh' ? 'zh-CN' : lang);
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
  await page.waitForTimeout(400);
  assert.equal(await sheet(page).locator('[data-opt="sun"].on').count(), 1);
  assert.equal(await sheet(page).locator('[data-opt="dawn"].on').count(), 0);
  assert.match(await field(page, 'service_other').innerText(), /청년부/);
  for (const [id, re] of [['preacher', /김목사/], ['sermon_keywords', /포도나무/], ['sermon', /머무름/], ['apply', /10분/], ['prayer_inter', /선교사/]])
    assert.match(await field(page, id).innerText(), re, id);
  await page.getByTestId('btn-back').click();
  await page.getByTestId('new-free').click();
  await page.locator('[name="title"]').fill('수련회 메모');
  await page.locator('[name="body"]').fill('첫째 날: 찬양과 말씀');
  await page.waitForTimeout(400);
  assert.match(await field(page, 'title').innerText(), /수련회 메모/);
  assert.match(await field(page, 'body').innerText(), /찬양과 말씀/);
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
  const box = await sheet(page).boundingBox();
  assert.ok(box.width <= viewport.width + 1 && box.width > viewport.width * 0.8, `sheet width ${box.width}`);
  assert.match(await field(page, 'thanks').innerText(), /모바일에서/);
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
  await page.waitForTimeout(400);
  assert.match(await field(page, 'thanks').innerText(), /오프라인 감사/);
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
