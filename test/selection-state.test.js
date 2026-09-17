// 作者：singerTang。使用临时数据库验证跨筛选勾选与分类全选确认。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium, expect } = require('@playwright/test');

test('跨页面、搜索及筛选保留选择，分类全选先确认', { timeout: 90000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'icon-selection-'));
  const base = 'http://127.0.0.1:3110';
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: '3110', DB_PATH: path.join(directory, 'icons.db') },
    stdio: 'ignore',
  });
  const exited = new Promise((resolve) => server.once('exit', resolve));
  let browser;
  async function api(endpoint, body) {
    const response = await fetch(base + endpoint, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {});
    assert.ok(response.ok);
    return response.json();
  }
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await api('/api/stats'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    await api('/api/import', {
      folders: [{ id: 1, name: '甲文件夹' }, { id: 2, name: '乙文件夹' }],
      categories: [{ name: '甲分类' }, { name: '乙分类' }],
      icons: [
        ...Array.from({ length: 36 }, (_, index) => ({ name: `甲-${String(index).padStart(2, '0')}`, type: 'app', category: '甲分类', folder_id: 1 })),
        ...Array.from({ length: 36 }, (_, index) => ({ name: `乙-${String(index).padStart(2, '0')}`, type: 'symbol', category: '乙分类', folder_id: 2 })),
        ...Array.from({ length: 3 }, (_, index) => ({ name: `待分-${index}`, type: 'app' })),
      ],
    });
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    const count = page.locator('#batch-selected-count');
    const cardChecks = page.locator('#grid .card-select input');
    const selected = () => page.locator('#grid .card-select input:checked');
    async function choose(id, label) {
      await page.click(`#${id}-trigger`);
      await page.getByRole('option', { name: label, exact: true }).click();
    }
    async function search(value, length) {
      const response = page.waitForResponse((result) => {
        const url = new URL(result.url());
        return url.pathname === '/api/icons' && url.searchParams.get('search') === value;
      });
      await page.fill('#search', value);
      const result = await (await response).json();
      await expect(cardChecks).toHaveCount(length);
      await expect(page.locator('#grid .card-name')).toHaveText(result.icons.map((icon) => icon.name));
    }

    await expect(cardChecks).toHaveCount(75);
    await choose('page-size', '30');
    await expect(cardChecks).toHaveCount(30);
    await cardChecks.first().check();
    const first = await cardChecks.first().getAttribute('data-id');
    await page.click('#page-next');
    await expect(page.locator('.pg-num.cur')).toHaveText('2');
    await expect(count).toHaveText('已选 1 个（当前页 0 个）');
    await cardChecks.first().check();
    await expect(count).toHaveText('已选 2 个（当前页 1 个）');
    await page.click('#page-prev');
    await expect(page.locator(`.card-select input[data-id="${first}"]`)).toBeChecked();
    await page.click('#btn-batch-toggle-all');
    await expect(count).toHaveText('已选 31 个（当前页 30 个）');
    await page.click('#btn-batch-toggle-all');
    await expect(count).toHaveText('已选 1 个（当前页 0 个）');
    await page.click('#btn-batch-clear');

    await choose('page-size', '100');
    await search('甲-', 36);
    await cardChecks.first().check();
    const firstA = await cardChecks.first().getAttribute('data-id');
    await search('乙-', 36);
    await expect(count).toHaveText('已选 1 个（当前页 0 个）');
    await cardChecks.first().check();
    const firstB = await cardChecks.first().getAttribute('data-id');
    await search('不存在的名称', 0);
    await expect(count).toHaveText('已选 2 个（当前页 0 个）');
    await expect(page.locator('#btn-batch-toggle-all')).toBeDisabled();
    await expect(page.locator('#btn-batch-delete')).toBeEnabled();
    await search('', 75);
    await expect(selected()).toHaveCount(2);

    await choose('filter-category', '甲分类');
    await page.keyboard.press('Escape');
    await expect(cardChecks).toHaveCount(36);
    await expect(count).toHaveText('已选 2 个（当前页 1 个）');
    await page.click('#filter-category-trigger');
    await page.getByRole('button', { name: '清空选择', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(selected()).toHaveCount(2);
    await choose('filter-type', 'SVG');
    await expect(cardChecks).toHaveCount(36);
    await expect(selected()).toHaveCount(1);
    await choose('filter-type', '全部类型');
    await page.locator('.folder-name').filter({ hasText: '甲文件夹' }).click();
    await expect(cardChecks).toHaveCount(36);
    await expect(count).toHaveText('已选 2 个（当前页 1 个）');
    await page.locator('.folder-item[data-id=""]').click();
    await choose('sort-order', '名称升序');
    await expect(selected()).toHaveCount(2);
    await page.click('#view-list');
    await expect(selected()).toHaveCount(2);
    await page.click('#view-grid');

    // 分类管理与主列表的勾选状态互不影响。
    const openPicker = async () => {
      await page.click('#btn-manage-cat');
      await page.locator('.category-item').filter({ hasText: '甲分类' }).locator('[data-action="manage"]').click();
      await expect(page.locator('#picker-selected')).toHaveText('已选 36 个');
      await page.fill('#picker-search', '待分-');
    };
    await openPicker();
    let prompt = '';
    page.once('dialog', async (dialog) => { prompt = dialog.message(); await dialog.dismiss(); });
    await page.click('#picker-select-all');
    assert.match(prompt, /当前搜索结果中尚未选择的 3 个/);
    assert.match(prompt, /确认后共 39 个/);
    await expect(page.locator('#picker-selected')).toHaveText('已选 36 个');
    page.once('dialog', (dialog) => dialog.accept());
    await page.click('#picker-select-all');
    await expect(page.locator('#picker-selected')).toHaveText('已选 39 个');
    assert.equal((await api('/api/icons?category=' + encodeURIComponent('甲分类'))).length, 36);
    await page.click('#picker-cancel');
    await page.click('#category-modal-close');
    await expect(count).toHaveText('已选 2 个（当前页 2 个）');
    await openPicker();
    page.once('dialog', (dialog) => dialog.accept());
    await page.click('#picker-select-all');
    await page.click('#picker-save');
    await expect(page.locator('#icon-picker-modal')).toBeHidden();
    assert.equal((await api('/api/icons?category=' + encodeURIComponent('甲分类'))).length, 39);
    await page.click('#category-modal-close');

    // 批量下载请求包含筛选外的选中项，失败不丢失选择。
    await search('甲-', 36);
    let downloadIds;
    await page.route('**/api/icons/batch/download', (route) => {
      downloadIds = route.request().postDataJSON().ids;
      return route.fulfill({ status: 500, json: { error: '模拟下载失败' } });
    });
    await page.click('#btn-batch-download');
    await expect(page.locator('#toast')).toHaveText('模拟下载失败');
    assert.deepEqual(new Set(downloadIds), new Set([Number(firstA), Number(firstB)]));
    await expect(count).toHaveText('已选 2 个（当前页 1 个）');
    await page.unroute('**/api/icons/batch/download');

    // 请求期间新增的勾选不会被迁移完成后的清理覆盖。
    let releaseMove;
    let moveIds;
    const moveGate = new Promise((resolve) => { releaseMove = resolve; });
    await page.route('**/api/icons/batch/folder', async (route) => {
      moveIds = route.request().postDataJSON().ids;
      await moveGate;
      await route.continue();
    });
    await page.click('#btn-batch-move');
    await expect.poll(() => moveIds?.length).toBe(2);
    const unchecked = page.locator('#grid .card-select input:not(:checked)').first();
    const extraId = await unchecked.getAttribute('data-id');
    await unchecked.check();
    releaseMove();
    await expect(count).toHaveText('已选 1 个（当前页 1 个）');
    await expect(page.locator(`.card-select input[data-id="${extraId}"]`)).toBeChecked();
    const moved = await api('/api/icons');
    assert.ok(moved.filter((icon) => moveIds.includes(icon.id)).every((icon) => icon.folder_id === null));
    await page.unroute('**/api/icons/batch/folder');

    // 筛选外已选项参与删除，确认中明确提示范围。
    await search('乙-', 36);
    await page.click('#btn-batch-delete');
    await page.click('#action-cancel');
    await expect(count).toHaveText('已选 1 个（当前页 0 个）');
    await page.click('#btn-batch-delete');
    await expect(page.locator('#action-detail')).toContainText('其中 1 个不在当前页');
    await page.click('#action-submit');
    await expect(count).toHaveText('已选 0 个');
    assert.ok(!(await api('/api/icons')).some((icon) => String(icon.id) === extraId));

    // 旧搜索响应晚到时不能覆盖新的搜索结果或勾选状态。
    await cardChecks.first().check();
    let releaseSearch;
    let searchHeld = false;
    const searchGate = new Promise((resolve) => { releaseSearch = resolve; });
    await page.route('**/api/icons?**', async (route) => {
      if (new URL(route.request().url()).searchParams.get('search') === '甲-') {
        searchHeld = true;
        await searchGate;
      }
      await route.continue();
    });
    await page.fill('#search', '甲-');
    await expect.poll(() => searchHeld).toBe(true);
    await search('乙-', 36);
    const staleResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get('search') === '甲-');
    releaseSearch();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok((await page.locator('#grid .card-name').allTextContents()).every((name) => name.startsWith('乙-')));
    await expect(count).toHaveText('已选 1 个（当前页 1 个）');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.kill();
    await exited;
    rmSync(directory, { recursive: true });
  }
});
