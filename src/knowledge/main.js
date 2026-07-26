import sampleKb from '../../data/sample-kb.json';
import { validateKnowledgeBase } from '../shared/schema.js';
import {
  downloadJson,
  readJsonFile,
  loadUiState,
  saveUiState,
  loadQuizPoolIds,
  addToQuizPool,
  removeFromQuizPool,
  saveQuizPoolIds,
  pruneQuizPool,
} from '../shared/storage.js';
import { createKbStore } from './kbStore.js';
import { createSelectionController } from './selection.js';
import { createGraphController } from './graph.js';
import { renderToolbar, renderSidebar, renderInfoPanel, toast } from './ui.js';

const toolbarEl = document.getElementById('toolbar');
const sidebarEl = document.getElementById('sidebar');
const panelEl = document.getElementById('infoPanel');
const hintEl = document.getElementById('graphHint');
const cyEl = document.getElementById('cy');
const mainRow = document.getElementById('mainRow');
const btnToggleLeft = document.getElementById('btnToggleLeft');
const btnToggleRight = document.getElementById('btnToggleRight');

const store = createKbStore();
const selection = createSelectionController(() => store.get());

/** @type {{ kind: string, refId: string } | null} */
let selectedTarget = null;
let searchQuery = '';
let tagFilterText = '';
let weakOnly = false;

/** @type {ReturnType<typeof createGraphController> | null} */
let graph = null;
let persistTimer = 0;

function setLeftOpen(open) {
  mainRow.classList.toggle('left-open', open);
  btnToggleLeft.classList.toggle('active', open);
  requestAnimationFrame(() => graph?.getCy?.()?.resize());
  schedulePersistUi();
}

function setRightOpen(open) {
  mainRow.classList.toggle('right-open', open);
  btnToggleRight.classList.toggle('active', open);
  requestAnimationFrame(() => graph?.getCy?.()?.resize());
  schedulePersistUi();
}

btnToggleLeft?.addEventListener('click', () => {
  setLeftOpen(!mainRow.classList.contains('left-open'));
});
btnToggleRight?.addEventListener('click', () => {
  setRightOpen(!mainRow.classList.contains('right-open'));
});

function schedulePersistUi() {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistUiState, 200);
}

function persistUiState() {
  if (!graph) return;
  const g = graph.getState();
  saveUiState({
    version: 1,
    graph: {
      mode: g.mode,
      focusCategoryId: g.focusCategoryId,
      focusDetailId: g.focusDetailId,
      freeform: g.freeform,
      visibleDetailIds: g.visibleDetailIds,
      tagFilter: g.tagFilter,
      weakOnly: g.weakOnly,
      zoom: g.zoom,
      pan: g.pan,
    },
    tagFilterText,
    weakOnly,
    selectedTarget,
    selectedDetailIds: selection.getSelectedDetailIds(),
    leftOpen: mainRow.classList.contains('left-open'),
    rightOpen: mainRow.classList.contains('right-open'),
  });
}

graph = createGraphController(cyEl, {
  onNodeClick: (data) => {
    selectedTarget = { kind: data.kind, refId: data.refId };
    setRightOpen(true);
    refreshPanel();
    schedulePersistUi();
  },
  onCategoryDblClick: (data) => {
    selectedTarget = { kind: 'category', refId: data.refId };
    graph.enterCategoryDetail(data.refId, store.get(), selOpts());
    setRightOpen(true);
    refreshPanel();
    updateHint();
    schedulePersistUi();
  },
  onBackgroundClick: () => {
    selectedTarget = null;
    refreshPanel();
    schedulePersistUi();
  },
});

// 首次空库 / 无类别时自动加载示例，避免进门空白
function ensureSampleKb() {
  const kb = store.get();
  if (kb.categories?.length) return;
  try {
    store.replaceFromImport(sampleKb);
  } catch (e) {
    console.error('加载示例知识点库失败', e);
    try {
      // 校验失败时仍尝试直接写入（开发兜底）
      localStorage.setItem('kg_knowledge_base_v1', JSON.stringify(sampleKb));
      location.reload();
    } catch (_) {
      /* ignore */
    }
  }
}

function selOpts() {
  return { selectedDetailIds: selection.getSelectedDetailIds() };
}

function refreshGraph() {
  graph.setTagFilter(
    tagFilterText
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
  );
  graph.setWeakOnly(weakOnly);
  const st = graph.getState();
  if (st.mode === 'categories') graph.showCategories(store.get(), selOpts());
  else graph.render(store.get(), selOpts());
  updateHint();
}

/** 仅刷新多选相关 UI，不重跑布局 / 不重置缩放平移 */
function refreshSelectionUi() {
  selection.pruneMissing();
  graph.applySelectionStyles(new Set(selection.getSelectedDetailIds()));
  refreshSidebar();
  refreshPanel();
  updateHint();
  syncSelectAllButtons();
  schedulePersistUi();
}

/** 当前图中可多选的详细知识点 id */
function getVisibleDetailIds() {
  const kb = store.get();
  const st = graph.getState();
  if (st.mode === 'categories') {
    return kb.details.map((d) => d.id);
  }
  const visible = new Set(st.visibleDetailIds || []);
  return kb.details.filter((d) => visible.has(d.id)).map((d) => d.id);
}

function isAllVisibleSelected() {
  const ids = getVisibleDetailIds();
  if (!ids.length) return false;
  return ids.every((id) => selection.isDetailSelected(id));
}

/** 同步顶栏「全选当前 / 取消全选」按钮文案 */
function syncSelectAllButtons() {
  const allOn = isAllVisibleSelected();
  const label = allOn ? '取消全选' : '全选当前';
  const title = allOn ? '取消多选当前图中的知识点' : '全选当前图中的知识点';
  const toolbarBtn = toolbarEl?.querySelector('[data-act="select-all"]');
  if (toolbarBtn) {
    toolbarBtn.textContent = label;
    toolbarBtn.title = title;
    toolbarBtn.classList.toggle('active', allOn);
  }
}

/** 全选 / 取消全选当前图中可见的详细知识点 */
function selectAllVisibleOnGraph() {
  const ids = getVisibleDetailIds();
  if (!ids.length) {
    toast('当前图中没有可多选的详细知识点', 'error');
    return;
  }
  if (ids.every((id) => selection.isDetailSelected(id))) {
    selection.unselectDetails(ids);
    refreshSelectionUi();
    toast(`已取消全选 ${ids.length} 个知识点`, 'ok');
    return;
  }
  selection.addDetails(ids);
  refreshSelectionUi();
  toast(`已全选当前 ${ids.length} 个知识点`, 'ok');
}

function updateHint() {
  const st = graph.getState();
  const modeLabel =
    st.mode === 'categories'
      ? '类别视图'
      : st.mode === 'categoryDetail'
        ? `类别详情：${store.getCategory(st.focusCategoryId)?.title || ''}`
        : `聚焦邻居：${store.getDetail(st.focusDetailId)?.title || ''}`;
  const filters = [];
  if (st.weakOnly) filters.push('weak');
  if (st.tagFilter.length) filters.push(`标签:${st.tagFilter.join('+')}`);
  const poolCount = loadQuizPoolIds().length;
  hintEl.textContent = `${modeLabel}${filters.length ? ` · 筛选 ${filters.join(', ')}` : ''} · 多选 ${selection.getSelectedDetailIds().length} · 面试池 ${poolCount}`;
  syncSelectAllButtons();
}

function quizPoolHandlers() {
  return {
    quizPoolIds: loadQuizPoolIds(),
    onAddToQuizPool: (ids) => {
      const list = (ids || []).filter((id) => store.getDetail(id));
      if (!list.length) {
        toast('请先多选详细知识点，或打开一个知识点再添加', 'error');
        return;
      }
      const { added } = addToQuizPool(list);
      refreshSelectionUi();
      toast(
        added
          ? `已加入面试模拟 ${added} 个知识点（池内共 ${loadQuizPoolIds().length}）`
          : '所选知识点已在面试池中',
        added ? 'ok' : '',
      );
    },
    onRemoveFromQuizPool: (ids) => {
      const { removed } = removeFromQuizPool(ids || []);
      refreshSelectionUi();
      if (removed) toast(`已移出面试池 ${removed} 个`, 'ok');
    },
    onClearQuizPool: () => {
      if (!loadQuizPoolIds().length) return;
      if (!confirm('清空面试模拟池？')) return;
      saveQuizPoolIds([]);
      refreshSelectionUi();
      toast('已清空面试池', 'ok');
    },
  };
}

function refreshSidebar() {
  const results = searchQuery ? store.search(searchQuery) : null;
  renderSidebar(sidebarEl, {
    kb: store.get(),
    selection,
    searchQuery,
    searchResults: results,
    tagFilterText,
    weakOnly,
    ...quizPoolHandlers(),
    onClose: () => setLeftOpen(false),
    onSearch: (q) => {
      searchQuery = q;
      refreshSidebar();
    },
    onAddToGraph: (ids) => {
      graph.addToGraph(ids, store.get(), selOpts());
      updateHint();
      toast(`已加入图：${ids.length} 项`, 'ok');
    },
    onClearSelection: () => {
      selection.clear();
      refreshSelectionUi();
    },
    onWeakOnly: (v) => {
      weakOnly = v;
      refreshGraph();
      refreshSidebar();
    },
    onTagFilter: (text) => {
      tagFilterText = text;
      refreshGraph();
      toast('已应用标签筛选', 'ok');
    },
    onToggleCategory: (id) => {
      selection.toggleCategory(id);
      refreshSelectionUi();
    },
    onToggleDetail: (id) => {
      selection.toggleDetail(id);
      refreshSelectionUi();
    },
  });
}

function refreshPanel() {
  renderInfoPanel(panelEl, {
    target: selectedTarget,
    kb: store.get(),
    selection,
    ...quizPoolHandlers(),
    onClose: () => setRightOpen(false),
    onUpdateCategory: (id, patch, opts = {}) => {
      store.updateCategory(id, patch);
      if (opts.statusOnly) {
        graph.refreshStatusStyles(store.get());
        graph.applySelectionStyles(new Set(selection.getSelectedDetailIds()));
        refreshSidebar();
        // 更新顶部状态芯片
        const chip = panelEl.querySelector('.chip-row');
        if (chip) refreshPanel();
        schedulePersistUi();
        return;
      }
      toast('类别已保存', 'ok');
      refreshAll();
      schedulePersistUi();
    },
    onUpdateDetail: (id, patch, opts = {}) => {
      store.updateDetail(id, patch);
      if (opts.statusOnly) {
        graph.refreshStatusStyles(store.get());
        graph.applySelectionStyles(new Set(selection.getSelectedDetailIds()));
        refreshSidebar();
        refreshPanel();
        schedulePersistUi();
        return;
      }
      toast('知识点已保存', 'ok');
      refreshAll();
      schedulePersistUi();
    },
    onEnterCategory: (id) => {
      graph.enterCategoryDetail(id, store.get(), selOpts());
      setRightOpen(true);
      updateHint();
      schedulePersistUi();
    },
    onFocusNeighbor: (id) => {
      graph.enterFocusNeighbor(id, store.get(), selOpts());
      setRightOpen(true);
      updateHint();
      schedulePersistUi();
    },
    onToggleCategory: (id) => {
      selection.toggleCategory(id);
      refreshSelectionUi();
    },
    onToggleDetail: (id) => {
      selection.toggleDetail(id);
      refreshSelectionUi();
    },
    onRemoveFromGraph: (ids) => {
      selection.unselectDetails(ids);
      graph.removeFromGraph(ids, store.get(), selOpts());
      if (selectedTarget && ids.includes(selectedTarget.refId)) selectedTarget = null;
      toast('已从图移除（库内保留）', 'ok');
      refreshAll();
    },
    onDeleteCategory: (id) => {
      store.deleteCategory(id);
      selection.pruneMissing();
      pruneQuizPool(store.get());
      selectedTarget = null;
      graph.showCategories(store.get(), selOpts());
      toast('类别已删除', 'ok');
      refreshAll();
    },
    onDeleteDetail: (id) => {
      store.deleteDetail(id);
      selection.pruneMissing();
      pruneQuizPool(store.get());
      if (selectedTarget?.refId === id) selectedTarget = null;
      refreshGraph();
      toast('知识点已删除', 'ok');
      refreshAll();
    },
  });
}

function refreshAll() {
  selection.pruneMissing();
  pruneQuizPool(store.get());
  graph.applySelectionStyles(new Set(selection.getSelectedDetailIds()));
  refreshSidebar();
  refreshPanel();
  updateHint();
  // 库变更时重绘当前视图
  refreshGraph();
  schedulePersistUi();
}

renderToolbar(toolbarEl, {
  onViewCategories: () => {
    graph.showCategories(store.get(), selOpts());
    updateHint();
    syncSelectAllButtons();
    schedulePersistUi();
  },
  onExpand: () => {
    const st = graph.getState();
    if (st.mode === 'categories') {
      toast('请先进入类别详情或聚焦视图后再扩展', 'error');
      return;
    }
    const { added } = graph.expandOneLayer(store.get(), selOpts());
    updateHint();
    syncSelectAllButtons();
    toast(added ? `扩展了 ${added} 个节点` : '没有更多可扩展的关联节点', added ? 'ok' : '');
    schedulePersistUi();
  },
  onSelectAllVisible: () => {
    selectAllVisibleOnGraph();
  },
  onExportInterview: () => {
    const ids = selection.getSelectedDetailIds();
    if (!ids.length) {
      toast('请先多选详细知识点（或全选类别）', 'error');
      return;
    }
    const { exportData, skipped } = store.exportInterview(ids);
    if (!exportData.questions.length) {
      toast('选中项没有可导出的面试问答', 'error');
      return;
    }
    downloadJson(JSON.stringify(exportData, null, 2), `interview-export-${Date.now()}.json`);
    if (skipped.length) {
      toast(
        `已导出 ${exportData.questions.length} 题；跳过无 QA：${skipped.map((s) => s.title).join('、')}`,
        '',
      );
    } else {
      toast(`已导出 ${exportData.questions.length} 道面试题`, 'ok');
    }
  },
  onExportKb: () => {
    downloadJson(JSON.stringify(store.get(), null, 2), `knowledge-base-${Date.now()}.json`);
    toast('知识点库已导出', 'ok');
  },
  onImportKb: async (file) => {
    try {
      const data = await readJsonFile(file);
      const result = validateKnowledgeBase(data);
      if (!result.ok) throw new Error(result.errors.join('\n'));
      store.replaceFromImport(result.data);
      selection.clear();
      selectedTarget = null;
      graph.showCategories(store.get(), selOpts());
      toast('知识点库已导入', 'ok');
      refreshAll();
    } catch (e) {
      toast(`导入失败：${e.message || e}`, 'error');
    }
  },
  onNewCategory: () => {
    const cat = store.addCategory({ title: '新类别' });
    selectedTarget = { kind: 'category', refId: cat.id };
    setRightOpen(true);
    refreshAll();
    toast('已新建类别', 'ok');
  },
  onNewDetail: () => {
    const kb = store.get();
    if (!kb.categories.length) {
      toast('请先新建类别', 'error');
      return;
    }
    const st = graph.getState();
    const categoryId =
      st.focusCategoryId ||
      (selectedTarget?.kind === 'category' ? selectedTarget.refId : null) ||
      kb.categories[0].id;
    const det = store.addDetail({ categoryId, title: '新知识点' });
    selectedTarget = { kind: 'detail', refId: det.id };
    setRightOpen(true);
    refreshAll();
    toast('已新建详细知识点', 'ok');
  },
});

store.subscribe(() => {
  // persist 已在 store 内完成；此处避免循环，仅同步选择
  selection.pruneMissing();
});

selection.subscribe(() => {
  refreshSidebar();
  refreshPanel();
  graph.applySelectionStyles(new Set(selection.getSelectedDetailIds()));
  updateHint();
  schedulePersistUi();
});

ensureSampleKb();

// 恢复上次界面会话（视图 / 侧栏 / 多选 / 镜头）
const savedUi = loadUiState();
if (savedUi) {
  tagFilterText = typeof savedUi.tagFilterText === 'string' ? savedUi.tagFilterText : '';
  weakOnly = Boolean(savedUi.weakOnly);
  if (savedUi.selectedTarget && typeof savedUi.selectedTarget === 'object') {
    const t = /** @type {{ kind?: string, refId?: string }} */ (savedUi.selectedTarget);
    if (t.kind && t.refId) selectedTarget = { kind: t.kind, refId: t.refId };
  }
  if (Array.isArray(savedUi.selectedDetailIds)) {
    selection.replaceSelection(savedUi.selectedDetailIds.filter((id) => store.getDetail(id)));
  }
  graph.setTagFilter(
    tagFilterText
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
  );
  graph.setWeakOnly(weakOnly);
  graph.restoreState(/** @type {any} */ (savedUi.graph), store.get(), selOpts());
  graph.applySelectionStyles(new Set(selection.getSelectedDetailIds()));
  if (savedUi.leftOpen) setLeftOpen(true);
  if (savedUi.rightOpen) setRightOpen(true);
} else {
  refreshGraph();
}

refreshSidebar();
refreshPanel();
updateHint();

requestAnimationFrame(() => {
  const cy = graph.getCy?.();
  if (cy) {
    cy.resize();
    if (!savedUi?.graph?.zoom && cy.elements().nonempty()) cy.fit(cy.elements(), 80);
  } else if (!savedUi) {
    graph.showCategories(store.get(), selOpts());
  }
  schedulePersistUi();
});

window.addEventListener('beforeunload', persistUiState);
