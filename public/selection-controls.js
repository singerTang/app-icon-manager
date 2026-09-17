// 作者：singerTang。统一单选、多选及文件夹选择，保留原 select 作为表单数据来源。
(() => {
  const controls = new Map();
  let active = null;
  const configs = {
    'filter-type': { label: '类型', prefix: true },
    'filter-category': { label: '分类', search: true, empty: '全部分类' },
    'batch-folder-select': { label: '目标文件夹', search: true, tree: true },
    'sort-order': { label: '排序' },
    'page-size': { label: '每页条数', compact: true },
    'trash-retention': { label: '保留期限' },
    'trash-page-size': { label: '每页条数', compact: true },
    'f-type': { label: '图标类型' },
    'f-folder': { label: '文件夹', search: true, tree: true },
    'f-category': { label: '分类', search: true },
    'upload-folder': { label: '文件夹', search: true, tree: true },
    'upload-category': { label: '分类', search: true },
  };

  function close(restoreFocus = false) {
    if (!active) return;
    const previous = active;
    active = null;
    previous.panel.remove();
    previous.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) previous.trigger.focus();
  }

  function position() {
    if (!active) return;
    const { trigger, panel } = active;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, active.config.search ? 300 : 180), innerWidth - 24);
    panel.style.width = `${width}px`;
    const below = innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < 280 && above > below;
    panel.style.maxHeight = `${Math.max(80, upwards ? above : below)}px`;
    panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
    panel.style.top = `${upwards ? Math.max(12, rect.top - panel.offsetHeight - 6) : rect.bottom + 6}px`;
  }

  function refresh(control) {
    const { select, trigger, config } = control;
    const selected = Array.from(select.selectedOptions);
    let text = selected.map((option) => option.textContent.trim()).join('、');
    if (select.multiple) text = selected.length === 0 ? config.empty : `分类：已选 ${selected.length} 项`;
    else if (config.prefix) text = `${config.label}：${text}`;
    trigger.querySelector('.choice-value').textContent = text || '请选择';
    trigger.title = selected.map((option) => option.title || option.textContent.trim()).join('、');
    trigger.disabled = select.disabled;
    trigger.classList.toggle('has-selection', select.multiple && selected.length > 0);
  }

  function renderOptions(control) {
    const { select, config, list, search, expanded } = control;
    const keyword = search ? search.value.trim().toLowerCase() : '';
    const options = Array.from(select.options);
    const parents = new Set(options.map((option) => option.dataset.parent).filter(Boolean));
    const byId = new Map(options.map((option) => [option.value, option]));
    function visible(option) {
      if (keyword) return option.textContent.toLowerCase().includes(keyword);
      if (!config.tree) return true;
      let parent = option.dataset.parent;
      const visited = new Set();
      while (parent && !visited.has(parent)) {
        if (!expanded.has(parent)) return false;
        visited.add(parent);
        parent = byId.get(parent)?.dataset.parent;
      }
      return true;
    }
    list.replaceChildren();
    for (const option of options.filter(visible)) {
      const row = document.createElement('div');
      row.className = 'choice-row';
      if (config.tree && !keyword) row.style.paddingLeft = `${8 + Number(option.dataset.depth || 0) * 16}px`;
      if (config.tree && parents.has(option.value) && !keyword) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'choice-branch';
        toggle.textContent = expanded.has(option.value) ? '▾' : '▸';
        toggle.setAttribute('aria-label', `${expanded.has(option.value) ? '收起' : '展开'}${option.dataset.name}`);
        toggle.setAttribute('aria-expanded', String(expanded.has(option.value)));
        toggle.addEventListener('click', () => {
          if (expanded.has(option.value)) expanded.delete(option.value);
          else expanded.add(option.value);
          renderOptions(control);
          list.querySelector(`[data-value="${CSS.escape(option.value)}"]`)?.focus();
          position();
        });
        row.append(toggle);
      } else if (config.tree && option.value && !keyword) {
        const spacer = document.createElement('span');
        spacer.className = 'choice-branch-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        row.append(spacer);
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'choice-option';
      item.dataset.value = option.value;
      item.disabled = option.disabled;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.tabIndex = -1;
      if (select.multiple) {
        const check = document.createElement('span');
        check.className = 'choice-checkbox';
        check.textContent = option.selected ? '✓' : '';
        check.setAttribute('aria-hidden', 'true');
        item.append(check);
      }
      const text = document.createElement('span');
      text.className = 'choice-option-label';
      text.textContent = config.tree && !keyword ? option.dataset.name || option.textContent.trim() : option.textContent.trim();
      item.title = option.title || option.textContent.trim();
      item.append(text);
      if (!select.multiple && option.selected) {
        const check = document.createElement('span');
        check.textContent = '✓';
        check.setAttribute('aria-hidden', 'true');
        item.append(check);
      }
      item.addEventListener('click', () => {
        if (select.multiple) option.selected = !option.selected;
        else select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh(control);
        if (select.multiple) {
          renderOptions(control);
          list.querySelector(`[data-value="${CSS.escape(option.value)}"]`)?.focus();
          position();
        } else close(true);
      });
      row.append(item);
      list.append(row);
    }
    if (!list.children.length) {
      const empty = document.createElement('p');
      empty.className = 'choice-empty';
      empty.textContent = '没有匹配项';
      list.append(empty);
    }
    if (control.count) control.count.textContent = `已选 ${select.selectedOptions.length} 项`;
  }

  function open(control) {
    if (active === control) { close(true); return; }
    close();
    active = control;
    const { select, trigger, config } = control;
    const panel = document.createElement('div');
    panel.className = 'choice-panel';
    control.panel = panel;
    control.expanded = new Set();
    // 打开文件夹选择时展开已有路径，用户仍可手动收起各级。
    for (const option of select.options) if (option.dataset.parent) control.expanded.add(option.dataset.parent);
    if (config.search) {
      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'choice-search';
      search.placeholder = config.tree ? '搜索文件夹名称或路径' : '搜索分类名称';
      search.setAttribute('aria-label', search.placeholder);
      search.addEventListener('input', () => { renderOptions(control); position(); });
      control.search = search;
      panel.append(search);
    }
    const list = document.createElement('div');
    list.className = 'choice-options';
    list.id = `${select.id}-options`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', config.label);
    if (select.multiple) list.setAttribute('aria-multiselectable', 'true');
    control.list = list;
    panel.append(list);
    if (select.multiple) {
      const footer = document.createElement('div');
      footer.className = 'choice-footer';
      control.count = document.createElement('span');
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = '清空选择';
      clear.addEventListener('click', () => {
        for (const option of select.options) option.selected = false;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh(control);
        renderOptions(control);
      });
      footer.append(control.count, clear);
      panel.append(footer);
    }
    renderOptions(control);
    document.body.append(panel);
    trigger.setAttribute('aria-expanded', 'true');
    position();
    (control.search || list.querySelector('[aria-selected="true"]') || list.querySelector('.choice-option'))?.focus();
    panel.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      if (event.target === control.search && ['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(list.querySelectorAll('.choice-option:not(:disabled)'));
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0);
      items[next]?.focus();
    });
  }

  window.refreshSelectionControls = () => controls.forEach(refresh);
  window.initSelectionControls = () => {
    for (const [id, config] of Object.entries(configs)) {
      const select = document.getElementById(id);
      if (!select || controls.has(id)) continue;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = `${id}-trigger`;
      trigger.className = `choice-trigger${config.compact ? ' choice-compact' : ''}`;
      trigger.setAttribute('aria-label', config.label);
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', `${id}-options`);
      trigger.innerHTML = '<span class="choice-value"></span><span class="choice-chevron" aria-hidden="true"></span>';
      select.hidden = true;
      select.after(trigger);
      for (const label of document.querySelectorAll(`label[for="${id}"]`)) label.htmlFor = trigger.id;
      const control = { select, trigger, config };
      controls.set(id, control);
      trigger.addEventListener('click', () => open(control));
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(control); }
      });
      select.addEventListener('change', () => refresh(control));
      new MutationObserver(() => refresh(control)).observe(select, { subtree: true, childList: true, attributes: true });
      refresh(control);
    }
  };
  document.addEventListener('pointerdown', (event) => {
    if (active && !active.panel.contains(event.target) && !active.trigger.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (active && event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (active && event.key === 'Tab') close(true);
  });
  window.addEventListener('resize', () => close());
  document.addEventListener('scroll', (event) => {
    if (active && !active.panel.contains(event.target)) close();
  }, true);
})();
