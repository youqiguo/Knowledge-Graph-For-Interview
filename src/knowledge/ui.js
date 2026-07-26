import { STATUS_LABELS, STATUSES, newId } from '../shared/schema.js';

export function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function renderToolbar(root, actions) {
  root.innerHTML = `
    <button type="button" data-act="view-cat" title="返回类别总览">图谱</button>
    <button type="button" data-act="expand" title="向外扩展一层关联">扩展</button>
    <button type="button" data-act="select-all" title="全选当前图中的详细知识点">全选当前</button>

    <div class="menu" data-menu="new">
      <button type="button" data-act="new-toggle">新建 ▾</button>
      <div class="menu-pop" hidden>
        <button type="button" data-act="new-cat">类别知识点</button>
        <button type="button" data-act="new-det">详细知识点</button>
      </div>
    </div>

    <div class="menu" data-menu="io">
      <button type="button" data-act="io-toggle">导入/导出 ▾</button>
      <div class="menu-pop" hidden>
        <button type="button" data-act="export-interview">导出面试 JSON</button>
        <button type="button" data-act="export-kb">导出知识点库</button>
        <label class="menu-file">
          导入知识点库
          <input type="file" accept="application/json,.json" data-act="import-kb" hidden />
        </label>
      </div>
    </div>
  `;

  function closeMenus() {
    root.querySelectorAll('.menu-pop').forEach((el) => {
      el.hidden = true;
    });
  }

  root.querySelector('[data-act="view-cat"]').onclick = () => {
    closeMenus();
    actions.onViewCategories();
  };
  root.querySelector('[data-act="expand"]').onclick = () => {
    closeMenus();
    actions.onExpand();
  };
  root.querySelector('[data-act="select-all"]').onclick = () => {
    closeMenus();
    actions.onSelectAllVisible?.();
  };

  root.querySelector('[data-act="new-toggle"]').onclick = (e) => {
    e.stopPropagation();
    const pop = root.querySelector('[data-menu="new"] .menu-pop');
    const open = !pop.hidden;
    closeMenus();
    pop.hidden = open;
  };
  root.querySelector('[data-act="io-toggle"]').onclick = (e) => {
    e.stopPropagation();
    const pop = root.querySelector('[data-menu="io"] .menu-pop');
    const open = !pop.hidden;
    closeMenus();
    pop.hidden = open;
  };

  root.querySelector('[data-act="new-cat"]').onclick = () => {
    closeMenus();
    actions.onNewCategory();
  };
  root.querySelector('[data-act="new-det"]').onclick = () => {
    closeMenus();
    actions.onNewDetail();
  };
  root.querySelector('[data-act="export-interview"]').onclick = () => {
    closeMenus();
    actions.onExportInterview();
  };
  root.querySelector('[data-act="export-kb"]').onclick = () => {
    closeMenus();
    actions.onExportKb();
  };
  root.querySelector('[data-act="import-kb"]').onchange = (e) => {
    const file = e.target.files?.[0];
    closeMenus();
    if (file) actions.onImportKb(file);
    e.target.value = '';
  };

  if (!renderToolbar._docBind) {
    renderToolbar._docBind = true;
    document.addEventListener('click', () => {
      document.querySelectorAll('.toolbar .menu-pop').forEach((el) => {
        el.hidden = true;
      });
    });
  }
}

export function renderSidebar(root, ctx) {
  const { selection, searchQuery, tagFilterText, weakOnly } = ctx;
  const q = searchQuery || '';
  const results = ctx.searchResults;
  // 仅展示搜索结果，默认不罗列全部库
  const cats = q.trim() ? results?.categories ?? [] : [];
  const dets = q.trim() ? results?.details ?? [] : [];
  const selectedIds = selection.getSelectedDetailIds();
  const selectedDetails = selectedIds
    .map((id) => ctx.kb.details.find((d) => d.id === id))
    .filter(Boolean);
  const poolIds = Array.isArray(ctx.quizPoolIds) ? ctx.quizPoolIds : [];
  const poolSet = new Set(poolIds);
  const poolDetails = poolIds
    .map((id) => ctx.kb.details.find((d) => d.id === id))
    .filter(Boolean);

  root.innerHTML = `
    <div class="drawer-head">
      <p class="section-title">搜索</p>
      <button type="button" class="drawer-close" id="btnCloseSidebar" title="关闭">×</button>
    </div>
    <input type="search" id="searchInput" placeholder="搜索后加入图…" value="${escapeAttr(q)}" />
    <div class="actions" style="margin-top:8px">
      <button type="button" id="btnAddSearch" class="primary" ${!q.trim() ? 'disabled' : ''}>加入图</button>
      <button type="button" id="btnClearSel">清空多选</button>
    </div>

    <p class="section-title" style="margin-top:14px">图谱筛选</p>
    <label class="field-row" style="margin:0">
      <input type="checkbox" id="weakOnly" class="check" ${weakOnly ? 'checked' : ''} />
      <span>仅掌握不牢</span>
    </label>
    <label>标签筛选</label>
    <input type="text" id="tagFilter" placeholder="易错, 多态" value="${escapeAttr(tagFilterText)}" />
    <div class="actions">
      <button type="button" id="btnApplyFilter">应用</button>
    </div>

    <p class="section-title" style="margin-top:14px">搜索结果</p>
    <div id="searchResults" class="stack"></div>

    <p class="section-title" style="margin-top:14px">已多选 · ${selectedDetails.length}</p>
    <div class="actions" style="margin-top:0">
      <button type="button" class="primary" id="btnAddQuizSel" ${selectedDetails.length ? '' : 'disabled'}>
        加入面试模拟${selectedDetails.length ? `（${selectedDetails.length}）` : ''}
      </button>
    </div>
    <div id="selList" class="stack"></div>

    <p class="section-title" style="margin-top:14px">面试模拟池 · ${poolDetails.length}</p>
    <div class="actions" style="margin-top:0">
      <button type="button" id="btnClearQuizPool" ${poolDetails.length ? '' : 'disabled'}>清空面试池</button>
    </div>
    <div id="quizPoolList" class="stack"></div>
  `;

  const resultsEl = root.querySelector('#searchResults');
  const selList = root.querySelector('#selList');
  const quizPoolList = root.querySelector('#quizPoolList');

  if (!q.trim()) {
    resultsEl.innerHTML = `<p class="muted hint-block">输入关键词查找类别或详细知识点，不默认展示全部列表。</p>`;
  } else if (!cats.length && !dets.length) {
    resultsEl.innerHTML = `<p class="muted hint-block">无匹配结果</p>`;
  } else {
    for (const c of cats) {
      const full = selection.isCategoryFullySelected(c.id);
      const row = document.createElement('div');
      row.className = `list-item ${full ? 'selected' : ''}`;
      row.innerHTML = `
        <input type="checkbox" class="check" data-cat="${c.id}" ${full ? 'checked' : ''} />
        <span class="title" title="${escapeAttr(c.title)}"><span class="badge-cat">类</span> ${escapeHtml(c.title)}</span>
        <button type="button" class="icon-btn" data-add-cat="${c.id}" title="加入图">＋</button>
      `;
      resultsEl.appendChild(row);
    }
    for (const d of dets) {
      const on = selection.isDetailSelected(d.id);
      const row = document.createElement('div');
      row.className = `list-item ${on ? 'selected' : ''}`;
      row.innerHTML = `
        <input type="checkbox" class="check" data-det="${d.id}" ${on ? 'checked' : ''} />
        <span class="title" title="${escapeAttr(d.title)}">${escapeHtml(d.title)}${d.weak ? ' ⚠' : ''}${
          poolSet.has(d.id) ? ' · 已添加' : ''
        }</span>
        <button type="button" class="icon-btn" data-add-det="${d.id}" title="加入图">＋</button>
      `;
      resultsEl.appendChild(row);
    }
  }

  if (!selectedDetails.length) {
    selList.innerHTML = `<p class="muted hint-block">多选后点「加入面试模拟」，才会进入面试抽题范围。</p>`;
  } else {
    for (const d of selectedDetails) {
      const row = document.createElement('div');
      row.className = 'list-item selected';
      row.innerHTML = `
        <span class="title" title="${escapeAttr(d.title)}">${escapeHtml(d.title)}${
          poolSet.has(d.id) ? ' · 已添加' : ''
        }</span>
        <button type="button" class="icon-btn" data-unsel="${d.id}" title="取消多选">×</button>
      `;
      selList.appendChild(row);
    }
  }

  if (!poolDetails.length) {
    quizPoolList.innerHTML = `<p class="muted hint-block">尚未加入。面试模拟仅从本池抽题。</p>`;
  } else {
    for (const d of poolDetails) {
      const row = document.createElement('div');
      row.className = 'list-item selected';
      row.innerHTML = `
        <span class="title" title="${escapeAttr(d.title)}">${escapeHtml(d.title)}</span>
        <button type="button" class="icon-btn" data-rm-quiz="${d.id}" title="移出面试池">×</button>
      `;
      quizPoolList.appendChild(row);
    }
  }

  root.querySelector('#searchInput').oninput = (e) => ctx.onSearch(e.target.value);
  root.querySelector('#btnCloseSidebar')?.addEventListener('click', () => ctx.onClose?.());
  root.querySelector('#btnAddSearch').onclick = () => {
    const checkedDet = [...root.querySelectorAll('[data-det]:checked')].map((el) => el.dataset.det);
    const checkedCat = [...root.querySelectorAll('[data-cat]:checked')].map((el) => el.dataset.cat);
    if (checkedDet.length || checkedCat.length) {
      ctx.onAddToGraph([...checkedDet, ...checkedCat]);
    } else {
      ctx.onAddToGraph([...cats.map((c) => c.id), ...dets.map((d) => d.id)]);
    }
  };
  root.querySelector('#btnClearSel').onclick = () => ctx.onClearSelection();
  root.querySelector('#btnAddQuizSel').onclick = () => ctx.onAddToQuizPool?.(selectedIds);
  root.querySelector('#btnClearQuizPool').onclick = () => ctx.onClearQuizPool?.();
  root.querySelector('#weakOnly').onchange = (e) => ctx.onWeakOnly(e.target.checked);
  root.querySelector('#btnApplyFilter').onclick = () => {
    ctx.onTagFilter(root.querySelector('#tagFilter').value);
  };

  resultsEl.querySelectorAll('[data-cat]').forEach((el) => {
    el.onchange = () => ctx.onToggleCategory(el.dataset.cat);
  });
  resultsEl.querySelectorAll('[data-det]').forEach((el) => {
    el.onchange = () => ctx.onToggleDetail(el.dataset.det);
  });
  resultsEl.querySelectorAll('[data-add-cat]').forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      ctx.onAddToGraph([el.dataset.addCat]);
    };
  });
  resultsEl.querySelectorAll('[data-add-det]').forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      ctx.onAddToGraph([el.dataset.addDet]);
    };
  });
  selList.querySelectorAll('[data-unsel]').forEach((el) => {
    el.onclick = () => ctx.onToggleDetail(el.dataset.unsel);
  });
  quizPoolList.querySelectorAll('[data-rm-quiz]').forEach((el) => {
    el.onclick = () => ctx.onRemoveFromQuizPool?.([el.dataset.rmQuiz]);
  });
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export function renderInfoPanel(root, ctx) {
  const { target, selection } = ctx;
  if (!target) {
    root.innerHTML = `
      <div class="drawer-head">
        <p class="section-title">详情</p>
        <button type="button" class="drawer-close" id="btnClosePanel" title="关闭">×</button>
      </div>
      <p class="muted">点击节点查看详情。多选后点「加入面试模拟」才会进入抽题范围。</p>
      <p class="muted">已多选 ${selection.getSelectedDetailIds().length} · 面试池 ${(ctx.quizPoolIds || []).length}</p>`;
    root.querySelector('#btnClosePanel')?.addEventListener('click', () => ctx.onClose?.());
    return;
  }

  if (target.kind === 'category') {
    renderCategoryPanel(root, ctx);
  } else if (target.kind === 'detail') {
    renderDetailPanel(root, ctx);
  } else {
    root.innerHTML = `
      <div class="drawer-head">
        <p class="section-title">详情</p>
        <button type="button" class="drawer-close" id="btnClosePanel" title="关闭">×</button>
      </div>
      <p class="muted">点击节点查看详情</p>`;
  }
  root.querySelector('#btnClosePanel')?.addEventListener('click', () => ctx.onClose?.());
}

function renderCategoryPanel(root, ctx) {
  const cat = ctx.kb.categories.find((c) => c.id === ctx.target.refId);
  if (!cat) {
    root.innerHTML = `<p class="muted">类别不存在</p>`;
    return;
  }
  const details = ctx.kb.details.filter((d) => d.categoryId === cat.id);
  const full = ctx.selection.isCategoryFullySelected(cat.id);
  const selCount = ctx.selection.getSelectedDetailIds().length;
  const poolSet = new Set(Array.isArray(ctx.quizPoolIds) ? ctx.quizPoolIds : []);

  root.innerHTML = `
    <div class="drawer-head">
      <h2 style="margin:0">类别：${escapeHtml(cat.title)}</h2>
      <button type="button" class="drawer-close" id="btnClosePanel" title="关闭">×</button>
    </div>
    <div class="chip-row">
      <span class="chip">${STATUS_LABELS[cat.status] || cat.status}</span>
      ${cat.weak ? '<span class="chip weak">掌握不牢</span>' : ''}
      <span class="chip">${details.length} 个详细点</span>
      ${full ? '<span class="chip">已全选</span>' : ''}
    </div>
    <label>标题</label>
    <input id="f-title" value="${escapeAttr(cat.title)}" />
    <label>内容</label>
    <textarea id="f-content">${escapeHtml(cat.content)}</textarea>
    <label>AI 探索提示（含下属列表）</label>
    <textarea id="f-ai">${escapeHtml(cat.aiExplorePrompt)}</textarea>
    <label>状态</label>
    <select id="f-status">${statusOptions(cat.status)}</select>
    <label class="field-row"><input type="checkbox" id="f-weak" class="check" ${cat.weak ? 'checked' : ''}/><span>掌握不牢</span></label>
    <div class="actions">
      <button type="button" class="primary" id="btnSave">保存</button>
      <button type="button" id="btnEnter">进入详细视图</button>
      <button type="button" id="btnSelCat">${full ? '取消全选' : '多选全部详细'}</button>
      <button type="button" class="primary" id="btnQuizCat" ${
        details.length ? '' : 'disabled'
      }>加入面试${selCount > 0 ? `（多选 ${selCount}）` : details.length ? `（本类 ${details.length}）` : ''}</button>
      <button type="button" class="danger" id="btnDel">从库中删除</button>
    </div>
    <h3>下属详细知识点</h3>
    <ul class="muted" style="padding-left:18px;margin:0">
      ${details
        .map((d) => {
          const inPool = poolSet.has(d.id);
          return `<li>${escapeHtml(d.title)}${inPool ? ' · <span class="chip quiz-pool">已添加</span>' : ''}</li>`;
        })
        .join('') || '<li>无</li>'}
    </ul>
  `;

  const applyStatus = () => {
    ctx.onUpdateCategory(
      cat.id,
      {
        status: root.querySelector('#f-status').value,
        weak: root.querySelector('#f-weak').checked,
      },
      { statusOnly: true },
    );
  };
  root.querySelector('#f-status').onchange = applyStatus;
  root.querySelector('#f-weak').onchange = applyStatus;

  root.querySelector('#btnSave').onclick = () => {
    ctx.onUpdateCategory(cat.id, {
      title: root.querySelector('#f-title').value.trim() || cat.title,
      content: root.querySelector('#f-content').value,
      aiExplorePrompt: root.querySelector('#f-ai').value,
      status: root.querySelector('#f-status').value,
      weak: root.querySelector('#f-weak').checked,
    });
  };
  root.querySelector('#btnEnter').onclick = () => ctx.onEnterCategory(cat.id);
  root.querySelector('#btnSelCat').onclick = () => ctx.onToggleCategory(cat.id);
  root.querySelector('#btnQuizCat').onclick = () => {
    const selectedIds = ctx.selection.getSelectedDetailIds();
    const ids = selectedIds.length ? selectedIds : details.map((d) => d.id);
    ctx.onAddToQuizPool?.(ids);
  };
  root.querySelector('#btnDel').onclick = () => {
    if (confirm(`删除类别「${cat.title}」及其全部详细知识点？`)) ctx.onDeleteCategory(cat.id);
  };
}

function renderDetailPanel(root, ctx) {
  const d = ctx.kb.details.find((x) => x.id === ctx.target.refId);
  if (!d) {
    root.innerHTML = `<p class="muted">知识点不存在</p>`;
    return;
  }
  const cat = ctx.kb.categories.find((c) => c.id === d.categoryId);
  const selected = ctx.selection.isDetailSelected(d.id);
  const poolIds = Array.isArray(ctx.quizPoolIds) ? ctx.quizPoolIds : [];
  const inQuizPool = poolIds.includes(d.id);
  const selCount = ctx.selection.getSelectedDetailIds().length;
  /** @type {string[]} */
  let relatedIds = [...(d.relatedIds || [])];

  const quizBtnLabel = inQuizPool
    ? '已添加 · 移出'
    : selCount > 1
      ? `加入面试（多选 ${selCount}）`
      : '加入面试';

  root.innerHTML = `
    <div class="drawer-head">
      <h2 style="margin:0">${escapeHtml(d.title)}</h2>
      <button type="button" class="drawer-close" id="btnClosePanel" title="关闭">×</button>
    </div>
    <div class="chip-row">
      <span class="chip">${escapeHtml(cat?.title || d.categoryId)}</span>
      <span class="chip">${STATUS_LABELS[d.status] || d.status}</span>
      ${d.weak ? '<span class="chip weak">掌握不牢</span>' : ''}
      ${inQuizPool ? '<span class="chip quiz-pool">已添加</span>' : ''}
      ${(d.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
    </div>
    <label>标题</label>
    <input id="f-title" value="${escapeAttr(d.title)}" />
    <label>所属类别</label>
    <select id="f-cat">${ctx.kb.categories
      .map(
        (c) =>
          `<option value="${escapeAttr(c.id)}" ${c.id === d.categoryId ? 'selected' : ''}>${escapeHtml(c.title)}</option>`,
      )
      .join('')}</select>
    <label>内容</label>
    <textarea id="f-content">${escapeHtml(d.content)}</textarea>
    <label>AI 探索提示</label>
    <textarea id="f-ai">${escapeHtml(d.aiExplorePrompt)}</textarea>
    <label>状态</label>
    <select id="f-status">${statusOptions(d.status)}</select>
    <label class="field-row"><input type="checkbox" id="f-weak" class="check" ${d.weak ? 'checked' : ''}/><span>掌握不牢</span></label>
    <label>标签（逗号分隔）</label>
    <input id="f-tags" value="${escapeAttr((d.tags || []).join(', '))}" />

    <h3>关联知识点 · <span id="relCount">${relatedIds.length}</span></h3>
    <div id="relatedList" class="related-list"></div>
    <label>添加关联</label>
    <input type="search" id="relSearch" placeholder="搜索要关联的知识点…" />
    <div id="relSuggest" class="stack suggest-list"></div>

    <h3>面试问答</h3>
    <div id="qaList"></div>
    <button type="button" id="btnAddQa">＋ 添加问答</button>
    <div class="actions">
      <button type="button" class="primary" id="btnSave">保存</button>
      <button type="button" id="btnFocus">聚焦邻居视图</button>
      <button type="button" id="btnSel">${selected ? '取消多选' : '加入多选'}</button>
      <button type="button" id="btnQuiz" class="${inQuizPool ? 'quiz-added' : 'primary'}">${quizBtnLabel}</button>
      <button type="button" id="btnRemoveGraph">从图移除</button>
      <button type="button" class="danger" id="btnDel">从库中删除</button>
    </div>
  `;

  const relatedList = root.querySelector('#relatedList');
  const relSuggest = root.querySelector('#relSuggest');
  const relCount = root.querySelector('#relCount');

  function paintRelated() {
    relCount.textContent = String(relatedIds.length);
    const items = relatedIds
      .map((id) => ctx.kb.details.find((x) => x.id === id))
      .filter(Boolean);
    if (!items.length) {
      relatedList.innerHTML = `<p class="muted hint-block">暂无关联，请下方搜索添加</p>`;
      return;
    }
    relatedList.innerHTML = items
      .map((x) => {
        const xc = ctx.kb.categories.find((c) => c.id === x.categoryId);
        return `<div class="related-chip" data-rel="${x.id}">
          <span class="rel-title" title="${escapeAttr(x.title)}">${escapeHtml(x.title)}</span>
          <span class="rel-cat">${escapeHtml(xc?.title || '')}</span>
          <button type="button" class="icon-btn" data-rm-rel="${x.id}" title="移除关联">×</button>
        </div>`;
      })
      .join('');
    relatedList.querySelectorAll('[data-rm-rel]').forEach((btn) => {
      btn.onclick = () => {
        relatedIds = relatedIds.filter((id) => id !== btn.dataset.rmRel);
        paintRelated();
        paintSuggest(root.querySelector('#relSearch').value);
      };
    });
  }

  function paintSuggest(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
      relSuggest.innerHTML = '';
      return;
    }
    const hits = ctx.kb.details
      .filter(
        (x) =>
          x.id !== d.id &&
          !relatedIds.includes(x.id) &&
          (x.title.toLowerCase().includes(q) ||
            x.tags.some((t) => t.toLowerCase().includes(q)) ||
            x.id.toLowerCase().includes(q)),
      )
      .slice(0, 8);
    if (!hits.length) {
      relSuggest.innerHTML = `<p class="muted hint-block">无匹配</p>`;
      return;
    }
    relSuggest.innerHTML = hits
      .map((x) => {
        const xc = ctx.kb.categories.find((c) => c.id === x.categoryId);
        return `<button type="button" class="suggest-item" data-add-rel="${x.id}">
          <span>${escapeHtml(x.title)}</span>
          <span class="muted">${escapeHtml(xc?.title || '')}</span>
        </button>`;
      })
      .join('');
    relSuggest.querySelectorAll('[data-add-rel]').forEach((btn) => {
      btn.onclick = () => {
        if (!relatedIds.includes(btn.dataset.addRel)) relatedIds.push(btn.dataset.addRel);
        paintRelated();
        root.querySelector('#relSearch').value = '';
        paintSuggest('');
      };
    });
  }

  paintRelated();
  root.querySelector('#relSearch').oninput = (e) => paintSuggest(e.target.value);

  const qaList = root.querySelector('#qaList');
  /** @type {{id:string,question:string,answer:string}[]} */
  let qas = (d.interviewQA || []).map((qa) => ({ ...qa }));

  function paintQa() {
    qaList.innerHTML = qas
      .map(
        (qa, i) => `
      <div class="qa-block" data-i="${i}">
        <label>问题</label>
        <textarea data-q>${escapeHtml(qa.question)}</textarea>
        <label>参考答案</label>
        <textarea data-a>${escapeHtml(qa.answer)}</textarea>
        <button type="button" class="danger" data-del-qa="${i}">删除此问答</button>
      </div>`,
      )
      .join('') || `<p class="muted">暂无面试问答</p>`;

    qaList.querySelectorAll('[data-del-qa]').forEach((btn) => {
      btn.onclick = () => {
        qas.splice(Number(btn.dataset.delQa), 1);
        paintQa();
      };
    });
  }
  paintQa();

  root.querySelector('#btnAddQa').onclick = () => {
    qas.push({ id: newId('qa'), question: '', answer: '' });
    paintQa();
  };

  const applyLearnStatus = () => {
    ctx.onUpdateDetail(
      d.id,
      {
        status: root.querySelector('#f-status').value,
        weak: root.querySelector('#f-weak').checked,
      },
      { statusOnly: true },
    );
  };
  root.querySelector('#f-status').onchange = applyLearnStatus;
  root.querySelector('#f-weak').onchange = applyLearnStatus;

  root.querySelector('#btnSave').onclick = () => {
    qaList.querySelectorAll('.qa-block').forEach((block, i) => {
      if (!qas[i]) return;
      qas[i].question = block.querySelector('[data-q]').value;
      qas[i].answer = block.querySelector('[data-a]').value;
    });
    const tags = root
      .querySelector('#f-tags')
      .value.split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    ctx.onUpdateDetail(d.id, {
      title: root.querySelector('#f-title').value.trim() || d.title,
      categoryId: root.querySelector('#f-cat').value,
      content: root.querySelector('#f-content').value,
      aiExplorePrompt: root.querySelector('#f-ai').value,
      status: root.querySelector('#f-status').value,
      weak: root.querySelector('#f-weak').checked,
      tags,
      relatedIds,
      interviewQA: qas,
    });
  };

  root.querySelector('#btnFocus').onclick = () => ctx.onFocusNeighbor(d.id);
  root.querySelector('#btnSel').onclick = () => ctx.onToggleDetail(d.id);
  root.querySelector('#btnQuiz').onclick = () => {
    if (inQuizPool) {
      ctx.onRemoveFromQuizPool?.([d.id]);
      return;
    }
    const selectedIds = ctx.selection.getSelectedDetailIds();
    ctx.onAddToQuizPool?.(selectedIds.length ? selectedIds : [d.id]);
  };
  root.querySelector('#btnRemoveGraph').onclick = () => ctx.onRemoveFromGraph([d.id]);
  root.querySelector('#btnDel').onclick = () => {
    if (confirm(`从知识点库删除「${d.title}」？`)) ctx.onDeleteDetail(d.id);
  };
}

function statusOptions(current) {
  return STATUSES.map(
    (s) =>
      `<option value="${s}" ${s === current ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`,
  ).join('');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
