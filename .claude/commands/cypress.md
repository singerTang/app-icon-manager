# Cypress E2E 测试助手

帮助在本项目中运行和调试 Cypress E2E 测试。

## 使用方式

当用户说"跑 Cypress"、"cypress 测试"、"打开 cypress" 时，执行以下步骤：

### 1. 确认服务端在运行

检查 3002 端口是否已启动测试专用服务：

```bash
# 在新终端运行（使用独立数据库避免污染）
PORT=3002 DB_PATH=data/cypress-test.db node server.js
```

### 2. 选择运行模式

**交互模式（推荐调试时使用）：**
```bash
npm run cypress:open
```

**无头模式（CI/快速验证）：**
```bash
npm run cypress:run
```

### 3. 查看结果

- 截图（失败时）：`cypress/screenshots/`
- 测试规格：`cypress/e2e/icons.cy.js`
- 配置文件：`cypress.config.js`（端口 3002）

## 注意事项

- Cypress 测试端口为 3002，Playwright E2E 用 3001，主服务用 3000，三者互不干扰
- Cypress 测试会自动通过 API 创建/清理数据，不影响主数据库
- 如需新增测试，在 `cypress/e2e/` 下创建 `*.cy.js` 文件即可
