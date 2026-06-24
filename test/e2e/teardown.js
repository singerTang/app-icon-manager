// Playwright globalTeardown：清理 E2E 测试数据库

const { unlink } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../');
const targets = [
  path.join(ROOT, 'data', 'e2e-test.db'),
  path.join(ROOT, 'data', 'e2e-test.db-wal'),
  path.join(ROOT, 'data', 'e2e-test.db-shm'),
];

module.exports = async function globalTeardown() {
  for (const f of targets) {
    if (existsSync(f)) await unlink(f).catch(() => {});
  }
};
