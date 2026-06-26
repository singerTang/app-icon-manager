// 前端逻辑：REST API 管理图标，含文件夹树、批量上传、拖拽

const API = '/api/icons';

// 内联 SVG 图标表（Lucide 风格，统一 .icon 描边规格）
const ICONS = {
  layers: '<svg class="icon" viewBox="0 0 24 24"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>',
  folder: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  pencil: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  chevronLeft: '<svg class="icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight: '<svg class="icon" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
};

// DOM 引用
const grid = document.getElementById('grid');
const emptyTip = document.getElementById('empty');
const statEl = document.getElementById('stat');
const searchInput = document.getElementById('search');
const filterType = document.getElementById('filter-type');
const filterCategory = document.getElementById('filter-category');

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const form = document.getElementById('icon-form');
const fId = document.getElementById('f-id');
const fName = document.getElementById('f-name');
const fType = document.getElementById('f-type');
const fVersion = document.getElementById('f-version');
const fFolder = document.getElementById('f-folder');
const fCategory = document.getElementById('f-category');
const fTags = document.getElementById('f-tags');
const fDescription = document.getElementById('f-description');
const fFile = document.getElementById('f-file');
const previewEl = document.getElementById('preview');

const btnManageCat = document.getElementById('btn-manage-cat');
const categoryModal = document.getElementById('category-modal');
const catNewInput = document.getElementById('cat-new-input');
const catAddBtn = document.getElementById('cat-add-btn');
const categoryList = document.getElementById('category-list');

const iconPickerModal = document.getElementById('icon-picker-modal');
const pickerTitle = document.getElementById('picker-title');
const pickerSearch = document.getElementById('picker-search');
const pickerGrid = document.getElementById('picker-grid');
const pickerEmpty = document.getElementById('picker-empty');
const pickerSelected = document.getElementById('picker-selected');

const viewer = document.getElementById('viewer');
const viewerBody = document.getElementById('viewer-body');
const viewerMeta = document.getElementById('viewer-meta');
const viewerActions = document.getElementById('viewer-actions');

const folderModal = document.getElementById('folder-modal');
const folderModalTitle = document.getElementById('folder-modal-title');
const folderNameInput = document.getElementById('folder-name-input');

const batchModal = document.getElementById('batch-modal');
const batchProgressList = document.getElementById('batch-progress-list');
const batchSummary = document.getElementById('batch-summary');

const dropZone = document.getElementById('drop-zone');
const dropHint = document.getElementById('drop-hint');
const batchFileInput = document.getElementById('batch-file');
const zipFileInput = document.getElementById('zip-file');
const toastEl = document.getElementById('toast');
const folderTree = document.getElementById('folder-tree');
const batchActions = document.getElementById('batch-actions');
const batchSelectedCount = document.getElementById('batch-selected-count');
const batchFolderSelect = document.getElementById('batch-folder-select');
const btnBatchToggleAll = document.getElementById('btn-batch-toggle-all');
const btnBatchMove = document.getElementById('btn-batch-move');
const btnBatchDownload = document.getElementById('btn-batch-download');
const btnBatchDelete = document.getElementById('btn-batch-delete');
const btnBatchClear = document.getElementById('btn-batch-clear');

const sidebar = document.getElementById('sidebar');
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
const sidebarTotal = document.getElementById('sidebar-total');

const pagination = document.getElementById('pagination');
const pageSizeSelect = document.getElementById('page-size');
const pagePrev = document.getElementById('page-prev');
const pageNext = document.getElementById('page-next');
const pageNumbers = document.getElementById('page-numbers');
const pageTotal = document.getElementById('page-total');

const viewGrid = document.getElementById('view-grid');
const viewList = document.getElementById('view-list');

let debounceTimer = null;
let currentFolderId = null;        // null = 全部图标
let folderModalCallback = null;    // resolve({ name }) 或 null
let allFolders = [];               // 最近一次从 API 获取的文件夹列表
let allCategories = [];            // 最近一次从 API 获取的分类字典 [{id,name,icon_count}]
let pickerCategoryName = '';       // 图标选择器当前所属分类名
let pickerAllIcons = [];           // 选择器中的全部图标
let pickerInitialIds = new Set();  // 打开选择器时已属于该分类的图标 id（用于 diff）
let pickerCheckedIds = new Set();  // 选择器中当前勾选的图标 id
let collapsedFolders = new Set();  // 已折叠的文件夹 id，重渲染时保持折叠状态
let dragCounter = 0;               // 拖拽进入计数，防止子元素触发闪烁
let selectedIconIds = new Set();    // 当前列表中已勾选的图标 id
let currentPage = 1;               // 当前页码
let pageSize = 50;                 // 每页条数（30/50/100）
let totalCount = 0;                // 当前筛选下的图标总数
let viewMode = localStorage.getItem('iconViewMode') === 'list' ? 'list' : 'grid'; // 展示方式

// ─── 工具函数 ──────────────────────────────────────────────

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// 统一 fetch 封装：检查 res.ok、解析 JSON，失败时抛出可读错误
async function apiFetch(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (_) {
    throw new Error('网络请求失败，请检查连接');
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (_) { /* 非 JSON 响应 */ }
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `请求失败（${res.status}）`);
  }
  return data;
}

function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = 'toast' + (isError ? ' error' : '');
  toastEl.hidden = false;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 2400);
}



function getVisibleIconIds() {
  return [...grid.querySelectorAll('.card-select input')].map((input) => String(input.dataset.id));
}

function isAllVisibleSelected() {
  const visibleIds = getVisibleIconIds();
  return visibleIds.length > 0 && visibleIds.every((id) => selectedIconIds.has(id));
}

function updateSelectAllButton() {
  btnBatchToggleAll.textContent = isAllVisibleSelected() ? '取消全选' : '全选当前页';
}

function toggleSelectAll() {
  const visibleIds = getVisibleIconIds();
  if (!visibleIds.length) return;
  const shouldClear = isAllVisibleSelected();
  for (const id of visibleIds) {
    if (shouldClear) selectedIconIds.delete(id);
    else selectedIconIds.add(id);
  }
  grid.querySelectorAll('.card-select input').forEach((input) => {
    input.checked = selectedIconIds.has(String(input.dataset.id));
  });
  updateBatchActions();
}

function updateBatchActions() {
  // 操作栏常驻显示，未选中时计数为 0 且操作按钮禁用
  const count = selectedIconIds.size;
  batchSelectedCount.textContent = `已选 ${count} 个`;
  btnBatchMove.disabled = count === 0;
  btnBatchDownload.disabled = count === 0;
  btnBatchDelete.disabled = count === 0;
  btnBatchClear.disabled = count === 0;
  updateSelectAllButton();
}

function clearSelection() {
  selectedIconIds.clear();
  grid.querySelectorAll('.card-select input').forEach((input) => {
    input.checked = false;
  });
  updateBatchActions();
}

function setSelectedIcon(id, checked) {
  if (checked) selectedIconIds.add(String(id));
  else selectedIconIds.delete(String(id));
  updateBatchActions();
}

function populateBatchFolderSelect() {
  const current = batchFolderSelect.value;
  batchFolderSelect.innerHTML = '<option value="">无文件夹</option>';
  for (const f of allFolders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    batchFolderSelect.appendChild(opt);
  }
  batchFolderSelect.value = current;
}

function typeLabel(type) {
  return type === 'symbol' ? 'SVG' : '图片';
}

function thumbHtml(icon) {
  if (!icon.file_path) return '<span class="no-img">无图</span>';
  return `<img src="${esc(icon.file_path)}" alt="${esc(icon.name)}" loading="lazy" />`;
}

// ─── 文件夹树 ──────────────────────────────────────────────

async function loadFolders() {
  const res = await fetch('/api/folders');
  allFolders = await res.json();
  renderFolderTree();
  populateFolderSelect();
  populateBatchFolderSelect();
}

// 拉取全局统计，更新「全部图标」计数与侧栏底部总数
async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  sidebarTotal.textContent = stats.total;
  const allCount = document.querySelector('.folder-item[data-id=""] .folder-count');
  if (allCount) allCount.textContent = stats.total;
}

function renderFolderTree() {
  folderTree.innerHTML = '';

  // 根节点：全部图标
  const allItem = document.createElement('li');
  allItem.className = 'folder-item' + (currentFolderId === null ? ' active' : '');
  allItem.dataset.id = '';
  allItem.title = '全部图标';
  allItem.innerHTML = `
    <span class="folder-icon">${ICONS.layers}</span>
    <span class="folder-name">全部图标</span>
    <span class="folder-count">${sidebarTotal.textContent || 0}</span>
  `;
  allItem.addEventListener('click', () => selectFolder(null));
  folderTree.appendChild(allItem);

  // 递归构建子树
  renderTreeNodes(folderTree, null, allFolders, 0);
}

// 收集某文件夹及其所有后代的 id（含自身）
function collectFolderIds(folderId, folders) {
  const result = [folderId];
  folders.filter((f) => f.parent_id === folderId).forEach((c) => {
    result.push(...collectFolderIds(c.id, folders));
  });
  return result;
}

// 递归累加某文件夹及其所有后代的图标总数
function totalIconCount(folderId, folders) {
  const children = folders.filter((f) => f.parent_id === folderId);
  return folders.find((f) => f.id === folderId)?.icon_count || 0
    + children.reduce((sum, c) => sum + totalIconCount(c.id, folders), 0);
}

function renderTreeNodes(parentEl, parentId, folders, depth) {
  const children = folders.filter(
    (f) => (f.parent_id === parentId) || (parentId === null && !f.parent_id)
  );
  if (!children.length) return;

  for (const folder of children) {
    const hasChildren = folders.some((f) => f.parent_id === folder.id);
    const collapsed = collapsedFolders.has(folder.id);

    // 节点容器：承载「行内容 + 子级列表」，避免子 ul 被当作行的 flex 子项横排
    const node = document.createElement('li');
    node.className = 'folder-node' + (collapsed ? ' collapsed' : '');

    const row = document.createElement('div');
    row.className = 'folder-item' + (currentFolderId === folder.id ? ' active' : '');
    row.dataset.id = folder.id;
    row.title = folder.name;
    row.style.setProperty('--depth', depth);
    row.innerHTML = `
      <span class="folder-toggle">${hasChildren ? ICONS.chevronRight : ''}</span>
      <span class="folder-icon">${ICONS.folder}</span>
      <span class="folder-name">${esc(folder.name)}</span>
      <span class="folder-count">${totalIconCount(folder.id, folders)}</span>
      <span class="folder-actions">
        <button class="folder-action-btn" data-action="rename" title="重命名">${ICONS.pencil}</button>
        <button class="folder-action-btn" data-action="add-sub" title="新建子文件夹">${ICONS.plus}</button>
        <button class="folder-action-btn" data-action="delete" title="删除">${ICONS.trash}</button>
      </span>
    `;
    if (hasChildren) {
      row.querySelector('.folder-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolder(folder.id);
      });
    }
    row.querySelector('.folder-name').addEventListener('click', () => selectFolder(folder.id));
    row.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
      e.stopPropagation();
      promptFolderModal('重命名文件夹', folder.name).then((name) => {
        if (name) renameFolder(folder.id, name);
      });
    });
    row.querySelector('[data-action="add-sub"]').addEventListener('click', (e) => {
      e.stopPropagation();
      promptFolderModal('新建子文件夹').then((name) => {
        if (name) {
          collapsedFolders.delete(folder.id); // 新建后展开父级，确保新子级可见
          createFolder(name, folder.id);
        }
      });
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFolder(folder.id, folder.name);
    });
    node.appendChild(row);

    if (hasChildren) {
      const childUl = document.createElement('ul');
      childUl.className = 'folder-children';
      node.appendChild(childUl);
      renderTreeNodes(childUl, folder.id, folders, depth + 1);
    }
    parentEl.appendChild(node);
  }
}

// 切换文件夹折叠状态：仅更新对应节点的 class，避免全量重建整棵树
function toggleFolder(id) {
  const collapsed = collapsedFolders.has(id);
  if (collapsed) {
    collapsedFolders.delete(id);
  } else {
    collapsedFolders.add(id);
  }
  const row = folderTree.querySelector(`.folder-item[data-id="${id}"]`);
  const node = row && row.closest('.folder-node');
  if (node) {
    node.classList.toggle('collapsed', !collapsed);
  } else {
    renderFolderTree(); // 兜底：找不到节点时回退全量渲染
  }
}

function selectFolder(folderId) {
  currentFolderId = folderId;
  currentPage = 1;
  clearSelection();
  renderFolderTree();
  loadIcons();
}

// 文件夹弹窗（Promise 化）
function promptFolderModal(title, defaultValue) {
  return new Promise((resolve) => {
    folderModalTitle.textContent = title;
    folderNameInput.value = defaultValue || '';
    folderModal.hidden = false;
    folderNameInput.focus();
    folderModalCallback = resolve;
  });
}

function closeFolderModal(result) {
  folderModal.hidden = true;
  if (folderModalCallback) {
    folderModalCallback(result || null);
    folderModalCallback = null;
  }
}

document.getElementById('folder-confirm').addEventListener('click', () => {
  const name = folderNameInput.value.trim();
  closeFolderModal(name || null);
});

document.getElementById('folder-cancel').addEventListener('click', () => closeFolderModal(null));
document.getElementById('folder-modal-close').addEventListener('click', () => closeFolderModal(null));

// 键盘事件绑定到弹窗容器，并以 hidden 状态守卫，避免关闭后误触发
folderModal.addEventListener('keydown', (e) => {
  if (folderModal.hidden) return;
  if (e.key === 'Enter') {
    const name = folderNameInput.value.trim();
    closeFolderModal(name || null);
  }
  if (e.key === 'Escape') closeFolderModal(null);
});

async function createFolder(name, parentId) {
  try {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parentId || null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '创建失败');
    toast(`已创建文件夹「${name}」`);
    await loadFolders();
  } catch (err) {
    toast(err.message, true);
  }
}

async function renameFolder(id, name) {
  try {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '重命名失败');
    toast('已重命名');
    await loadFolders();
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteFolder(id, name) {
  if (!confirm(`删除文件夹「${name}」？其中的图标将移至「全部图标」，不会被删除。`)) return;
  try {
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '删除失败');
    if (currentFolderId === id) currentFolderId = null;
    collapsedFolders.delete(id); // 清理折叠状态，避免残留 id 与未来新建文件夹碰撞
    toast('已删除文件夹');
    await loadFolders();
    await loadIcons();
  } catch (err) {
    toast(err.message, true);
  }
}

document.getElementById('btn-new-folder').addEventListener('click', () => {
  promptFolderModal('新建文件夹').then((name) => {
    if (name) createFolder(name, null);
  });
});

// 向表单文件夹下拉填充选项
function populateFolderSelect() {
  const current = fFolder.value;
  fFolder.innerHTML = '<option value="">不归属任何文件夹</option>';
  for (const f of allFolders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    fFolder.appendChild(opt);
  }
  fFolder.value = current;
}

// ─── 图标列表 ──────────────────────────────────────────────

async function loadIcons() {
  const params = new URLSearchParams({
    search: searchInput.value.trim(),
    type: filterType.value,
    category: filterCategory.value,
    page: currentPage,
    pageSize,
  });
  if (currentFolderId !== null) {
    // 收集当前文件夹及其所有后代 id，一并查询以展示子级图标
    const ids = collectFolderIds(currentFolderId, allFolders);
    params.set('folder_ids', ids.join(','));
  }
  let data;
  try {
    data = await apiFetch(`${API}?${params}`);
  } catch (err) {
    toast(err.message, true);
    return;
  }
  const icons = data.icons;
  totalCount = data.total;
  // 服务端可能因越界回退页码，以返回值为准
  currentPage = data.page;

  grid.innerHTML = '';
  statEl.textContent = `共 ${totalCount} 个图标`;
  emptyTip.hidden = icons.length > 0;
  renderPagination();

  for (const icon of icons) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <label class="card-select" title="选择图标">
        <input type="checkbox" data-id="${icon.id}" ${selectedIconIds.has(String(icon.id)) ? 'checked' : ''} />
      </label>
      <div class="card-thumb" data-id="${icon.id}">
        ${thumbHtml(icon)}
        <span class="type-badge type-badge-${icon.type === 'symbol' ? 'symbol' : 'app'}" title="${esc(typeLabel(icon.type))}">${icon.type === 'symbol' ? 'SVG' : '图片'}</span>
      </div>
      <div class="card-name" title="${esc(icon.name)}">${esc(icon.name)}</div>
      <div class="card-meta">
        ${icon.category
          ? `<span class="tag">${esc(icon.category)}</span>`
          : '<span class="tag tag-muted">未分类</span>'}
      </div>
      <div class="card-actions">
        <button class="edit" data-id="${icon.id}" title="编辑" aria-label="编辑">${ICONS.pencil}</button>
        <button class="del" data-id="${icon.id}" title="删除" aria-label="删除">${ICONS.trash}</button>
      </div>
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll('.card-select input').forEach((el) =>
    el.addEventListener('change', () => setSelectedIcon(el.dataset.id, el.checked))
  );
  grid.querySelectorAll('.card-thumb').forEach((el) =>
    el.addEventListener('click', () => openViewer(findIcon(icons, el.dataset.id)))
  );
  grid.querySelectorAll('.edit').forEach((el) =>
    el.addEventListener('click', () => openModal(findIcon(icons, el.dataset.id)))
  );
  grid.querySelectorAll('.del').forEach((el) =>
    el.addEventListener('click', () => removeIcon(findIcon(icons, el.dataset.id)))
  );
  updateBatchActions();
}

// 渲染分页栏：无数据时隐藏，更新页码信息与边界按钮可用状态
function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  pagination.hidden = totalCount === 0;
  pageTotal.textContent = totalCount;
  pagePrev.disabled = currentPage <= 1;
  pageNext.disabled = currentPage >= totalPages;
  pageNumbers.innerHTML = buildPageItems(currentPage, totalPages)
    .map((item) => item === '...'
      ? '<span class="pg-dots">…</span>'
      : `<button type="button" class="pg-num${item === currentPage ? ' cur' : ''}" data-page="${item}">${item}</button>`)
    .join('');
}

// 生成页码序列：总页数≤7 全展开；否则保留首页、末页、当前页±1，其余折叠为省略号
function buildPageItems(cur, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items = [1];
  const left = Math.max(2, cur - 1);
  const right = Math.min(total - 1, cur + 1);
  if (left > 2) items.push('...');
  for (let p = left; p <= right; p++) items.push(p);
  if (right < total - 1) items.push('...');
  items.push(total);
  return items;
}

function goToPage(page) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const target = Math.min(Math.max(1, page), totalPages);
  if (target === currentPage) return;
  currentPage = target;
  loadIcons();
}

// 切换网格/列表展示方式，并记住偏好
function setViewMode(mode) {
  viewMode = mode === 'list' ? 'list' : 'grid';
  localStorage.setItem('iconViewMode', viewMode);
  grid.classList.toggle('grid--list', viewMode === 'list');
  viewGrid.classList.toggle('active', viewMode === 'grid');
  viewList.classList.toggle('active', viewMode === 'list');
}

function findIcon(list, id) {
  return list.find((i) => String(i.id) === String(id));
}

async function loadCategories() {
  const res = await fetch('/api/categories');
  allCategories = await res.json();

  // 顶部筛选下拉：保留当前选中
  const currentFilter = filterCategory.value;
  filterCategory.innerHTML = '<option value="">全部分类</option>';
  // 表单分类下拉：首项「无分类」，保留当前选中
  const currentForm = fCategory.value;
  fCategory.innerHTML = '<option value="">无分类</option>';

  for (const c of allCategories) {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    filterCategory.appendChild(opt);

    const opt2 = document.createElement('option');
    opt2.value = c.name;
    opt2.textContent = c.name;
    fCategory.appendChild(opt2);
  }
  filterCategory.value = currentFilter;
  fCategory.value = currentForm;
}

// ─── 分类字典管理 ──────────────────────────────────────────

function openCategoryModal() {
  catNewInput.value = '';
  renderCategoryList();
  categoryModal.hidden = false;
  catNewInput.focus();
}

function renderCategoryList() {
  categoryList.innerHTML = '';
  if (!allCategories.length) {
    const empty = document.createElement('li');
    empty.className = 'category-empty';
    empty.textContent = '暂无分类，请在上方新增';
    categoryList.appendChild(empty);
    return;
  }
  for (const c of allCategories) {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.innerHTML = `
      <span class="category-dot"></span>
      <span class="category-name" title="${esc(c.name)}">${esc(c.name)}</span>
      <span class="category-count" title="${c.icon_count} 个图标">${c.icon_count}</span>
      <span class="category-actions">
        <button class="btn btn-ghost btn-sm" data-action="manage">管理图标</button>
        <button class="folder-action-btn" data-action="rename" title="重命名">${ICONS.pencil}</button>
        <button class="folder-action-btn" data-action="delete" title="删除">${ICONS.trash}</button>
      </span>
    `;
    li.querySelector('[data-action="manage"]').addEventListener('click', () => openIconPicker(c));
    li.querySelector('[data-action="rename"]').addEventListener('click', () => {
      promptFolderModal('重命名分类', c.name).then((name) => {
        if (name && name !== c.name) renameCategory(c.id, name);
      });
    });
    li.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCategory(c));
    categoryList.appendChild(li);
  }
}

async function createCategory(name) {
  try {
    await apiFetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    toast(`已新增分类「${name}」`);
    catNewInput.value = '';
    await loadCategories();
    renderCategoryList();
  } catch (err) {
    toast(err.message, true);
  }
}

async function renameCategory(id, name) {
  try {
    await apiFetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    toast('已重命名分类');
    await loadCategories();
    renderCategoryList();
    await loadIcons(); // 级联后图标卡片分类标签需刷新
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteCategory(cat) {
  if (!confirm(`确定删除分类「${cat.name}」吗？`)) return;
  try {
    await apiFetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
    toast('已删除分类');
    await loadCategories();
    renderCategoryList();
  } catch (err) {
    toast(err.message, true);
  }
}

// ─── 图标选择器：为某分类批量归类图标 ──────────────────────

async function openIconPicker(cat) {
  pickerCategoryName = cat.name;
  pickerTitle.textContent = `管理「${cat.name}」的图标`;
  pickerSearch.value = '';
  iconPickerModal.hidden = false;
  pickerGrid.innerHTML = '<div class="picker-loading">加载中…</div>';
  pickerEmpty.hidden = true;

  try {
    // 不带 page 参数 → 接口返回全部图标数组
    pickerAllIcons = await apiFetch(API);
  } catch (err) {
    toast(err.message, true);
    pickerAllIcons = [];
  }
  // 初始勾选 = 当前已属于该分类的图标
  pickerInitialIds = new Set(
    pickerAllIcons.filter((i) => i.category === pickerCategoryName).map((i) => String(i.id))
  );
  pickerCheckedIds = new Set(pickerInitialIds);
  renderPickerGrid();
}

function renderPickerGrid() {
  const kw = pickerSearch.value.trim().toLowerCase();
  const list = kw
    ? pickerAllIcons.filter((i) => String(i.name).toLowerCase().includes(kw))
    : pickerAllIcons;

  pickerGrid.innerHTML = '';
  pickerEmpty.hidden = list.length > 0;

  for (const icon of list) {
    const id = String(icon.id);
    const checked = pickerCheckedIds.has(id);
    const cell = document.createElement('label');
    cell.className = 'picker-cell' + (checked ? ' checked' : '');
    cell.innerHTML = `
      <input type="checkbox" data-id="${id}" ${checked ? 'checked' : ''} />
      <span class="picker-check">${ICONS.check}</span>
      <div class="picker-thumb">${thumbHtml(icon)}</div>
      <div class="picker-name" title="${esc(icon.name)}">${esc(icon.name)}</div>
    `;
    const input = cell.querySelector('input');
    input.addEventListener('change', () => {
      if (input.checked) pickerCheckedIds.add(id);
      else pickerCheckedIds.delete(id);
      cell.classList.toggle('checked', input.checked);
      updatePickerSelected();
    });
    pickerGrid.appendChild(cell);
  }
  updatePickerSelected();
}

function updatePickerSelected() {
  pickerSelected.textContent = `已选 ${pickerCheckedIds.size} 个`;
}

async function savePicker() {
  // 与初始状态对比：新增勾选 → 加入该分类；取消勾选 → 移出（置空）
  const toAdd = [...pickerCheckedIds].filter((id) => !pickerInitialIds.has(id)).map(Number);
  const toRemove = [...pickerInitialIds].filter((id) => !pickerCheckedIds.has(id)).map(Number);

  if (!toAdd.length && !toRemove.length) {
    iconPickerModal.hidden = true;
    return;
  }

  try {
    if (toAdd.length) {
      await apiFetch('/api/icons/batch/category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: toAdd, category: pickerCategoryName }),
      });
    }
    if (toRemove.length) {
      await apiFetch('/api/icons/batch/category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: toRemove, category: '' }),
      });
    }
    iconPickerModal.hidden = true;
    toast(`已更新：加入 ${toAdd.length} 个，移出 ${toRemove.length} 个`);
    await loadCategories();
    renderCategoryList();
    await loadIcons();
  } catch (err) {
    toast(err.message, true);
  }
}

async function moveSelectedIcons() {
  const ids = [...selectedIconIds].map(Number);
  if (!ids.length) return;

  try {
    const res = await fetch('/api/icons/batch/folder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, folder_id: batchFolderSelect.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '迁移失败');
    toast(`已迁移 ${data.updated} 个图标`);
    clearSelection();
    await loadFolders();
    await loadStats();
    await loadIcons();
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteSelectedIcons() {
  const ids = [...selectedIconIds].map(Number);
  if (!ids.length) return;
  if (!confirm(`确定删除选中的 ${ids.length} 个图标吗？此操作不可恢复。`)) return;

  try {
    const res = await fetch('/api/icons/batch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '删除失败');
    toast(`已删除 ${data.deleted} 个图标`);
    clearSelection();
    await loadCategories();
    await loadFolders();
    await loadStats();
    await loadIcons();
  } catch (err) {
    toast(err.message, true);
  }
}

// 批量下载：请求服务端打包 ZIP，前端触发下载
async function downloadSelectedIcons() {
  const ids = [...selectedIconIds].map(Number);
  if (!ids.length) return;

  try {
    const res = await fetch('/api/icons/batch/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '打包下载失败');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '图标打包.zip';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // 延迟回收：避免部分浏览器在下载排队前就移除节点或撤销 ObjectURL
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
    toast(`已打包下载 ${ids.length} 个图标`);
  } catch (err) {
    toast(err.message, true);
  }
}

// ─── 新增/编辑弹窗 ─────────────────────────────────────────

function openModal(icon) {
  form.reset();
  previewEl.innerHTML = '预览';
  populateFolderSelect();
  if (icon) {
    modalTitle.textContent = '编辑图标';
    fId.value = icon.id;
    fName.value = icon.name;
    fType.value = icon.type;
    fVersion.value = icon.version;
    fFolder.value = icon.folder_id || '';
    fCategory.value = icon.category;
    fTags.value = icon.tags;
    fDescription.value = icon.description;
    if (icon.file_path) {
      previewEl.innerHTML = `<img src="${esc(icon.file_path)}" alt="" />`;
    }
  } else {
    modalTitle.textContent = '新增图标';
    fId.value = '';
    fVersion.value = '1.0.0';
    // 新增时默认归属当前文件夹
    fFolder.value = currentFolderId || '';
  }
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

fFile.addEventListener('change', () => {
  const file = fFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewEl.innerHTML = `<img src="${e.target.result}" alt="" />`;
  };
  reader.readAsDataURL(file);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = fId.value;
  const fd = new FormData();
  fd.append('name', fName.value.trim());
  fd.append('type', fType.value);
  fd.append('version', fVersion.value.trim() || '1.0.0');
  fd.append('category', fCategory.value.trim());
  fd.append('tags', fTags.value.trim());
  fd.append('description', fDescription.value.trim());
  fd.append('folder_id', fFolder.value);
  if (fFile.files[0]) fd.append('file', fFile.files[0]);

  try {
    const res = await fetch(id ? `${API}/${id}` : API, {
      method: id ? 'PUT' : 'POST',
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');
    closeModal();
    toast(id ? '已更新' : '已新增');
    await loadCategories();
    await loadFolders();
    await loadStats();
    await loadIcons();
  } catch (err) {
    toast(err.message, true);
  }
});

async function removeIcon(icon) {
  if (!icon) return;
  if (!confirm(`确定删除「${icon.name}」吗？此操作不可恢复。`)) return;
  try {
    const res = await fetch(`${API}/${icon.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '删除失败');
    selectedIconIds.delete(String(icon.id));
    toast('已删除');
    await loadCategories();
    await loadFolders();
    await loadStats();
    await loadIcons();
  } catch (err) {
    toast(err.message, true);
  }
}

// ─── 大图预览 ──────────────────────────────────────────────

function openViewer(icon) {
  if (!icon) return;
  viewerBody.innerHTML = icon.file_path
    ? `<img src="${esc(icon.file_path)}" alt="${esc(icon.name)}" />`
    : '<span class="no-img">无图</span>';

  viewerMeta.innerHTML = `
    <div><b>名称：</b>${esc(icon.name)}</div>
    <div><b>类型：</b>${typeLabel(icon.type)}</div>
    <div><b>分类：</b>${esc(icon.category) || '—'}</div>
    <div><b>标签：</b>${esc(icon.tags) || '—'}</div>
    <div><b>版本：</b>${esc(icon.version)}</div>
    <div><b>描述：</b>${esc(icon.description) || '—'}</div>
  `;

  viewerActions.innerHTML = '';
  const copyName = document.createElement('button');
  copyName.className = 'btn btn-ghost';
  copyName.textContent = '复制名称';
  copyName.onclick = () => copyText(icon.name, '已复制名称');
  viewerActions.appendChild(copyName);

  if (icon.file_path) {
    const copyLink = document.createElement('button');
    copyLink.className = 'btn btn-ghost';
    copyLink.textContent = '复制链接';
    copyLink.onclick = () => copyText(location.origin + icon.file_path, '已复制链接');
    viewerActions.appendChild(copyLink);

    const download = document.createElement('a');
    download.className = 'btn btn-primary';
    download.textContent = '下载';
    download.href = icon.file_path;
    download.download = '';
    viewerActions.appendChild(download);
  }

  viewer.hidden = false;
}

function copyText(text, okMsg) {
  navigator.clipboard.writeText(text).then(
    () => toast(okMsg),
    () => toast('复制失败', true)
  );
}

// ─── 批量上传 ──────────────────────────────────────────────

// 显示批量上传进度弹窗
function openBatchModal() {
  batchProgressList.innerHTML = '';
  batchSummary.textContent = '';
  batchModal.hidden = false;
}

function addBatchItem(name, status, isOk) {
  const item = document.createElement('div');
  item.className = 'batch-item';
  item.innerHTML = `
    <span class="batch-item-name" title="${esc(name)}">${esc(name)}</span>
    <span class="batch-item-status ${isOk ? 'ok' : 'err'}">${esc(status)}</span>
  `;
  batchProgressList.appendChild(item);
  batchProgressList.scrollTop = batchProgressList.scrollHeight;
}

// 分片上传：每次最多 10 个文件，避免请求体过大
async function handleBatchFiles(files) {
  if (!files || !files.length) return;
  openBatchModal();

  const CHUNK = 10;
  let ok = 0;
  let fail = 0;
  const fileArr = Array.from(files);

  for (let i = 0; i < fileArr.length; i += CHUNK) {
    const chunk = fileArr.slice(i, i + CHUNK);
    const fd = new FormData();
    for (const f of chunk) fd.append('files', f);
    if (currentFolderId !== null) fd.append('folder_id', currentFolderId);

    try {
      const res = await fetch('/api/icons/batch', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '批量上传失败');
      for (const icon of data.icons) {
        addBatchItem(icon.name, '✓ 上传成功', true);
        ok += 1;
      }
    } catch (err) {
      for (const f of chunk) {
        addBatchItem(f.name, `✕ ${err.message}`, false);
        fail += 1;
      }
    }
  }

  batchSummary.textContent = `完成：成功 ${ok} 个，失败 ${fail} 个`;
  await loadCategories();
  await loadFolders();
  await loadStats();
  await loadIcons();
}

// ZIP 批量上传
async function handleZipUpload(file) {
  if (!file) return;
  openBatchModal();
  addBatchItem(file.name, '解析中…', true);

  const fd = new FormData();
  fd.append('zipfile', file);
  if (currentFolderId !== null) fd.append('folder_id', currentFolderId);

  try {
    const res = await fetch('/api/icons/batch-zip', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ZIP 处理失败');
    batchProgressList.innerHTML = '';
    addBatchItem(file.name, `✓ 已解压 ${data.added} 个`, true);
    if (data.skipped > 0) {
      addBatchItem(`跳过非图片文件`, `${data.skipped} 个`, false);
    }
    batchSummary.textContent = `完成：新增 ${data.added} 个图标`;
    await loadCategories();
    await loadFolders();
    await loadStats();
    await loadIcons();
  } catch (err) {
    batchProgressList.innerHTML = '';
    addBatchItem(file.name, `✕ ${err.message}`, false);
    batchSummary.textContent = '上传失败';
  }
}

// ─── 拖拽上传 ──────────────────────────────────────────────

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'];

function getExt(name) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter += 1;
  dropZone.classList.add('dragging');
  dropHint.hidden = false;
});

dropZone.addEventListener('dragleave', () => {
  dragCounter -= 1;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropZone.classList.remove('dragging');
    dropHint.hidden = true;
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropZone.classList.remove('dragging');
  dropHint.hidden = true;

  const files = Array.from(e.dataTransfer.files);
  if (!files.length) return;

  const zips = files.filter((f) => getExt(f.name) === '.zip');
  const images = files.filter((f) => IMAGE_EXTS.includes(getExt(f.name)));

  if (zips.length > 0 && images.length === 0) {
    // 纯 ZIP
    handleZipUpload(zips[0]);
  } else if (images.length > 0) {
    // 图片（可能混有其他格式，只处理图片）
    handleBatchFiles(images);
  } else {
    toast('请拖入图片或 .zip 文件', true);
  }
});

// ─── 工具栏按钮 ────────────────────────────────────────────

document.getElementById('btn-batch').addEventListener('click', () => batchFileInput.click());
batchFileInput.addEventListener('change', () => {
  handleBatchFiles(batchFileInput.files);
  batchFileInput.value = '';
});

document.getElementById('btn-zip').addEventListener('click', () => zipFileInput.click());
zipFileInput.addEventListener('change', () => {
  handleZipUpload(zipFileInput.files[0]);
  zipFileInput.value = '';
});

btnBatchToggleAll.addEventListener('click', toggleSelectAll);
btnBatchMove.addEventListener('click', moveSelectedIcons);
btnBatchDownload.addEventListener('click', downloadSelectedIcons);
btnBatchDelete.addEventListener('click', deleteSelectedIcons);
btnBatchClear.addEventListener('click', clearSelection);

document.getElementById('batch-modal-close').addEventListener('click', () => {
  batchModal.hidden = true;
});

// ─── 侧栏折叠 ──────────────────────────────────────────────

btnSidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('sidebar--collapsed');
  const collapsed = sidebar.classList.contains('sidebar--collapsed');
  btnSidebarToggle.innerHTML = collapsed ? ICONS.chevronRight : ICONS.chevronLeft;
});

// ─── 分页 ──────────────────────────────────────────────────

pageSizeSelect.addEventListener('change', () => {
  pageSize = Number(pageSizeSelect.value);
  currentPage = 1;
  loadIcons();
});
pagePrev.addEventListener('click', () => goToPage(currentPage - 1));
pageNext.addEventListener('click', () => goToPage(currentPage + 1));
pageNumbers.addEventListener('click', (e) => {
  const btn = e.target.closest('.pg-num');
  if (btn) goToPage(Number(btn.dataset.page));
});

viewGrid.addEventListener('click', () => setViewMode('grid'));
viewList.addEventListener('click', () => setViewMode('list'));

// ─── 事件绑定 ──────────────────────────────────────────────

document.getElementById('btn-add').addEventListener('click', () => openModal(null));
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('form-cancel').addEventListener('click', closeModal);
document.getElementById('viewer-close').addEventListener('click', () => (viewer.hidden = true));

modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.hidden = true; });
folderModal.addEventListener('click', (e) => { if (e.target === folderModal) closeFolderModal(null); });

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    currentPage = 1;
    clearSelection();
    loadIcons();
  }, 250);
});
filterType.addEventListener('change', () => {
  currentPage = 1;
  clearSelection();
  loadIcons();
});
filterCategory.addEventListener('change', () => {
  currentPage = 1;
  clearSelection();
  loadIcons();
});

// ─── 分类管理弹窗事件 ──────────────────────────────────────
btnManageCat.addEventListener('click', openCategoryModal);
document.getElementById('category-modal-close').addEventListener('click', () => {
  categoryModal.hidden = true;
});
categoryModal.addEventListener('click', (e) => {
  if (e.target === categoryModal) categoryModal.hidden = true;
});
catAddBtn.addEventListener('click', () => {
  const name = catNewInput.value.trim();
  if (name) createCategory(name);
});
catNewInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const name = catNewInput.value.trim();
    if (name) createCategory(name);
  }
});

// ─── 图标选择器事件 ────────────────────────────────────────
document.getElementById('picker-close').addEventListener('click', () => { iconPickerModal.hidden = true; });
document.getElementById('picker-cancel').addEventListener('click', () => { iconPickerModal.hidden = true; });
document.getElementById('picker-save').addEventListener('click', savePicker);
iconPickerModal.addEventListener('click', (e) => {
  if (e.target === iconPickerModal) iconPickerModal.hidden = true;
});
pickerSearch.addEventListener('input', renderPickerGrid);

// ─── 初始化 ────────────────────────────────────────────────

async function init() {
  setViewMode(viewMode);
  await loadFolders();
  await loadStats();
  await loadCategories();
  await loadIcons();
}

init();
