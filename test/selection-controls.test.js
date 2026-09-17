// 作者：singerTang。真实浏览器验证统一选择器，使用临时数据库，不上传文件。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('@playwright/test');

test('统一选择器：筛选、树形选择、键盘操作与表单同步', { timeout: 60000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'icon-select-test-'));
  const base = 'http://127.0.0.1:3108';
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: '3108', DB_PATH: path.join(directory, 'icons.db') },
    stdio: 'ignore',
  });
  const exited = new Promise((resolve) => server.once('exit', resolve));
  let browser;
  async function api(url, body) {
    const response = await fetch(base + url, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {});
    assert.ok(response.ok);
    return response.json();
  }
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await api('/api/stats'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    const parent = await api('/api/folders', { name: '扁平图标' });
    const child = await api('/api/folders', { name: 'PNG', parent_id: parent.id });
    const other = await api('/api/folders', { name: '线性图标' });
    await api('/api/folders', { name: 'PNG', parent_id: other.id });
    for (const name of ['报销', '预算']) await api('/api/categories', { name });
    await api('/api/import', { icons: [
      { name: '报销图标', type: 'app', category: '报销' },
      { name: '预算图标', type: 'symbol', category: '预算' },
      { name: '未分类图标', type: 'app' },
    ] });
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 3);
    assert.equal(await page.locator('#page-size-trigger').innerText(), '100');
    assert.equal(await page.locator('.choice-trigger:visible').count(), 5);

    await page.click('#filter-category-trigger');
    await page.getByRole('option', { name: '未分类', exact: true }).click();
    await page.getByRole('option', { name: '报销', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 2);
    assert.match(await page.locator('#filter-category-trigger').innerText(), /已选 2 项/);
    await page.locator('.choice-search').fill('没有此分类');
    assert.equal(await page.locator('.choice-empty').innerText(), '没有匹配项');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.choice-panel').count(), 0);
    await page.click('#filter-category-trigger');
    await page.getByRole('button', { name: '清空选择', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 3);
    await page.keyboard.press('Escape');

    await page.locator('#filter-type-trigger').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 2);
    assert.equal(await page.locator('#filter-type').inputValue(), 'app');
    await page.click('#filter-type-trigger');
    await page.getByRole('option', { name: '全部类型', exact: true }).click();

    await page.click('#batch-folder-select-trigger');
    await page.getByRole('button', { name: '收起扁平图标', exact: true }).click();
    assert.equal(await page.locator(`.choice-option[data-value="${child.id}"]`).count(), 0);
    await page.locator('.choice-search').fill('扁平图标 / PNG');
    await page.getByRole('option', { name: '扁平图标 / PNG', exact: true }).click();
    assert.equal(await page.locator('#batch-folder-select').inputValue(), String(child.id));
    assert.match(await page.locator('#batch-folder-select-trigger').innerText(), /扁平图标 \/ PNG/);

    await page.click('#btn-add');
    await page.fill('#f-name', '保留名称');
    await page.click('[data-quick-category="f-category"]');
    await page.fill('#folder-name-input', '新建分类验证');
    await page.click('#folder-confirm');
    await page.waitForFunction(() => document.getElementById('f-category-trigger').textContent.includes('新建分类验证'));
    assert.equal(await page.inputValue('#f-name'), '保留名称');
    await page.click('#form-cancel');
    await page.click('#btn-add');
    assert.equal(await page.locator('#f-category-trigger').innerText(), '未分类');
    await page.click('#form-cancel');

    await page.click('#page-size-trigger');
    const popup = await page.locator('.choice-panel').boundingBox();
    const trigger = await page.locator('#page-size-trigger').boundingBox();
    assert.ok(popup.y + popup.height <= trigger.y);
    await page.getByRole('option', { name: '200', exact: true }).click();
    await page.click('#sort-order-trigger');
    assert.equal(await page.locator('.choice-panel').count(), 1);
    assert.equal(await page.locator('#sort-order').inputValue(), 'grouped');
    assert.ok(await page.getByRole('option', { name: '最近上传', exact: true }).isVisible());
    assert.deepEqual(await page.locator('#sort-order option').allTextContents(), ['最近上传', '名称升序']);
    assert.equal(await page.getByRole('option', { name: '最近修改', exact: true }).count(), 0);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.choice-panel').count(), 0);
    await page.locator('#grid .card-select input').first().check();
    await page.fill('#search', '绝无匹配的名称');
    await page.waitForFunction(() => document.getElementById('stat').textContent === '匹配 0 个图标');
    assert.match(await page.locator('#empty-text').innerText(), /当前筛选条件/);
    assert.ok(await page.locator('#filter-chips').innerText().then((text) => text.includes('绝无匹配的名称')));
    await page.click('#empty-clear-filters');
    await page.waitForFunction(() => document.getElementById('stat').textContent === '共 3 个图标');
    assert.equal(await page.locator('#page-size').inputValue(), '200');
    assert.match(await page.locator('#batch-selected-count').innerText(), /已选 1 个/);
    await page.click(`.folder-item[data-id="${child.id}"] .folder-name`);
    await page.waitForFunction(() => document.getElementById('stat').textContent === '匹配 0 个图标');
    assert.match(await page.locator('#filter-chips').innerText(), /扁平图标 \/ PNG（含子文件夹）/);
    await page.locator('#filter-chips button').click();
    await page.waitForFunction(() => document.getElementById('stat').textContent === '共 3 个图标');
    await page.route('**/api/icons?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试查询失败' }) }));
    await page.fill('#search', '报销');
    await page.waitForFunction(() => document.getElementById('stat').textContent === '加载失败');
    assert.equal(await page.locator('#grid').isVisible(), false);
    assert.equal(await page.locator('#empty').isVisible(), false);
    assert.ok(await page.locator('#retry-icons').isVisible());
    await page.unroute('**/api/icons?*');
    await page.click('#retry-icons');
    await page.waitForFunction(() => document.getElementById('stat').textContent === '匹配 1 个图标');
    assert.ok(await page.locator('#grid').isVisible());
    await page.click('#clear-filters');
    await page.waitForFunction(() => document.getElementById('stat').textContent === '共 3 个图标');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#filter-category-trigger');
    const mobilePanel = await page.locator('.choice-panel').boundingBox();
    assert.ok(mobilePanel.x >= 0 && mobilePanel.x + mobilePanel.width <= 390);
    assert.ok(mobilePanel.y >= 0 && mobilePanel.y + mobilePanel.height <= 844);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.kill();
    await exited;
    rmSync(directory, { recursive: true });
  }
});
