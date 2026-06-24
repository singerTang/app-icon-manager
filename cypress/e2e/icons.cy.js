// Cypress E2E 测试：覆盖应用图标管理的核心交互流程
// 运行前需在 3002 端口启动服务：PORT=3002 DB_PATH=data/cypress-test.db node server.js

const BASE_API = 'http://localhost:3002/api';

function createIcon(fields) {
  const body = new FormData();
  body.append('name', fields.name);
  body.append('type', fields.type || 'app');
  body.append('category', fields.category || '');
  body.append('tags', fields.tags || '');
  body.append('version', fields.version || '1.0.0');
  body.append('description', fields.description || '');

  return cy.request({
    method: 'POST',
    url: `${BASE_API}/icons`,
    body: {
      name: fields.name,
      type: fields.type || 'app',
      category: fields.category || '',
      tags: fields.tags || '',
      version: fields.version || '1.0.0',
      description: fields.description || '',
    },
    form: true,
  }).its('body');
}

function deleteIcon(id) {
  return cy.request('DELETE', `${BASE_API}/icons/${id}`);
}

// ─── 页面加载 ────────────────────────────────────────────────
describe('页面加载', () => {
  it('显示正确标题与初始空状态', () => {
    cy.visit('/');
    cy.get('h1').should('contain.text', '应用 icon 管理端');
    cy.get('.grid .card').should('have.length', 0);
    cy.get('.empty').should('be.visible');
  });
});

// ─── 新增图标 ────────────────────────────────────────────────
describe('新增图标', () => {
  it('弹窗打开与关闭（关闭按钮）', () => {
    cy.visit('/');
    cy.get('#btn-add').click();
    cy.get('#modal').should('be.visible');
    cy.get('#modal-title').should('contain.text', '新增图标');
    cy.get('#modal-close').click();
    cy.get('#modal').should('not.be.visible');
  });

  it('表单提交新增应用图标，列表出现新卡片', () => {
    cy.visit('/');
    cy.get('#btn-add').click();
    cy.get('#f-name').type('Cypress-应用图标');
    cy.get('#f-type').select('app');
    cy.get('#f-category').type('Cypress测试');
    cy.get('#f-tags').type('e2e,cypress');
    cy.get('#f-version').type('3.0.0');
    cy.get('#form-submit').click();

    cy.get('#modal').should('not.be.visible');
    cy.get('.card-name').should('contain.text', 'Cypress-应用图标');
    cy.get('.tag.type-app').should('be.visible');
    cy.get('#toast').should('contain.text', '已新增');

    cy.request(`${BASE_API}/icons?search=Cypress-应用图标`).its('body').then((icons) => {
      if (icons[0]) deleteIcon(icons[0].id);
    });
  });

  it('名称为空时不允许提交', () => {
    cy.visit('/');
    cy.get('#btn-add').click();
    cy.get('#form-submit').click();
    cy.get('#modal').should('be.visible');
    cy.get('#modal-close').click();
  });
});

// ─── 搜索 ────────────────────────────────────────────────────
describe('搜索功能', () => {
  let iconId;

  before(() => {
    createIcon({ name: 'Cypress-搜索目标', category: '搜索测试', tags: 'findme' }).then((icon) => {
      iconId = icon.id;
    });
  });

  after(() => {
    if (iconId) deleteIcon(iconId);
  });

  it('输入关键词过滤列表', () => {
    cy.visit('/');
    cy.get('#search').type('Cypress-搜索目标');
    cy.wait(400);
    cy.get('.card').should('have.length', 1);
    cy.get('.card-name').should('contain.text', 'Cypress-搜索目标');
  });

  it('无结果时显示空状态', () => {
    cy.visit('/');
    cy.get('#search').type('xyzzy_绝对不存在的名称');
    cy.wait(400);
    cy.get('.empty').should('be.visible');
    cy.get('.card').should('have.length', 0);
  });
});

// ─── 删除图标 ────────────────────────────────────────────────
describe('删除图标', () => {
  it('点击删除，确认弹窗后从列表移除', () => {
    createIcon({ name: 'Cypress-待删除图标', type: 'app' });
    cy.visit('/');
    cy.get('#search').type('Cypress-待删除图标');
    cy.wait(400);
    cy.get('.card').should('have.length', 1);

    cy.on('window:confirm', () => true);
    cy.get('.del').first().click();

    cy.get('.empty').should('be.visible');
    cy.get('#toast').should('contain.text', '已删除');
  });
});
