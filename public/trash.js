// 作者：singerTang。回收站独立选择状态，复用图库提示、样式与刷新函数。
(() => {
  const element = (id) => document.getElementById(id);
  const panel = element('trash-content');
  const entry = element('open-trash');
  const list = element('trash-list');
  const search = element('trash-search');
  const selected = new Set();
  let rows = [];
  let page = 1;
  let total = 0;
  let trashTotal = 0;
  let sequence = 0;
  let timer;
  let busy = false;
  let loading = false;
  const savedSize = Number(localStorage.getItem('trashPageSize'));
  let pageSize = [30, 50, 100, 200, 500].includes(savedSize) ? savedSize : 100;
  let viewMode = localStorage.getItem('trashViewMode') === 'grid' ? 'grid' : 'list';

  function setTrashView(mode) {
    viewMode = mode === 'grid' ? 'grid' : 'list';
    localStorage.setItem('trashViewMode', viewMode);
    list.classList.toggle('trash-list--list', viewMode === 'list');
    element('trash-list-head').hidden = viewMode !== 'list' || !rows.length;
    for (const value of ['grid', 'list']) {
      const button = element(`trash-view-${value}`);
      button.classList.toggle('active', viewMode === value);
      button.setAttribute('aria-pressed', String(viewMode === value));
    }
  }

  function goToTrashPage(target) {
    if (busy || loading) return;
    const next = Math.min(Math.max(1, target), Math.max(1, Math.ceil(total / pageSize)));
    if (next === page) return;
    page = next;
    load();
  }

  async function request(url, method = 'GET', body) {
    const response = await fetch(url, {
      method, cache: 'no-store',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '操作失败，请重试');
    return data;
  }

  function updateCount(count) {
    trashTotal = count;
    element('trash-count').textContent = count;
    entry.title = `回收站，${count} 个图标`;
    entry.setAttribute('aria-label', entry.title);
  }

  window.refreshTrashCount = async () => {
    try { updateCount((await request('/api/trash/settings')).total); }
    catch { entry.title = '回收站数量读取失败，点击重试'; }
  };

  function updateActions() {
    const all = rows.length > 0 && rows.every((row) => selected.has(row.id));
    element('trash-selected').textContent = `已选 ${selected.size} 个（当前页 ${rows.filter((row) => selected.has(row.id)).length} 个）`;
    element('trash-select-page').textContent = all ? '取消当前页全选' : '全选当前页';
    for (const id of ['trash-restore', 'trash-delete', 'trash-clear-selected']) element(id).disabled = busy || !selected.size;
    element('trash-select-page').disabled = busy || loading || !rows.length;
    element('trash-empty').disabled = busy || !trashTotal;
    element('trash-batch-bar').hidden = !trashTotal && !selected.size;
    element('trash-prev').disabled = busy || loading || page <= 1;
    element('trash-next').disabled = busy || loading || page * pageSize >= total;
    element('trash-save-settings').disabled = busy;
    element('trash-retention').disabled = busy;
    element('trash-page-size').disabled = busy || loading;
    element('trash-page-numbers').querySelectorAll('button').forEach((button) => { button.disabled = busy || loading; });
    window.refreshSelectionControls();
    list.querySelectorAll('button, input').forEach((control) => { control.disabled = busy; });
    list.querySelectorAll('.trash-row').forEach((card) => {
      const checked = selected.has(Number(card.dataset.id));
      card.classList.toggle('is-selected', checked);
      card.querySelector('input').checked = checked;
    });
  }

  function renderRows() {
    list.replaceChildren();
    for (const row of rows) {
      const remaining = Math.ceil((Date.parse(row.purge_after) - Date.now()) / 86400000);
      const item = document.createElement('article');
      item.className = 'card trash-row';
      item.dataset.id = row.id;
      item.tabIndex = 0;
      item.setAttribute('role', 'group');
      item.setAttribute('aria-label', row.name);
      item.innerHTML = `
        <label class="card-select" title="选择图标"><input type="checkbox" aria-label="选择${esc(row.name)}" ${selected.has(row.id) ? 'checked' : ''} /></label>
        <div class="card-actions"><button class="trash-restore-one" type="button" title="恢复到图库">恢复</button><button class="del trash-delete-one" type="button" title="彻底删除，无法恢复">彻底删除</button></div>
        <button type="button" class="card-thumb" title="预览图标" aria-label="预览${esc(row.name)}">${thumbHtml(row)}<span class="type-badge type-badge-${row.type === 'symbol' ? 'symbol' : 'app'}">${row.type === 'symbol' ? 'SVG' : '图片'}</span></button>
        <div class="card-name" title="${esc(row.name)}">${esc(row.name)}</div>
        <div class="trash-details">
          <p title="${esc(row.deleted_category || '未分类')}">分类：${esc(row.deleted_category || '未分类')}</p>
          <p title="${esc(row.deleted_folder_path || '无文件夹归属')}">文件夹：${esc(row.deleted_folder_path || '无文件夹归属')}</p>
        </div>
        <time class="trash-deleted-time" datetime="${esc(row.deleted_at)}">${esc(new Date(row.deleted_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }))}</time>
        <div class="trash-expiry ${remaining > 0 ? '' : 'is-expired'}" title="删除：${esc(new Date(row.deleted_at).toLocaleString())}\n到期：${esc(new Date(row.purge_after).toLocaleString())}"><span>${esc(new Date(row.deleted_at).toLocaleDateString('zh-CN'))} 删除</span><strong>${remaining > 0 ? `剩余 ${remaining} 天` : '已到期'}</strong></div>`;
      const toggle = () => {
        if (busy) return;
        if (selected.has(row.id)) selected.delete(row.id); else selected.add(row.id);
        updateActions();
      };
      item.addEventListener('click', (event) => {
        if (!event.target.closest('button, input, label')) toggle();
      });
      item.addEventListener('keydown', (event) => {
        if (event.target === item && [' ', 'Enter'].includes(event.key)) {
          event.preventDefault();
          toggle();
        }
      });
      item.querySelector('input').addEventListener('change', (event) => {
        if (event.target.checked) selected.add(row.id); else selected.delete(row.id);
        updateActions();
      });
      item.querySelector('.trash-restore-one').addEventListener('click', () => operate('restore', [row.id]));
      item.querySelector('.trash-delete-one').addEventListener('click', () => operate('delete', [row.id]));
      item.querySelector('.card-thumb').addEventListener('click', () => openViewer(row));
      list.append(item);
    }
    updateActions();
    setTrashView(viewMode);
  }

  async function load() {
    const ticket = ++sequence;
    loading = true;
    rows = [];
    list.replaceChildren();
    element('trash-status').textContent = '正在加载回收站…';
    element('trash-status').hidden = false;
    element('trash-empty-state').hidden = true;
    element('trash-retry').hidden = true;
    element('trash-list-head').hidden = true;
    element('trash-page-total').textContent = '—';
    element('trash-page-numbers').replaceChildren();
    updateActions();
    try {
      const params = new URLSearchParams({ search: search.value.trim(), page, pageSize });
      const data = await request(`/api/trash?${params}`);
      if (ticket !== sequence) return;
      rows = data.icons;
      total = data.total;
      page = data.page;
      updateCount(data.trashTotal);
      element('trash-status').textContent = total ? `匹配 ${total} 个图标` : (search.value.trim() ? '没有匹配的图标，请调整搜索条件。' : '回收站为空。');
      element('trash-status').hidden = total === 0;
      element('trash-empty-state').hidden = total > 0;
      element('trash-empty-title').textContent = search.value.trim() ? '没有找到匹配的图标' : '回收站为空';
      element('trash-empty-description').textContent = search.value.trim() ? '试试其他名称，或清除搜索查看全部回收站图标。' : '删除的图标会暂存于此，可在到期前恢复。';
      element('trash-clear-search').hidden = !search.value.trim();
      element('trash-page-total').textContent = total;
      renderPageNumbers(element('trash-page-numbers'), page, Math.max(1, Math.ceil(total / pageSize)));
      renderRows();
      list.parentElement.scrollTop = 0;
    } catch (error) {
      if (ticket !== sequence) return;
      element('trash-status').textContent = '回收站加载失败，请重试。';
      element('trash-retry').hidden = false;
    } finally {
      if (ticket === sequence) { loading = false; updateActions(); }
    }
  }

  async function operate(action, ids = []) {
    if (busy) return;
    if (action !== 'empty' && !ids.length) return;
    busy = true;
    updateActions();
    try {
      const hiddenCount = ids.filter((id) => !rows.some((row) => row.id === id)).length;
      const single = ids.length === 1 && rows.find((row) => row.id === ids[0]);
      const target = single ? `「${single.name}」` : `所选的 ${ids.length} 个图标`;
      const scope = hiddenCount ? `其中 ${hiddenCount} 个不在当前页，也会一并处理。\n` : '';
      const options = action === 'empty'
        ? { title: '清空回收站', description: `彻底删除回收站中的全部 ${trashTotal} 个图标？`, detail: '包括搜索结果之外及其他页面的图标。图片文件将被清理，清空后无法恢复。请等待 5 秒后确认。', confirmText: '清空回收站', danger: true, delaySeconds: 5 }
        : action === 'restore'
          ? { title: '恢复图标', description: `将${target}恢复到图库？`, detail: `${scope}保留原上传时间和归属。原分类或文件夹不存在时，将恢复为未分类或无文件夹归属。`, confirmText: '恢复到图库' }
          : { title: '彻底删除图标', description: `彻底删除${target}？`, detail: `${scope}图片文件将被清理，此操作无法撤销，删除后不能再从回收站恢复。`, confirmText: '彻底删除', danger: true };
      if (!await confirmAction(options)) return;
      const data = action === 'restore' ? await request('/api/trash/restore', 'POST', { ids })
        : action === 'empty' ? await request('/api/trash/empty', 'POST', { confirm: '清空回收站' })
          : await request('/api/trash', 'DELETE', { ids });
      const completed = data.restored || data.deleted;
      // 已被其他人恢复或清理的选择一并移除，仅保留明确失败的项目。
      const failed = new Set(data.failed || []);
      for (const id of action === 'empty' ? [...selected] : ids) if (!failed.has(id)) selected.delete(id);
      if (action === 'restore') toast(`已恢复 ${completed.length} 个${data.adjusted ? `，其中 ${data.adjusted} 个的原归属不存在，已调整` : ''}`);
      else toast(`已彻底删除 ${completed.length} 个${failed.size ? `，${failed.size} 个失败，已保留，可重试` : ''}`, failed.size > 0);
      await load();
      await loadCategories();
      await loadFolders();
      await loadStats();
      await loadIcons();
    } catch (error) { toast(error.message, true); }
    finally { busy = false; updateActions(); }
  }

  window.closeTrash = () => {
    panel.hidden = true;
    element('library-content').hidden = false;
    entry.removeAttribute('aria-current');
    renderFolderTree();
  };
  entry.addEventListener('click', async () => {
    panel.hidden = false;
    element('library-content').hidden = true;
    entry.setAttribute('aria-current', 'page');
    document.querySelectorAll('#folder-tree .active').forEach((node) => node.classList.remove('active'));
    try {
      element('trash-retention').value = (await request('/api/trash/settings')).retentionDays;
      window.refreshSelectionControls();
    }
    catch (error) { toast(error.message, true); }
    load();
  });
  element('trash-back').addEventListener('click', () => { window.closeTrash(); loadIcons(); });
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; load(); }, 250); });
  element('trash-retry').addEventListener('click', load);
  element('trash-clear-search').addEventListener('click', () => {
    clearTimeout(timer);
    search.value = '';
    page = 1;
    load();
  });
  element('trash-prev').addEventListener('click', () => goToTrashPage(page - 1));
  element('trash-next').addEventListener('click', () => goToTrashPage(page + 1));
  element('trash-page-numbers').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (button) goToTrashPage(Number(button.dataset.page));
  });
  element('trash-page-size').addEventListener('change', () => {
    pageSize = Number(element('trash-page-size').value);
    localStorage.setItem('trashPageSize', String(pageSize));
    page = 1;
    load();
  });
  element('trash-view-grid').addEventListener('click', () => setTrashView('grid'));
  element('trash-view-list').addEventListener('click', () => setTrashView('list'));
  element('trash-select-page').addEventListener('click', () => {
    const all = rows.every((row) => selected.has(row.id));
    for (const row of rows) { if (all) selected.delete(row.id); else selected.add(row.id); }
    renderRows();
  });
  element('trash-clear-selected').addEventListener('click', () => { selected.clear(); renderRows(); });
  element('trash-restore').addEventListener('click', () => operate('restore', [...selected]));
  element('trash-delete').addEventListener('click', () => operate('delete', [...selected]));
  element('trash-empty').addEventListener('click', () => operate('empty'));
  element('trash-save-settings').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    updateActions();
    try {
      await request('/api/trash/settings', 'PUT', { retentionDays: Number(element('trash-retention').value) });
      toast('保留期限已保存，仅影响之后移入回收站的图标');
    } catch (error) { toast(error.message, true); }
    finally { busy = false; updateActions(); }
  });
  element('trash-page-size').value = String(pageSize);
  window.refreshSelectionControls();
  setTrashView(viewMode);
  window.refreshTrashCount();
})();
