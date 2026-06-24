// Playwright 配置：有头 Chromium，E2E 测试专用独立服务器（端口 3001，独立数据库）

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test/e2e/report' }]],

  use: {
    headless: false,
    baseURL: 'http://localhost:3001',
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3001',
    timeout: 15000,
    reuseExistingServer: false,
    env: {
      PORT: '3001',
      DB_PATH: 'data/e2e-test.db',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },

  globalSetup: './test/e2e/setup.js',
  globalTeardown: './test/e2e/teardown.js',
});
