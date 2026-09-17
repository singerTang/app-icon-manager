// 作者：singerTang。回收站迁移、文件生命周期及浏览器回归，使用临时数据库。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { chromium, expect } = require('@playwright/test');
const createTrash = require('../lib/trash');
const root = path.resolve(__dirname, '..');

test('旧库升级、保留期限、恢复归属、共享文件及清理失败重试', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-trash-data-'));
  const dbPath = path.join(directory, 'icons.db');
  const old = new Database(dbPath);
  old.exec(`CREATE TABLE icons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT DEFAULT 'app',
    category TEXT DEFAULT '', tags TEXT DEFAULT '', file_path TEXT DEFAULT '', file_type TEXT DEFAULT '', description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO icons (name, created_at, updated_at) VALUES ('旧图标', '2025-01-01', '2025-01-01');`);
  old.close();
  const previous = process.env.DB_PATH;
  process.env.DB_PATH = dbPath;
  const db = require('../db');
  if (previous === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = previous;
  const trash = createTrash(db, directory);
  try {
    assert.equal(db.prepare('SELECT deleted_at FROM icons WHERE id = 1').get().deleted_at, null);
    assert.equal(trash.retentionDays(), 30);
    db.prepare("INSERT INTO folders (name, created_at) VALUES ('父级', '2025')").run();
    db.prepare("INSERT INTO folders (name, parent_id, created_at) VALUES ('子级', 1, '2025')").run();
    db.prepare("INSERT INTO categories (name, created_at) VALUES ('原分类', '2025')").run();
    db.prepare("UPDATE icons SET category = '原分类', folder_id = 2, file_path = '/uploads/shared.svg' WHERE id = 1").run();
    fs.writeFileSync(path.join(directory, 'shared.svg'), '<svg/>');
    assert.equal(trash.move([1]), 1);
    const moved = db.prepare('SELECT * FROM icons WHERE id = 1').get();
    assert.equal(moved.deleted_folder_path, '父级 / 子级');
    assert.deepEqual(trash.restore([1]), { restored: [1], adjusted: 0 });
    assert.equal(db.prepare('SELECT folder_id FROM icons WHERE id = 1').get().folder_id, 2);
    trash.move([1]);
    moved.purge_after = db.prepare('SELECT purge_after FROM icons WHERE id = 1').get().purge_after;
    assert.ok(Math.abs(Date.parse(moved.purge_after) - Date.parse(moved.deleted_at) - 30 * 86400000) < 1000);
    db.prepare("UPDATE app_settings SET value = '7'").run();
    assert.equal(trash.move([1]), 0);
    assert.equal(db.prepare('SELECT purge_after FROM icons WHERE id = 1').get().purge_after, moved.purge_after);
    db.prepare('DELETE FROM folders WHERE id = 2').run();
    db.prepare("DELETE FROM categories WHERE name = '原分类'").run();
    assert.deepEqual(trash.restore([1]), { restored: [1], adjusted: 1 });
    const restored = db.prepare('SELECT * FROM icons WHERE id = 1').get();
    assert.equal(restored.folder_id, null);
    assert.equal(restored.category, '');
    assert.equal(restored.created_at, '2025-01-01');
    trash.move([1]);
    assert.ok(Date.parse(db.prepare('SELECT purge_after FROM icons WHERE id = 1').get().purge_after) < Date.parse(moved.purge_after));
    const sharedId = Number(db.prepare("INSERT INTO icons (name, file_path, created_at, updated_at) VALUES ('共享图', '/uploads/shared.svg', '2025', '2025')").run().lastInsertRowid);
    assert.deepEqual(trash.purge([1, sharedId]), { deleted: [1], failed: [] });
    assert.ok(fs.existsSync(path.join(directory, 'shared.svg')));
    trash.move([sharedId]);
    db.prepare("UPDATE icons SET purge_after = '2000-01-01' WHERE id = ?").run(sharedId);
    assert.deepEqual(trash.cleanup().deleted, [sharedId]);
    assert.equal(fs.existsSync(path.join(directory, 'shared.svg')), false);
    fs.mkdirSync(path.join(directory, 'blocked.svg'));
    const blocked = Number(db.prepare("INSERT INTO icons (name, file_path, created_at, updated_at) VALUES ('失败项', '/uploads/blocked.svg', '2025', '2025')").run().lastInsertRowid);
    trash.move([blocked]);
    assert.deepEqual(trash.purge([blocked]), { deleted: [], failed: [blocked] });
    assert.equal(trash.count(), 1);
    fs.rmdirSync(path.join(directory, 'blocked.svg'));
    assert.deepEqual(trash.purge([blocked]), { deleted: [blocked], failed: [] });
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('回收站接口隔离与浏览器恢复、彻底删除、清空及期限设置', { timeout: 90000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-trash-ui-'));
  const dbPath = path.join(directory, 'icons.db');
  const base = 'http://127.0.0.1:3113';
  let server;
  let exited;
  let browser;
  let connection;
  function start() {
    server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: '3113', DB_PATH: dbPath }, stdio: 'ignore' });
    exited = new Promise((resolve) => server.once('exit', resolve));
  }
  async function ready() {
    for (let n = 0; n < 80; n++) {
      try { if ((await fetch(base + '/api/stats')).ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('测试服务未启动');
  }
  async function api(endpoint, method = 'GET', body) {
    const response = await fetch(base + endpoint, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${method} ${endpoint}：${response.status}`);
    return response.json();
  }
  try {
    start();
    await ready();
    connection = new Database(dbPath);
    const folder = await api('/api/folders', 'POST', { name: '恢复文件夹' });
    const category = await api('/api/categories', 'POST', { name: '恢复分类' });
    const icon = await api('/api/icons', 'POST', { name: '恢复样本', folder_id: folder.id, category: category.name });
    const previewPath = `/uploads/__${path.basename(directory)}.svg`;
    connection.prepare('UPDATE icons SET file_path = ? WHERE id = ?').run(previewPath, icon.id);
    await api(`/api/icons/${icon.id}`, 'DELETE');
    for (const [endpoint, method, body] of [
      ['/api/trash/settings', 'PUT', { retentionDays: 0 }],
      ['/api/trash/empty', 'POST', {}],
      ['/api/trash/restore', 'POST', { ids: [] }],
      ['/api/trash', 'DELETE', { ids: [] }],
    ]) {
      assert.equal((await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal((await api('/api/icons')).length, 0);
    assert.equal((await api('/api/stats')).total, 0);
    assert.equal((await api('/api/folders'))[0].icon_count, 0);
    assert.equal((await api('/api/categories'))[0].icon_count, 0);
    assert.equal((await api('/api/export')).icons.length, 0);
    assert.equal((await fetch(base + `/api/icons/${icon.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '不能修改' }) })).status, 404);
    assert.equal((await api('/api/icons/batch/category', 'PATCH', { ids: [icon.id], category: '' })).updated, 0);
    assert.equal((await api('/api/icons/batch/folder', 'PATCH', { ids: [icon.id], folder_id: null })).updated, 0);
    await api(`/api/categories/${category.id}`, 'DELETE');
    await api(`/api/folders/${folder.id}`, 'DELETE');
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route(`**${previewPath}`, (route) => route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'public/favicon.svg')) }));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await expect(page.locator('#trash-count')).toHaveText('1');
    await page.click('#open-trash');
    await expect(page.locator('.trash-row')).toHaveCount(1);
    await expect(page.locator('#library-content')).toBeHidden();
    await expect(page.locator('.trash-details')).toContainText('恢复文件夹');
    await expect(page.locator('#trash-list')).toHaveClass(/trash-list--list/);
    await expect(page.locator('#trash-list-head')).toBeVisible();
    await expect(page.locator('#trash-page-size-trigger')).toHaveText('100');
    const entryBox = await page.locator('#open-trash').boundingBox();
    const statsBox = await page.locator('#sidebar-foot').boundingBox();
    assert.ok(entryBox.y + entryBox.height <= statsBox.y, '回收站入口位于统计栏上方');
    await page.locator('.trash-row .card-thumb').click();
    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('.trash-row input')).not.toBeChecked();
    await page.click('#viewer-close');
    await page.locator('.trash-row .card-name').click();
    await expect(page.locator('.trash-row input')).toBeChecked();
    await expect(page.locator('.trash-row')).toHaveClass(/is-selected/);
    await page.locator('.trash-row').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.trash-row input')).not.toBeChecked();
    if (process.env.TRASH_SCREENSHOT) {
      await page.locator('.trash-row .card-name').click();
      await page.screenshot({ path: process.env.TRASH_SCREENSHOT, fullPage: true, animations: 'disabled' });
      await page.click('#trash-view-grid');
      await page.screenshot({ path: process.env.TRASH_SCREENSHOT.replace('.png', '-grid.png'), fullPage: true, animations: 'disabled' });
      await page.click('#trash-view-list');
      await page.locator('.trash-row .card-name').click();
    }
    await page.click('#trash-retention-trigger');
    await page.getByRole('option', { name: '7 天', exact: true }).click();
    await page.click('#trash-save-settings');
    await expect(page.locator('#toast')).toContainText('保留期限已保存');
    assert.equal((await api('/api/trash/settings')).retentionDays, 7);
    const originalExpiry = (await api('/api/trash')).icons[0].purge_after;
    assert.ok(Date.parse(originalExpiry) > Date.now() + 29 * 86400000);
    await page.click('.trash-restore-one');
    await expect(page.locator('#action-title')).toHaveText('恢复图标');
    await expect(page.locator('#action-cancel')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#action-submit')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#action-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.trash-row')).toHaveCount(1);
    await page.click('.trash-restore-one');
    await page.click('#action-submit');
    await expect(page.locator('.trash-row')).toHaveCount(0);
    await expect(page.locator('#toast')).toContainText('原归属不存在');
    assert.equal((await api('/api/icons'))[0].category, '');
    assert.equal((await api('/api/icons'))[0].created_at, icon.created_at);
    await page.click('#trash-back');
    await expect(page.locator('#grid .card')).toHaveCount(1);
    await page.click('#grid .del');
    await expect(page.locator('#action-title')).toHaveText('移入回收站');
    await expect(page.locator('#action-detail')).not.toContainText('其中 0 个');
    if (process.env.TRASH_SCREENSHOT) await page.screenshot({ path: process.env.TRASH_SCREENSHOT.replace('.png', '-dialog.png'), fullPage: true });
    await page.click('#action-submit');
    await expect(page.locator('#trash-count')).toHaveText('1');
    await page.click('#open-trash');
    await expect(page.locator('.trash-row')).toHaveCount(1);
    await page.click('.trash-delete-one');
    await expect(page.locator('#action-detail')).toContainText('无法撤销');
    await page.click('#action-submit');
    await expect(page.locator('.trash-row')).toHaveCount(0);
    assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM icons').get().n, 0);
    await api('/api/import', 'POST', { icons: Array.from({ length: 102 }, (_, n) => ({ name: `批量回收-${n}` })) });
    const ids = (await api('/api/icons')).map((row) => row.id);
    await api('/api/icons/batch', 'DELETE', { ids });
    await page.click('#open-trash');
    await expect(page.locator('.trash-row')).toHaveCount(100);
    await expect(page.locator('#trash-pagination')).toBeInViewport();
    async function chooseSize(size, count) {
      await page.click('#trash-page-size-trigger');
      await page.getByRole('option', { name: String(size), exact: true }).click();
      await expect(page.locator('.trash-row')).toHaveCount(count);
      await expect(page.locator('#trash-page-numbers .cur')).toHaveText('1');
    }
    await chooseSize(30, 30);
    await page.locator('#trash-page-numbers [data-page="4"]').click();
    await expect(page.locator('.trash-row')).toHaveCount(12);
    await page.locator('.trash-row input').first().check();
    await page.click('#trash-view-grid');
    await expect(page.locator('.trash-row input:checked')).toHaveCount(1);
    await expect(page.locator('#trash-list-head')).toBeHidden();
    await chooseSize(200, 102);
    await expect(page.locator('.trash-row input:checked')).toHaveCount(1);
    await page.reload();
    await page.click('#open-trash');
    await expect(page.locator('.trash-row')).toHaveCount(102);
    await expect(page.locator('#trash-page-size-trigger')).toHaveText('200');
    await expect(page.locator('#trash-view-grid')).toHaveAttribute('aria-pressed', 'true');
    assert.equal(await page.locator('#page-size').inputValue(), '100', '回收站分页偏好不改变图库');
    assert.equal(await page.evaluate(() => localStorage.getItem('iconViewMode')), 'grid');
    await chooseSize(500, 102);
    await chooseSize(50, 50);
    await chooseSize(100, 100);
    await page.click('#trash-view-list');
    await page.locator('.trash-row input').first().check();
    await page.locator('#trash-page-numbers [data-page="2"]').click();
    await expect(page.locator('.trash-row')).toHaveCount(2);
    await page.click('#trash-select-page');
    await expect(page.locator('#trash-selected')).toHaveText('已选 3 个（当前页 2 个）');
    await page.click('#trash-restore');
    await expect(page.locator('#action-detail')).toContainText('其中 1 个不在当前页');
    await page.click('#action-submit');
    await expect(page.locator('#trash-count')).toHaveText('99');
    assert.equal((await api('/api/icons')).length, 3);
    await page.fill('#trash-search', '没有匹配');
    await expect(page.locator('#trash-status')).toContainText('没有匹配');
    let emptyRequests = 0;
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/trash/empty') emptyRequests++; });
    await page.click('#trash-empty');
    await expect(page.locator('#action-dialog input')).toHaveCount(0);
    await expect(page.locator('#action-submit')).toHaveText('清空回收站（5 秒）');
    await expect(page.locator('#action-submit')).toBeDisabled();
    await page.waitForTimeout(1100);
    await page.locator('#action-form').evaluate((form) => form.requestSubmit());
    assert.equal(emptyRequests, 0, '倒计时期间提交表单不能清空回收站');
    await page.setViewportSize({ width: 390, height: 844 });
    const dialogBox = await page.locator('#action-dialog').boundingBox();
    assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390, '小屏确认弹窗不能超出视口');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click('#action-cancel');
    assert.equal((await api('/api/trash/settings')).total, 99);
    await page.click('#trash-empty');
    await expect(page.locator('#action-submit')).toHaveText('清空回收站（5 秒）');
    await expect(page.locator('#action-submit')).toBeDisabled();
    await expect(page.locator('#action-submit')).toBeEnabled({ timeout: 7000 });
    await expect(page.locator('#action-submit')).toHaveText('清空回收站');
    assert.equal(emptyRequests, 0, '倒计时结束不能自动清空');
    await page.click('#action-submit');
    await expect(page.locator('#trash-count')).toHaveText('0');
    assert.equal(emptyRequests, 1);
    assert.equal((await api('/api/icons')).length, 3);
    await expect(page.locator('#trash-batch-bar')).toBeHidden();
    await page.click('#trash-clear-search');
    await expect(page.locator('#trash-empty-title')).toHaveText('回收站为空');
    await expect(page.locator('#trash-empty-state')).toBeVisible();
    await expect(page.locator('#trash-clear-search')).toBeHidden();
    await page.setViewportSize({ width: 1920, height: 1080 });
    const searchBox = await page.locator('.trash-filter-row .search-box').boundingBox();
    const settingsBox = await page.locator('.trash-retention-group').boundingBox();
    assert.ok(searchBox.width <= 360, '大屏搜索框不能无限拉长');
    assert.ok(settingsBox.x - searchBox.x - searchBox.width <= 30, '期限设置应紧邻搜索区域');
    if (process.env.TRASH_SCREENSHOT) await page.screenshot({ path: process.env.TRASH_SCREENSHOT.replace('.png', '-empty.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click('#btn-sidebar-toggle');
    await expect(page.locator('#open-trash')).toBeVisible();
    await expect(page.locator('.trash-entry-label')).toBeHidden();
    assert.deepEqual(errors, []);
    // 重启服务验证到期自动清理，同时保留未到期项与持久化期限。
    const survivors = (await api('/api/icons')).map((row) => row.id);
    await api('/api/icons/batch', 'DELETE', { ids: survivors });
    connection.prepare("UPDATE icons SET purge_after = '2000-01-01' WHERE id = ?").run(survivors[0]);
    server.kill(); await exited;
    start(); await ready();
    assert.equal((await api('/api/trash/settings')).total, 2);
    assert.equal((await api('/api/trash/settings')).retentionDays, 7);
    assert.equal((await api('/api/categories')).length, 0, '重启不得从回收站补种已删除分类');
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill(); await exited; }
    if (connection) connection.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
