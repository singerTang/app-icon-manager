// 后端 API 单元测试
// 使用独立测试数据库 data/unit-test.db，测试完毕后自动清理
// 运行方式：npm run test:unit

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { unlink } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
const TEST_DB = path.join(ROOT, 'data', 'unit-test.db');
const TEST_DB_WAL = TEST_DB + '-wal';
const TEST_DB_SHM = TEST_DB + '-shm';

let serverProcess;

// 轮询直到服务器就绪
async function waitForServer(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('测试服务器启动超时');
}

// 统一请求辅助
async function api(method, endpoint, body) {
  const opts = { method };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${endpoint}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

// 启动测试服务器
before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_PATH: 'data/unit-test.db' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.trim()) console.error('[server-err]', msg.trim());
  });
  await waitForServer(`${BASE}/api/icons`);
});

// 关闭服务器并清理测试数据库
after(async () => {
  serverProcess.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 600));
  for (const f of [TEST_DB, TEST_DB_WAL, TEST_DB_SHM]) {
    if (existsSync(f)) await unlink(f).catch(() => {});
  }
});

// ─── 列表（初始空库）────────────────────────────────────────
describe('GET /api/icons', () => {
  it('初始列表应为空数组', async () => {
    const { status, data } = await api('GET', '/api/icons');
    assert.equal(status, 200);
    assert.deepEqual(data, []);
  });
});

// ─── 新增 ───────────────────────────────────────────────────
describe('POST /api/icons', () => {
  it('缺少 name 字段返回 400', async () => {
    const fd = new FormData();
    fd.append('type', 'app');
    const { status, data } = await api('POST', '/api/icons', fd);
    assert.equal(status, 400);
    assert.ok(data.error, '应有 error 字段');
  });

  it('空白 name 返回 400', async () => {
    const fd = new FormData();
    fd.append('name', '   ');
    const { status } = await api('POST', '/api/icons', fd);
    assert.equal(status, 400);
  });

  it('新增应用图标成功，返回完整字段', async () => {
    const fd = new FormData();
    fd.append('name', '单元测试图标');
    fd.append('type', 'app');
    fd.append('category', '测试分类');
    fd.append('tags', 'test,单元');
    fd.append('version', '2.0.0');
    fd.append('description', '用于单元测试');
    const { status, data } = await api('POST', '/api/icons', fd);
    assert.equal(status, 201);
    assert.equal(data.name, '单元测试图标');
    assert.equal(data.type, 'app');
    assert.equal(data.category, '测试分类');
    assert.equal(data.version, '2.0.0');
    assert.ok(data.id > 0, '应分配自增 id');
    assert.ok(data.created_at, '应有 created_at');
  });

  it('上传 SVG 文件，file_path 与 file_type 正确', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const fd = new FormData();
    fd.append('name', 'SVG测试符号');
    fd.append('type', 'symbol');
    fd.append('file', blob, 'test-icon.svg');
    const { status, data } = await api('POST', '/api/icons', fd);
    assert.equal(status, 201);
    assert.equal(data.file_type, 'svg');
    assert.ok(data.file_path.startsWith('/uploads/'), `file_path 应以 /uploads/ 开头，实际：${data.file_path}`);
  });

  it('不支持的文件类型返回 400', async () => {
    const blob = new Blob(['exe content'], { type: 'application/octet-stream' });
    const fd = new FormData();
    fd.append('name', '非法文件图标');
    fd.append('file', blob, 'malware.exe');
    const { status } = await api('POST', '/api/icons', fd);
    assert.equal(status, 400);
  });
});



// ─── 批量操作 ──────────────────────────────
describe('批量上传与批量操作', () => {
  it('批量上传中文文件名时，名称应保持中文原名', async () => {
    const expectedName = '\u5ba2\u6237\u4e2d\u5fc3';
    const blob = new Blob(['png content'], { type: 'image/png' });
    const fd = new FormData();
    fd.append('files', blob, `${expectedName}.png`);

    const { status, data } = await api('POST', '/api/icons/batch', fd);

    assert.equal(status, 201);
    assert.equal(data.added, 1);
    assert.equal(data.icons[0].name, expectedName);
  });

  it('批量迁移图标所属文件夹', async () => {
    const folder = await api('POST', '/api/folders', { name: '\u6279\u91cf\u8fc1\u79fb\u76ee\u6807' });

    const first = new FormData();
    first.append('name', '\u6279\u91cf\u8fc1\u79fb\u56fe\u6807A');
    first.append('type', 'app');
    const firstIcon = await api('POST', '/api/icons', first);

    const second = new FormData();
    second.append('name', '\u6279\u91cf\u8fc1\u79fb\u56fe\u6807B');
    second.append('type', 'symbol');
    const secondIcon = await api('POST', '/api/icons', second);

    const ids = [firstIcon.data.id, secondIcon.data.id];
    const moved = await api('PATCH', '/api/icons/batch/folder', {
      ids,
      folder_id: folder.data.id,
    });

    assert.equal(moved.status, 200);
    assert.equal(moved.data.updated, 2);

    const list = await api('GET', `/api/icons?folder_id=${folder.data.id}`);
    const movedIds = list.data.map((icon) => icon.id);
    assert.ok(ids.every((id) => movedIds.includes(id)), '\u8fc1\u79fb\u540e\u7684\u6587\u4ef6\u5939\u5e94\u5305\u542b\u4e24\u4e2a\u56fe\u6807');
  });

  it('批量删除图标后，列表中不再包含这些图标', async () => {
    const first = new FormData();
    first.append('name', '\u6279\u91cf\u5220\u9664\u56fe\u6807A');
    first.append('type', 'app');
    const firstIcon = await api('POST', '/api/icons', first);

    const second = new FormData();
    second.append('name', '\u6279\u91cf\u5220\u9664\u56fe\u6807B');
    second.append('type', 'symbol');
    const secondIcon = await api('POST', '/api/icons', second);

    const ids = [firstIcon.data.id, secondIcon.data.id];
    const deleted = await api('DELETE', '/api/icons/batch', { ids });

    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.deleted, 2);

    const list = await api('GET', '/api/icons?search=%E6%89%B9%E9%87%8F%E5%88%A0%E9%99%A4%E5%9B%BE%E6%A0%87');
    assert.ok(list.data.every((icon) => !ids.includes(icon.id)), '\u6279\u91cf\u5220\u9664\u540e\u7684\u56fe\u6807\u4e0d\u5e94\u518d\u51fa\u73b0');
  });
});

// ─── 搜索与筛选 ─────────────────────────────────────────────
describe('GET /api/icons 搜索与筛选', () => {
  it('按名称搜索，结果命中关键词', async () => {
    const { status, data } = await api('GET', '/api/icons?search=单元测试');
    assert.equal(status, 200);
    assert.ok(data.length >= 1, '搜索结果不应为空');
  });

  it('按 tags 搜索，结果命中标签', async () => {
    const { data } = await api('GET', '/api/icons?search=单元');
    assert.ok(data.length >= 1);
  });

  it('按 type=app 筛选，结果全部为 app', async () => {
    const { data } = await api('GET', '/api/icons?type=app');
    assert.ok(data.every((i) => i.type === 'app'), '存在非 app 类型');
  });

  it('按 type=symbol 筛选，结果全部为 symbol', async () => {
    const { data } = await api('GET', '/api/icons?type=symbol');
    assert.ok(data.every((i) => i.type === 'symbol'), '存在非 symbol 类型');
  });

  it('按 category 筛选，结果分类匹配', async () => {
    const { data } = await api('GET', '/api/icons?category=测试分类');
    assert.ok(data.length >= 1);
    assert.ok(data.every((i) => i.category === '测试分类'), '存在分类不匹配的结果');
  });

  it('搜索无结果时返回空数组而非错误', async () => {
    const { status, data } = await api('GET', '/api/icons?search=xyzzy_不存在');
    assert.equal(status, 200);
    assert.deepEqual(data, []);
  });
});

// ─── 编辑 ───────────────────────────────────────────────────
describe('PUT /api/icons/:id', () => {
  let targetId;

  before(async () => {
    const fd = new FormData();
    fd.append('name', '待编辑图标');
    fd.append('type', 'app');
    const { data } = await api('POST', '/api/icons', fd);
    targetId = data.id;
  });

  it('更新名称与版本号', async () => {
    const fd = new FormData();
    fd.append('name', '已编辑图标');
    fd.append('version', '1.1.0');
    const { status, data } = await api('PUT', `/api/icons/${targetId}`, fd);
    assert.equal(status, 200);
    assert.equal(data.name, '已编辑图标');
    assert.equal(data.version, '1.1.0');
  });

  it('更新后 updated_at 已刷新', async () => {
    const { data: before } = await api('GET', `/api/icons?search=已编辑图标`);
    const oldUpdated = before[0]?.updated_at;

    await new Promise((r) => setTimeout(r, 50));

    const fd = new FormData();
    fd.append('name', '已编辑图标');
    fd.append('description', '触发更新时间');
    await api('PUT', `/api/icons/${targetId}`, fd);

    const { data: after } = await api('GET', `/api/icons?search=已编辑图标`);
    assert.notEqual(after[0]?.updated_at, oldUpdated, 'updated_at 应已更新');
  });

  it('编辑不存在的 id 返回 404', async () => {
    const fd = new FormData();
    fd.append('name', '不存在');
    const { status } = await api('PUT', '/api/icons/99999', fd);
    assert.equal(status, 404);
  });
});

// ─── 删除 ───────────────────────────────────────────────────
describe('DELETE /api/icons/:id', () => {
  let targetId;

  before(async () => {
    const fd = new FormData();
    fd.append('name', '待删除图标');
    fd.append('type', 'app');
    const { data } = await api('POST', '/api/icons', fd);
    targetId = data.id;
  });

  it('删除成功，返回 success: true', async () => {
    const { status, data } = await api('DELETE', `/api/icons/${targetId}`);
    assert.equal(status, 200);
    assert.equal(data.success, true);
  });

  it('删除后搜索列表中不再包含该 id', async () => {
    const { data } = await api('GET', '/api/icons?search=待删除图标');
    assert.ok(data.every((i) => i.id !== targetId), '删除后图标仍出现在列表中');
  });

  it('删除不存在的 id 返回 404', async () => {
    const { status } = await api('DELETE', '/api/icons/99999');
    assert.equal(status, 404);
  });
});

// ─── 分类 ───────────────────────────────────────────────────
describe('GET /api/categories', () => {
  it('返回去重后的分类数组', async () => {
    const { status, data } = await api('GET', '/api/categories');
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
    assert.ok(data.includes('测试分类'), `未找到"测试分类"，实际：${JSON.stringify(data)}`);
    assert.equal(new Set(data).size, data.length, '存在重复分类');
  });
});

// ─── 导出 ───────────────────────────────────────────────────
describe('GET /api/export', () => {
  it('导出 JSON 包含 icons 数组与元数据', async () => {
    const res = await fetch(`${BASE}/api/export`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.icons), 'icons 应为数组');
    assert.equal(typeof data.count, 'number');
    assert.ok(data.exported_at, '应有 exported_at');
    assert.equal(data.icons.length, data.count, 'count 与 icons.length 不一致');
  });

  it('Content-Disposition 含文件名', async () => {
    const res = await fetch(`${BASE}/api/export`);
    const cd = res.headers.get('content-disposition') || '';
    assert.ok(cd.includes('icons-export.json'), `Content-Disposition 异常：${cd}`);
  });
});

// ─── 导入 ───────────────────────────────────────────────────
describe('POST /api/import', () => {
  it('导入合法 icons 数组，返回 added 计数', async () => {
    const payload = {
      icons: [
        { name: '导入图标A', type: 'app', category: '导入测试' },
        { name: '导入图标B', type: 'symbol', tags: 'import' },
      ],
    };
    const { status, data } = await api('POST', '/api/import', payload);
    assert.equal(status, 200);
    assert.equal(data.added, 2);
  });

  it('导入后可在列表中搜索到新图标', async () => {
    const { data } = await api('GET', '/api/icons?search=导入图标A');
    assert.ok(data.length >= 1, '导入图标A 未出现在列表');
  });

  it('跳过 name 为空的条目', async () => {
    const before = await (await fetch(`${BASE}/api/icons`)).json();
    await api('POST', '/api/import', { icons: [{ name: '' }, { name: '  ' }, null] });
    const after = await (await fetch(`${BASE}/api/icons`)).json();
    assert.equal(before.length, after.length, '空 name 条目不应被导入');
  });

  it('格式错误（无 icons 字段）返回 400', async () => {
    const { status, data } = await api('POST', '/api/import', { wrong: true });
    assert.equal(status, 400);
    assert.ok(data.error);
  });
});
