// Playwright globalSetup：测试启动前清理残留的 E2E 测试数据库，确保重跑稳定

const { unlink } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../');
const targets = [
  path.join(ROOT, 'data', 'e2e-test.db'),
  path.join(ROOT, 'data', 'e2e-test.db-wal'),
  path.join(ROOT, 'data', 'e2e-test.db-shm'),
];

module.exports = async function globalSetup() {
  for (const f of targets) {
    if (existsSync(f)) await unlink(f).catch(() => {});
  }
};
