// Playwright E2E 测试：有头 Chromium，覆盖核心 UI 交互流程
// 测试前通过 API 构造数据，测试间互相隔离

const { test, expect } = require('@playwright/test');

const BASE_API = 'http://localhost:3001/api';

// 通过 API 新增图标（绕过 UI，直接准备数据）
async function createIcon(request, fields) {
  const res = await request.post(`${BASE_API}/icons`, {
    multipart: {
      name: fields.name,
      type: fields.type || 'app',
      category: fields.category || '',
      tags: fields.tags || '',
      version: fields.version || '1.0.0',
      description: fields.description || '',
    },
  });
  return res.json();
}

// 通过 API 删除图标
async function deleteIcon(request, id) {
  await request.delete(`${BASE_API}/icons/${id}`);
}

// ─── 基础页面 ────────────────────────────────────────────────
test.describe('页面加载', () => {
  test('显示正确标题与初始空状态', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('应用 icon 管理端');
    await expect(page.locator('.empty')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(0);
  });
});

// ─── 新增图标 ────────────────────────────────────────────────
test.describe('新增图标', () => {
  test('弹窗打开与关闭（关闭按钮）', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-add');
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('新增图标');
    await page.click('#modal-close');
    await expect(page.locator('#modal')).toBeHidden();
  });

  test('弹窗点击遮罩关闭', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-add');
    await expect(page.locator('#modal')).toBeVisible();
    await page.locator('#modal').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#modal')).toBeHidden();
  });

  test('表单提交新增应用图标，列表出现新卡片', async ({ page, request }) => {
    await page.goto('/');

    await page.click('#btn-add');
    await page.fill('#f-name', 'E2E-应用图标');
    await page.selectOption('#f-type', 'app');
    await page.fill('#f-category', 'E2E测试');
    await page.fill('#f-tags', 'e2e,playwright');
    await page.fill('#f-version', '3.0.0');
    await page.click('#form-submit');

    await expect(page.locator('#modal')).toBeHidden();
    await expect(page.locator('.card-name')).toContainText('E2E-应用图标');
    await expect(page.locator('.tag.type-app')).toBeVisible();

    // Toast 提示出现
    await expect(page.locator('#toast')).toContainText('已新增');

    // 清理
    const icon = await (await fetch(`${BASE_API}/icons?search=E2E-应用图标`)).json();
    if (icon[0]) await deleteIcon(request, icon[0].id);
  });

  test('新增 SVG 符号，展示 symbol 类型标签', async ({ page, request }) => {
    await page.goto('/');

    await page.click('#btn-add');
    await page.fill('#f-name', 'E2E-SVG符号');
    await page.selectOption('#f-type', 'symbol');
    await page.click('#form-submit');

    await expect(page.locator('#modal')).toBeHidden();
    await expect(page.locator('.tag.type-symbol')).toBeVisible();

    const icon = await (await fetch(`${BASE_API}/icons?search=E2E-SVG符号`)).json();
    if (icon[0]) await deleteIcon(request, icon[0].id);
  });

  test('名称为空时不允许提交', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-add');
    // 直接点提交，name 为空
    await page.click('#form-submit');
    // 弹窗仍可见（浏览器原生校验或服务端拦截）
    await expect(page.locator('#modal')).toBeVisible();
    await page.click('#modal-close');
  });
});

// ─── 搜索 ────────────────────────────────────────────────────
test.describe('搜索功能', () => {
  let iconId;

  test.beforeAll(async ({ request }) => {
    const icon = await createIcon(request, { name: 'E2E-搜索目标', category: '搜索测试', tags: 'findme' });
    iconId = icon.id;
  });

  test.afterAll(async ({ request }) => {
    if (iconId) await deleteIcon(request, iconId);
  });

  test('输入关键词过滤列表', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search', 'E2E-搜索目标');
    await page.waitForTimeout(400);
    await expect(page.locator('.card')).toHaveCount(1);
    await expect(page.locator('.card-name')).toContainText('E2E-搜索目标');
  });

  test('无结果时显示空状态', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search', 'xyzzy_绝对不存在的名称');
    await page.waitForTimeout(400);
    await expect(page.locator('.empty')).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(0);
  });

  test('清空搜索框恢复全部列表', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search', 'E2E-搜索目标');
    await page.waitForTimeout(400);
    await page.fill('#search', '');
    await page.waitForTimeout(400);
    const count = await page.locator('.card').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── 类型筛选 ────────────────────────────────────────────────
test.describe('类型筛选', () => {
  let appId, symbolId;

  test.beforeAll(async ({ request }) => {
    const a = await createIcon(request, { name: 'E2E-筛选App', type: 'app' });
    const s = await createIcon(request, { name: 'E2E-筛选Symbol', type: 'symbol' });
    appId = a.id;
    symbolId = s.id;
  });

  test.afterAll(async ({ request }) => {
    if (appId) await deleteIcon(request, appId);
    if (symbolId) await deleteIcon(request, symbolId);
  });

  test('选择"应用图标"只显示 app 类型卡片', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#filter-type', 'app');
    await page.waitForLoadState('networkidle');
    const tags = page.locator('.tag.type-symbol');
    await expect(tags).toHaveCount(0);
  });

  test('选择"SVG 符号"只显示 symbol 类型卡片', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#filter-type', 'symbol');
    await page.waitForLoadState('networkidle');
    const tags = page.locator('.tag.type-app');
    await expect(tags).toHaveCount(0);
  });
});

// ─── 编辑图标 ───────────────────────��────────────────────────
test.describe('编辑图标', () => {
  let iconId;

  test.beforeAll(async ({ request }) => {
    const icon = await createIcon(request, { name: 'E2E-待编辑', type: 'app', version: '1.0.0' });
    iconId = icon.id;
  });

  test.afterAll(async ({ request }) => {
    if (iconId) await deleteIcon(request, iconId);
  });

  test('点击编辑按钮弹窗标题为"编辑图标"，回填名称', async ({ page }) => {
    await page.goto('/');
    await page.locator('.edit').first().click();
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('编辑图标');
    await expect(page.locator('#f-name')).not.toHaveValue('');
  });

  test('修改名称后保存，卡片显示更新后名称', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search', 'E2E-待编辑');
    await page.waitForTimeout(400);

    await page.locator('.edit').first().click();
    await page.fill('#f-name', 'E2E-已编辑');
    await page.fill('#f-version', '2.0.0');
    await page.click('#form-submit');

    await expect(page.locator('#modal')).toBeHidden();
    await expect(page.locator('.card-name').first()).toContainText('E2E-已编辑');
    await expect(page.locator('#toast')).toContainText('已更新');
  });
});

// ─── 删除图标 ────────────────────────────────────────────────
test.describe('删除图标', () => {
  test('点击删除，确认弹窗后从列表移除', async ({ page, request }) => {
    // 先创建一个用于删除的图标
    await createIcon(request, { name: 'E2E-待删除图标', type: 'app' });
    await page.goto('/');
    await page.fill('#search', 'E2E-待删除图标');
    await page.waitForTimeout(400);

    const countBefore = await page.locator('.card').count();
    expect(countBefore).toBe(1);

    // 监听 dialog，自动确认
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.del').first().click();

    await page.waitForLoadState('networkidle');
    await expect(page.locator('.empty')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('已删除');
  });

  test('取消删除确认，图标保留', async ({ page, request }) => {
    const icon = await createIcon(request, { name: 'E2E-不删除图标', type: 'app' });
    await page.goto('/');
    await page.fill('#search', 'E2E-不删除图标');
    await page.waitForTimeout(400);

    // 拒绝 dialog
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('.del').first().click();

    await page.waitForTimeout(300);
    await expect(page.locator('.card')).toHaveCount(1);

    // 清理
    await deleteIcon(request, icon.id);
  });
});

// ─── 预览弹窗 ────────────────────────────────────────────────
test.describe('预览弹窗', () => {
  let iconId;

  test.beforeAll(async ({ request }) => {
    const icon = await createIcon(request, {
      name: 'E2E-预览图标',
      type: 'app',
      category: '预览测试',
      version: '9.9.9',
    });
    iconId = icon.id;
  });

  test.afterAll(async ({ request }) => {
    if (iconId) await deleteIcon(request, iconId);
  });

  test('点击缩略图打开预览弹窗，显示元数据', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search', 'E2E-预览图标');
    await page.waitForTimeout(400);

    await page.locator('.card-thumb').first().click();
    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('#viewer-meta')).toContainText('E2E-预览图标');
    await expect(page.locator('#viewer-meta')).toContainText('9.9.9');
  });

  test('点击关闭按钮收起预览', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search', 'E2E-预览图标');
    await page.waitForTimeout(400);
    await page.locator('.card-thumb').first().click();
    await page.click('#viewer-close');
    await expect(page.locator('#viewer')).toBeHidden();
  });

  test('点击预览弹窗遮罩收起', async ({ page }) => {
    await page.goto('/');
    await page.fill('#search', 'E2E-预览图标');
    await page.waitForTimeout(400);
    await page.locator('.card-thumb').first().click();
    await expect(page.locator('#viewer')).toBeVisible();
    await page.locator('#viewer').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('#viewer')).toBeHidden();
  });
});
