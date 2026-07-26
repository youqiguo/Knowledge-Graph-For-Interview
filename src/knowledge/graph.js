import cytoscape from 'cytoscape';
import {
  computeCategoryLinks,
  getExternalNeighborsByCategory,
  getDirectNeighbors,
  getDetailDegree,
} from '../shared/schema.js';
import { colorForId, rebuildCategoryColors } from '../shared/colors.js';
import {
  layoutForce,
  layoutCategoryForce,
  categoryNodeSize,
  detailNodeSize,
  hardSeparate,
  ringRadiusForSizes,
} from '../shared/categoryLayout.js';
import {
  createRegionOverlay,
  enforceExternalDistance,
  snapExternalsToSectors,
  compactGroups,
} from './regionOverlay.js';
import { createEdgeOverlay } from './edgeOverlay.js';

/**
 * @typedef {'categories' | 'categoryDetail' | 'focusNeighbor'} ViewMode
 */

/**
 * Cytoscape 图谱控制器
 */
export function createGraphController(container, hooks = {}) {
  /** @type {import('cytoscape').Core | null} */
  let cy = null;
  /** @type {ViewMode} */
  let mode = 'categories';
  /** @type {string | null} */
  let focusCategoryId = null;
  /** @type {string | null} */
  let focusDetailId = null;
  /** @type {Set<string>} 当前图中的详细知识点 id */
  let visibleDetailIds = new Set();
  /** @type {string[]} 标签筛选（空 = 不过滤） */
  let tagFilter = [];
  /** @type {boolean} 仅显示 weak */
  let weakOnly = false;
  /** 扩展/手动加点后进入自由布局，避免刷新时丢掉可见集 */
  let freeform = false;
  /** @type {number | null} */
  let pulseTimer = null;
  let pulsePhase = 0;
  /** @type {ReturnType<typeof createRegionOverlay> | null} */
  let regionOverlay = null;
  /** @type {ReturnType<typeof createEdgeOverlay> | null} */
  let edgeOverlay = null;

  const FONT =
    '"IBM Plex Sans", "IBM Plex Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  const BASE_FONT = 13;
  const BASE_LABEL_FONT = 12;
  /** 本类簇外包络到外部分区节点的强制间距 */
  const EXTERNAL_CORE_GAP = 100;
  /** 详细知识点硬碰撞间隙（类别视图仍用更大间距） */
  const DETAIL_MIN_GAP = 64;

  function ensureCy() {
    if (cy) return cy;
    if (!regionOverlay) regionOverlay = createRegionOverlay(container);
    if (!edgeOverlay) edgeOverlay = createEdgeOverlay(container);
    cy = cytoscape({
      container,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            color: 'rgba(220, 220, 226, 0.9)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 10,
            'text-wrap': 'ellipsis',
            'text-max-width': 120,
            'font-size': BASE_FONT,
            'font-family': FONT,
            'font-weight': 400,
            'text-outline-width': 3,
            'text-outline-color': 'rgba(8, 8, 10, 0.92)',
            // 空心光环节点（关联线由 edgeOverlay 裁切球体段）
            'background-color': 'data(color)',
            'background-opacity': 0.14,
            width: 'data(size)',
            height: 'data(size)',
            'border-width': 2.5,
            'border-color': 'data(color)',
            'border-opacity': 0.9,
            'overlay-opacity': 0,
            'underlay-color': 'data(color)',
            'underlay-opacity': 0.22,
            'underlay-padding': 6,
            'underlay-shape': 'ellipse',
            'z-index-compare': 'auto',
            'z-index': 10,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': 'rgba(255,255,255,0.92)',
            'underlay-opacity': 0.4,
            'underlay-padding': 10,
            'z-index': 20,
          },
        },
        {
          selector: 'node.selected-multi',
          style: {
            'border-width': 3,
            'border-color': '#f5d76e',
            'underlay-color': '#f5d76e',
            'underlay-opacity': 0.35,
            'z-index': 15,
          },
        },
        {
          selector: 'node.category',
          style: {
            // Obsidian 式：实心彩色球 + 光晕，类别色来自 data(color)
            'background-color': 'data(color)',
            'background-opacity': 0.82,
            'border-width': 2,
            'border-color': 'data(color)',
            'border-opacity': 1,
            'underlay-color': 'data(color)',
            'underlay-opacity': 0.4,
            'underlay-padding': 10,
            'text-margin-y': 14,
            color: 'rgba(245, 245, 250, 0.96)',
            'font-weight': 500,
            'z-index': 10,
          },
        },
        {
          selector: 'node.detail',
          style: {
            color: 'rgba(210, 210, 218, 0.88)',
            'z-index': 10,
          },
        },
        // —— 学习状态：详细节点可弱化；类别节点始终保留类别色 ——
        {
          selector: 'node.detail.status-unlearned',
          style: {
            'background-opacity': 0.1,
            'border-style': 'dashed',
            'border-opacity': 0.75,
            'underlay-opacity': 0.16,
            color: 'rgba(200, 200, 210, 0.88)',
          },
        },
        {
          selector: 'node.detail.status-learning',
          style: {
            'background-opacity': 0.16,
            'border-style': 'solid',
            'border-opacity': 0.95,
            'underlay-opacity': 0.28,
          },
        },
        {
          selector: 'node.detail.status-mastered',
          style: {
            'background-opacity': 0.2,
            'border-style': 'solid',
            'border-width': 3,
            'border-color': '#3ecf8e',
            'underlay-color': '#3ecf8e',
            'underlay-opacity': 0.26,
            color: 'rgba(230, 240, 234, 0.95)',
          },
        },
        {
          selector: 'node.detail.status-weak',
          style: {
            'border-color': '#e6a23c',
            'border-width': 3,
            'border-style': 'solid',
            'underlay-color': '#e6a23c',
            'underlay-opacity': 0.34,
            color: 'rgba(255, 220, 170, 0.95)',
          },
        },
        {
          selector: 'node.category.status-weak',
          style: {
            'border-color': '#e6a23c',
            'border-width': 3,
            'underlay-color': '#e6a23c',
            'underlay-opacity': 0.45,
          },
        },
        {
          selector: 'edge',
          style: {
            // 实际线条由 edgeOverlay 绘制并裁切球体段；这里隐藏原生边
            width: 'data(weight)',
            opacity: 0,
            'curve-style': 'straight',
            events: 'no',
          },
        },
        {
          selector: 'node.region',
          style: {
            label: '',
            shape: 'ellipse',
            'background-opacity': 0.03,
            'background-color': 'data(color)',
            'border-width': 2,
            'border-style': 'dashed',
            'border-opacity': 0.75,
            'border-color': 'data(border)',
            'underlay-color': 'data(border)',
            'underlay-opacity': 0.14,
            'underlay-padding': 3,
            'underlay-shape': 'ellipse',
            events: 'no',
            'z-index-compare': 'auto',
            'z-index': 0,
          },
        },
        {
          selector: 'node.region-label',
          style: {
            label: 'data(label)',
            shape: 'round-rectangle',
            width: 'label',
            height: 'label',
            padding: 8,
            'background-color': '#121214',
            'background-opacity': 0.88,
            'border-width': 1,
            'border-color': 'data(border)',
            'border-opacity': 0.75,
            color: 'rgba(210,210,218,0.92)',
            'font-size': BASE_LABEL_FONT,
            'font-weight': 400,
            'font-family': FONT,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-margin-y': 0,
            'text-outline-width': 0,
            events: 'no',
            'z-index-compare': 'auto',
            'z-index': 5,
            'underlay-opacity': 0,
          },
        },
      ],
      layout: { name: 'preset' },
      wheelSensitivity: 2.2,
      minZoom: 0.12,
      maxZoom: 4,
      pixelRatio: 'auto',
    });

    edgeOverlay.bind(cy);

    // cytoscape 画布在 edge/region overlay 之上，只显示节点
    requestAnimationFrame(() => {
      const canvases = container.querySelectorAll('canvas');
      canvases.forEach((el) => {
        if (el.classList.contains('region-overlay') || el.classList.contains('edge-overlay')) return;
        el.style.position = el.style.position || 'absolute';
        el.style.zIndex = '2';
      });
    });

    cy.on('tap', 'node', (evt) => {
      const n = evt.target;
      if (n.hasClass('region') || n.hasClass('region-label')) return;
      hooks.onNodeClick?.(n.data());
    });

    cy.on('dbltap', 'node.category', (evt) => {
      const data = evt.target.data();
      hooks.onCategoryDblClick?.(data);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) hooks.onBackgroundClick?.();
    });

    cy.on('zoom', () => {
      syncScreenFonts();
      regionOverlay?.paint();
      edgeOverlay?.paint();
    });
    cy.on('pan render', () => {
      regionOverlay?.paint();
      edgeOverlay?.paint();
    });
    startPulse();
    return cy;
  }

  function clearRegionBands() {
    regionOverlay?.clear();
  }

  /** 字号按屏幕像素固定，不随画布缩放变大变小 */
  function syncScreenFonts() {
    if (!cy) return;
    const z = Math.max(cy.zoom(), 0.05);
    const fs = BASE_FONT / z;
    const fsLabel = BASE_LABEL_FONT / z;
    const maxW = 120 / z;
    cy.batch(() => {
      cy.nodes('.category, .detail').style({
        'font-size': fs,
        'text-max-width': maxW,
      });
      cy.nodes('.region-label').style({ 'font-size': fsLabel });
    });
  }

  function startPulse() {
    if (pulseTimer != null) return;
    pulseTimer = window.setInterval(() => {
      if (!cy || cy.destroyed()) return;
      pulsePhase = (pulsePhase + 1) % 60;
      const t = (Math.sin((pulsePhase / 60) * Math.PI * 2) + 1) / 2; // 0..1
      const pad = 6 + t * 5;
      const op = 0.22 + t * 0.18;
      cy.batch(() => {
        cy.nodes('.category, .detail').forEach((n) => {
          if (n.hasClass('selected-multi') || n.hasClass('status-weak') || n.hasClass('status-mastered')) {
            return;
          }
          n.style({
            'underlay-padding': pad,
            'underlay-opacity': op,
          });
        });
      });
    }, 50);
  }

  /** 入场动效：不把 opacity 置 0（避免动画失败时节点永久隐形） */
  function playEntrance() {
    if (!cy) return;
    const nodes = cy.nodes('.category, .detail');
    cy.batch(() => {
      nodes.forEach((n) => {
        n.removeStyle('opacity');
        n.style('opacity', 1);
      });
      // 原生边始终隐藏，可见线由 edgeOverlay 绘制
      cy.edges().forEach((e) => {
        e.style('opacity', 0);
      });
    });
    edgeOverlay?.paint();
    // 轻微放大回弹
    nodes.forEach((n, i) => {
      const base = Number(n.data('size')) || 30;
      n.style({ width: base * 0.55, height: base * 0.55 });
      setTimeout(() => {
        if (!cy || cy.destroyed() || !n.inside()) return;
        n.animate({
          style: { width: base, height: base },
          duration: 380,
          easing: 'ease-out',
        });
      }, Math.min(i * 24, 400));
    });
  }

  function fitSafe(padding = 72) {
    if (!cy) return;
    cy.resize();
    const eles = cy.elements();
    if (eles.nonempty()) cy.fit(eles, padding);
  }

  function getState() {
    ensureCy();
    return {
      mode,
      focusCategoryId,
      focusDetailId,
      freeform,
      visibleDetailIds: [...visibleDetailIds],
      tagFilter: [...tagFilter],
      weakOnly,
      zoom: cy ? cy.zoom() : 1,
      pan: cy ? cy.pan() : { x: 0, y: 0 },
    };
  }

  /**
   * 恢复视图会话（刷新网页后）
   * @param {object | null} state
   * @param {import('../shared/schema.js').KnowledgeBase} kb
   * @param {{ selectedDetailIds?: string[] }} [opts]
   */
  function restoreState(state, kb, opts = {}) {
    if (!state || !state.mode) {
      showCategories(kb, opts);
      return;
    }
    mode = state.mode;
    focusCategoryId = state.focusCategoryId || null;
    focusDetailId = state.focusDetailId || null;
    freeform = Boolean(state.freeform);
    visibleDetailIds = new Set(Array.isArray(state.visibleDetailIds) ? state.visibleDetailIds : []);
    tagFilter = Array.isArray(state.tagFilter) ? [...state.tagFilter] : [];
    weakOnly = Boolean(state.weakOnly);

    // 校验焦点是否仍存在
    if (mode === 'categoryDetail' && (!focusCategoryId || !kb.categories.some((c) => c.id === focusCategoryId))) {
      showCategories(kb, opts);
      return;
    }
    if (mode === 'focusNeighbor' && (!focusDetailId || !kb.details.some((d) => d.id === focusDetailId))) {
      showCategories(kb, opts);
      return;
    }

    render(kb, opts);

    if (cy && typeof state.zoom === 'number') {
      cy.zoom(state.zoom);
      if (state.pan && typeof state.pan.x === 'number') cy.pan(state.pan);
      syncScreenFonts();
    }
  }

  /** 仅刷新节点状态样式（改学习状态时不必重跑布局） */
  function refreshStatusStyles(kb) {
    if (!cy) return;
    const catIds = kb.categories.map((c) => c.id);
    rebuildCategoryColors(catIds, categoryEdgePairs(computeCategoryLinks(kb)));
    cy.batch(() => {
      for (const c of kb.categories) {
        const n = cy.getElementById(c.id);
        if (!n.nonempty()) continue;
        const kids = kb.details.filter((d) => d.categoryId === c.id);
        const anyWeak = c.weak || kids.some((d) => d.weak);
        n.data('status', c.status);
        n.data('color', colorForId(c.id));
        n.classes(statusClassList(c.status, anyWeak, 'category'));
      }
      for (const d of kb.details) {
        const n = cy.getElementById(d.id);
        if (!n.nonempty()) continue;
        n.data('status', d.status);
        n.data('color', colorForId(d.categoryId));
        n.classes(statusClassList(d.status, d.weak, 'detail'));
      }
    });
  }

  function setTagFilter(tags) {
    tagFilter = (tags || []).map((t) => String(t).trim()).filter(Boolean);
  }

  function setWeakOnly(v) {
    weakOnly = Boolean(v);
  }

  function passesFilter(detail) {
    if (weakOnly && !detail.weak) return false;
    if (!tagFilter.length) return true;
    const tags = detail.tags || [];
    return tagFilter.every((t) => tags.includes(t));
  }

  /**
   * @param {import('../shared/schema.js').KnowledgeBase} kb
   * @param {{ selectedDetailIds?: string[] }} [opts]
   */
  function render(kb, opts = {}) {
    const selected = new Set(opts.selectedDetailIds || []);
    ensureCy();
    rebuildCategoryColors(
      kb.categories.map((c) => c.id),
      categoryEdgePairs(computeCategoryLinks(kb)),
    );

    if (freeform && mode !== 'categories') {
      // 清理已删除的 id
      const alive = new Set(kb.details.map((d) => d.id));
      visibleDetailIds = new Set([...visibleDetailIds].filter((id) => alive.has(id)));
      renderExpandedSet(kb, opts);
      return;
    }

    cy.elements().remove();

    if (mode === 'categories') {
      renderCategoryView(kb, selected);
    } else if (mode === 'categoryDetail') {
      renderCategoryDetailView(kb, selected);
    } else if (mode === 'focusNeighbor') {
      renderFocusNeighborView(kb, selected);
    }

    applySelectionStyles(selected);
  }

  /** @returns {[string, string][]} */
  function categoryEdgePairs(links) {
    /** @type {[string, string][]} */
    const pairs = [];
    for (const key of links.keys()) {
      const [a, b] = key.split('|');
      pairs.push([a, b]);
    }
    return pairs;
  }

  function renderCategoryView(kb) {
    visibleDetailIds = new Set();
    const links = computeCategoryLinks(kb);
    const degree = new Map(kb.categories.map((c) => [c.id, 0]));
    for (const [key, count] of links) {
      const [a, b] = key.split('|');
      degree.set(a, (degree.get(a) || 0) + count);
      degree.set(b, (degree.get(b) || 0) + count);
    }

    const catIds = kb.categories.map((c) => c.id);
    const edgePairs = categoryEdgePairs(links);
    // 邻接感知着色：有边相连的类别色相拉开
    rebuildCategoryColors(catIds, edgePairs);

    const layoutNodes = [];
    const elements = [];
    for (const c of kb.categories) {
      const deg = degree.get(c.id) || 0;
      const kids = kb.details.filter((d) => d.categoryId === c.id);
      const size = categoryNodeSize(deg, kids.length);
      const anyWeak = c.weak || kids.some((d) => d.weak);
      layoutNodes.push({ id: c.id, size });
      elements.push({
        group: 'nodes',
        data: {
          id: c.id,
          label: c.title,
          kind: 'category',
          color: colorForId(c.id),
          size,
          refId: c.id,
          status: c.status,
        },
        classes: statusClassList(c.status, anyWeak, 'category'),
      });
    }

    const layoutEdges = [];
    for (const [key, count] of links) {
      const [a, b] = key.split('|');
      const weight = Math.max(1, Math.min(6, 1 + count));
      layoutEdges.push({ source: a, target: b, weight });
      elements.push({
        group: 'edges',
        data: {
          id: `e_${a}_${b}`,
          source: a,
          target: b,
          weight,
        },
      });
    }

    cy.add(elements);

    // Obsidian 式力导向 + 硬碰撞最小间距（不用 cose，避免重叠/塌缩）
    const n = Math.max(kb.categories.length, 1);
    const positions = layoutCategoryForce(layoutNodes, layoutEdges, {
      minGap: 112,
      iterations: 280 + Math.min(200, n * 8),
      idealEdge: 150 + Math.min(80, n * 3),
      charge: 6500 + n * 180,
      gravity: 0.03,
    });
    applyPositions(positions);
    clearRegionBands();
    cy.layout({ name: 'preset', fit: true, padding: 90 }).run();
    fitSafe(100);
    syncScreenFonts();
    playEntrance();
  }

  /** @param {Map<string, { x: number, y: number }> | Record<string, { x: number, y: number }>} positions */
  function applyPositions(positions) {
    if (!cy) return;
    const entries = positions instanceof Map ? positions.entries() : Object.entries(positions);
    cy.batch(() => {
      for (const [id, p] of entries) {
        const node = cy.getElementById(id);
        if (node.nonempty()) node.position({ x: p.x, y: p.y });
      }
    });
  }

  /**
   * 从当前图中详细节点 + 边跑力导向（可带种子坐标）
   * @param {import('../shared/schema.js').KnowledgeBase} kb
   * @param {Iterable<string>} detailIds
   * @param {Record<string, { x: number, y: number }>} [seeds]
   * @param {{ pinIds?: string[], anchorStrength?: number, minGap?: number }} [opts]
   */
  function runDetailForceLayout(kb, detailIds, seeds = {}, opts = {}) {
    const idList = [...detailIds];
    const detMap = new Map(kb.details.map((d) => [d.id, d]));
    const layoutNodes = idList.map((id) => {
      const d = detMap.get(id);
      const size = detailNodeSize(d ? getDetailDegree(kb, id) : 0);
      const seed = seeds[id];
      return seed
        ? { id, size, x: seed.x, y: seed.y }
        : { id, size };
    });
    const layoutEdges = [];
    const seen = new Set();
    const idSet = new Set(idList);
    const homeCat = opts.homeCategoryId || null;
    for (const id of idList) {
      const d = detMap.get(id);
      if (!d) continue;
      for (const rid of d.relatedIds || []) {
        if (!idSet.has(rid)) continue;
        const key = [id, rid].sort().join('~');
        if (seen.has(key)) continue;
        seen.add(key);
        const other = detMap.get(rid);
        // 跨类别关联用更强弹簧，避免左右值↔vector/智能指针被甩太远
        const cross =
          homeCat
            ? (d.categoryId === homeCat) !== (other?.categoryId === homeCat)
            : d.categoryId !== other?.categoryId;
        layoutEdges.push({ source: id, target: rid, weight: cross ? 5 : 2 });
      }
    }
    // 同组虚边：把同一外部分区的点捆在一起
    for (const e of opts.extraEdges || []) {
      if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
      const key = [e.source, e.target].sort().join('~');
      if (seen.has(key)) continue;
      seen.add(key);
      layoutEdges.push({ source: e.source, target: e.target, weight: e.weight ?? 4 });
    }
    const n = Math.max(idList.length, 1);
    const minGap = opts.minGap ?? DETAIL_MIN_GAP;
    // 有关联的点：目标边长略大于碰撞下限即可，别再额外撑开
    const idealEdge = opts.idealEdge ?? minGap + 28;
    const laid = layoutForce(layoutNodes, layoutEdges, {
      minGap,
      iterations: opts.iterations ?? 260 + Math.min(200, n * 8),
      idealEdge,
      charge: opts.charge ?? 5200 + n * 140,
      gravity: opts.gravity ?? 0.022,
      anchorStrength: opts.anchorStrength ?? 0,
      pinIds: opts.pinIds || [],
    });
    hardSeparate(laid, minGap, 48);
    return laid;
  }

  /**
   * @param {import('../shared/schema.js').KnowledgeBase} kb
   * @param {string[]} localIds
   * @param {string[]} externalIds
   */
  function buildRelatedLocalMap(kb, localIds, externalIds) {
    const localSet = new Set(localIds);
    const detMap = new Map(kb.details.map((d) => [d.id, d]));
    /** @type {Map<string, string[]>} */
    const map = new Map();
    for (const extId of externalIds) {
      const rel = new Set();
      const d = detMap.get(extId);
      for (const rid of d?.relatedIds || []) {
        if (localSet.has(rid)) rel.add(rid);
      }
      for (const lid of localIds) {
        const ld = detMap.get(lid);
        if ((ld?.relatedIds || []).includes(extId)) rel.add(lid);
      }
      if (rel.size) map.set(extId, [...rel]);
    }
    return map;
  }

  function statusClassList(status, weak, kind) {
    const st = status === 'mastered' || status === 'learning' ? status : 'unlearned';
    const parts = [kind, `status-${st}`];
    if (weak) parts.push('status-weak');
    return parts.join(' ');
  }

  function renderCategoryDetailView(kb, selected) {
    const catId = focusCategoryId;
    if (!catId) {
      mode = 'categories';
      return renderCategoryView(kb, selected);
    }

    const detMap = new Map(kb.details.map((d) => [d.id, d]));
    const local = kb.details.filter((d) => d.categoryId === catId && passesFilter(d));
    const externalByCat = getExternalNeighborsByCategory(kb, catId);
    const filteredExternal = new Map();
    for (const [extCatId, details] of externalByCat) {
      const list = details.filter(passesFilter);
      if (list.length) filteredExternal.set(extCatId, list);
    }

    visibleDetailIds = new Set([
      ...local.map((d) => d.id),
      ...[...filteredExternal.values()].flat().map((d) => d.id),
    ]);

    const elements = [];
    const localIds = local.map((d) => d.id);
    const DETAIL_GAP = DETAIL_MIN_GAP;
    const extCats = [...filteredExternal.keys()];
    const sectorCount = Math.max(extCats.length, 1);

    // —— 外部分区均匀占位（保证最小角距），再据此安放有跨链的本类点 ——
    /** @type {Map<string, number>} */
    const sectorAngle = new Map();
    // 分区少时也拉开：2 个约 180°，3 个 120°；更多则均分整圆
    const sectorStep = (Math.PI * 2) / sectorCount;
    const sectorBase = -Math.PI / 2;
    extCats.forEach((extCatId, idx) => {
      sectorAngle.set(extCatId, sectorBase + (idx + 0.5) * sectorStep);
    });

    /** 本类点 -> 其关联的外部分区类别 id */
    /** @type {Map<string, string[]>} */
    const localToExtCats = new Map();
    /** 外部详情 id 集合，便于反查 */
    const extDetailSet = new Set(
      [...filteredExternal.values()].flat().map((d) => d.id),
    );
    for (const d of local) {
      const cats = new Set();
      for (const rid of d.relatedIds || []) {
        if (!extDetailSet.has(rid)) continue;
        const other = detMap.get(rid);
        if (other) cats.add(other.categoryId);
      }
      for (const [extCatId, details] of filteredExternal) {
        for (const ed of details) {
          if ((ed.relatedIds || []).includes(d.id)) cats.add(extCatId);
        }
      }
      localToExtCats.set(d.id, [...cats]);
    }

    const localSizes = local.map((d) => detailNodeSize(getDetailDegree(kb, d.id)));
    const localR = ringRadiusForSizes(localSizes, DETAIL_GAP);
    /** @type {Record<string, { x: number, y: number }>} */
    const allSeeds = {};

    const linkedLocals = [];
    const freeLocals = [];
    for (const d of local) {
      elements.push(detailNode(d, kb));
      if ((localToExtCats.get(d.id) || []).length) linkedLocals.push(d);
      else freeLocals.push(d);
    }

    // 有跨链：按目标外部分区聚到对应朝向外缘（同扇区内再微错开）
    /** @type {Map<string, typeof linkedLocals>} */
    const linkedBySector = new Map();
    /** @type {typeof linkedLocals} */
    const multiLinked = [];
    for (const d of linkedLocals) {
      const cats = localToExtCats.get(d.id) || [];
      if (cats.length === 1) {
        if (!linkedBySector.has(cats[0])) linkedBySector.set(cats[0], []);
        linkedBySector.get(cats[0]).push(d);
      } else {
        multiLinked.push(d);
      }
    }
    for (const [extCatId, list] of linkedBySector) {
      const mid = sectorAngle.get(extCatId) ?? 0;
      list.forEach((d, j) => {
        const spread = (j - (list.length - 1) / 2) * 0.16;
        allSeeds[d.id] = {
          x: Math.cos(mid + spread) * localR,
          y: Math.sin(mid + spread) * localR,
        };
      });
    }
    multiLinked.forEach((d) => {
      const cats = localToExtCats.get(d.id) || [];
      let ax = 0;
      let ay = 0;
      for (const c of cats) {
        const a = sectorAngle.get(c);
        if (a == null) continue;
        ax += Math.cos(a);
        ay += Math.sin(a);
      }
      const ang = Math.hypot(ax, ay) > 1e-6 ? Math.atan2(ay, ax) : 0;
      allSeeds[d.id] = {
        x: Math.cos(ang) * localR,
        y: Math.sin(ang) * localR,
      };
    });

    // 无跨链：靠内环，给外缘让位给有关联的点
    freeLocals.forEach((d, i) => {
      const ang = (i / Math.max(freeLocals.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.2;
      allSeeds[d.id] = {
        x: Math.cos(ang) * localR * 0.5,
        y: Math.sin(ang) * localR * 0.5,
      };
    });

    const outerR = localR + EXTERNAL_CORE_GAP + 48 + Math.max(0, sectorCount - 1) * 18;
    /** @type {Map<string, string[]>} */
    const extGroups = new Map();
    /** @type {{ source: string, target: string, weight: number }[]} */
    const clusterExtraEdges = [];

    extCats.forEach((extCatId) => {
      const details = filteredExternal.get(extCatId);
      const mid = sectorAngle.get(extCatId) ?? 0;
      const cx = Math.cos(mid) * outerR;
      const cyPos = Math.sin(mid) * outerR;
      const ids = details.map((d) => d.id);
      extGroups.set(extCatId, ids);

      const extSizes = details.map((d) => detailNodeSize(getDetailDegree(kb, d.id)));
      // 同类别外部分区：紧凑小环，不要铺开
      const clusterR = Math.min(
        48,
        Math.max(18, ringRadiusForSizes(extSizes, DETAIL_GAP * 0.7) * 0.28),
      );
      details.forEach((d, j) => {
        const a = mid + (j - (details.length - 1) / 2) * 0.32;
        const rr = details.length === 1 ? 0 : clusterR;
        allSeeds[d.id] = {
          x: cx + Math.cos(a) * rr,
          y: cyPos + Math.sin(a) * rr,
        };
        elements.push(detailNode(d, kb));
      });

      // 同分区两两虚边，力导向时捆在一起
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          clusterExtraEdges.push({ source: ids[i], target: ids[j], weight: 6 });
        }
      }
    });

    elements.push(...buildDetailEdges(kb, visibleDetailIds));
    cy.add(elements);

    const allExtIds = [...extGroups.values()].flat();
    const sectorGroups = [...extGroups.entries()].map(([extCatId, ids]) => ({
      ids,
      angle: sectorAngle.get(extCatId) ?? 0,
    }));

    // 外部分区钉在扇区种子上；本类可被跨链弹簧拉向对应扇区，分区之间不会互吸合并
    const laid = runDetailForceLayout(kb, visibleDetailIds, allSeeds, {
      minGap: DETAIL_GAP,
      anchorStrength: 0.055,
      gravity: 0.014,
      charge: 5200 + visibleDetailIds.size * 100,
      idealEdge: DETAIL_GAP + 24,
      iterations: 340 + visibleDetailIds.size * 8,
      homeCategoryId: catId,
      extraEdges: clusterExtraEdges,
      pinIds: allExtIds,
    });

    // 先分离本类，再把外部分区钉到统一目标半径（过远拉回），避免深蓝被甩出视口
    const localOnly = new Map([...laid].filter(([id]) => localIds.includes(id)));
    hardSeparate(localOnly, DETAIL_GAP, 40);
    for (const [id, p] of localOnly) laid.set(id, p);

    compactGroups(laid, extGroups.values(), 0.55);
    snapExternalsToSectors(laid, sectorGroups, localIds, EXTERNAL_CORE_GAP);
    // 组内再分一点，最后仍钉回目标半径
    for (const ids of extGroups.values()) {
      const sub = new Map(ids.map((id) => [id, laid.get(id)]).filter(([, p]) => p));
      hardSeparate(sub, DETAIL_GAP * 0.85, 16);
      for (const [id, p] of sub) laid.set(id, p);
    }
    snapExternalsToSectors(laid, sectorGroups, localIds, EXTERNAL_CORE_GAP);
    applyPositions(laid);

    // 非闭合交界带 + 类别色渐变（canvas overlay，不用闭合色块）
    if (extGroups.size) {
      const bands = [...extGroups.entries()].map(([extCatId, ids]) => ({
        catId: extCatId,
        color: colorForId(extCatId),
        label: kb.categories.find((c) => c.id === extCatId)?.title || extCatId,
        localIds,
        externalIds: ids,
      }));
      regionOverlay?.setBands(cy, bands);
    } else {
      clearRegionBands();
    }

    cy.layout({ name: 'preset', fit: true, padding: 80 }).run();
    fitSafe(80);
    syncScreenFonts();
    regionOverlay?.paint();
    edgeOverlay?.paint();
    playEntrance();
  }

  function renderFocusNeighborView(kb, selected) {
    const centerId = focusDetailId;
    if (!centerId) {
      mode = 'categories';
      return renderCategoryView(kb, selected);
    }
    const center = kb.details.find((d) => d.id === centerId);
    if (!center) {
      mode = 'categories';
      return renderCategoryView(kb, selected);
    }

    const neighbors = getDirectNeighbors(kb, centerId).filter(passesFilter);
    const nodes = [center, ...neighbors];
    const byCat = new Map();
    for (const d of nodes) {
      if (!byCat.has(d.categoryId)) byCat.set(d.categoryId, []);
      byCat.get(d.categoryId).push(d);
    }

    visibleDetailIds = new Set(nodes.map((d) => d.id));
    const elements = nodes.map((d) => detailNode(d, kb));
    elements.push(...buildDetailEdges(kb, visibleDetailIds));
    cy.add(elements);

    /** @type {Record<string, { x: number, y: number }>} */
    const seeds = { [centerId]: { x: 0, y: 0 } };
    const catIds = [...byCat.keys()];
    const homeList = byCat.get(center.categoryId) || [];
    const homeIds = homeList.map((d) => d.id);
    const homeOthers = homeList.filter((d) => d.id !== centerId);
    const homeR = ringRadiusForSizes(
      homeOthers.map((d) => detailNodeSize(getDetailDegree(kb, d.id))),
      DETAIL_MIN_GAP,
    );
    const foreignCats = catIds.filter((cid) => cid !== center.categoryId);
    const foreignCount = Math.max(foreignCats.length, 1);
    /** @type {Map<string, number>} */
    const focusSectorAngle = new Map();
    foreignCats.forEach((cid, i) => {
      focusSectorAngle.set(cid, -Math.PI / 2 + ((i + 0.5) / foreignCount) * Math.PI * 2);
    });

    catIds.forEach((cid) => {
      const list = byCat.get(cid).filter((d) => d.id !== centerId);
      const mid =
        cid === center.categoryId
          ? -Math.PI / 2
          : (focusSectorAngle.get(cid) ?? 0);
      const baseR =
        cid === center.categoryId ? homeR : homeR + EXTERNAL_CORE_GAP + 90;
      list.forEach((d, j) => {
        const a = mid + (j - (list.length - 1) / 2) * (cid === center.categoryId ? 0.5 : 0.32);
        const r = cid === center.categoryId ? baseR + j * 22 : baseR;
        seeds[d.id] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      });
    });

    const foreignIds = [];
    for (const cid of foreignCats) {
      for (const d of byCat.get(cid) || []) foreignIds.push(d.id);
    }
    const coreIds = homeIds.length ? homeIds : [centerId];

    const laid = runDetailForceLayout(kb, visibleDetailIds, seeds, {
      minGap: DETAIL_MIN_GAP,
      pinIds: [centerId, ...foreignIds],
      anchorStrength: 0.03,
      idealEdge: DETAIL_MIN_GAP + 28,
      charge: 6000 + nodes.length * 140,
      homeCategoryId: center.categoryId,
    });

    if (foreignIds.length) {
      const sectorGroups = foreignCats.map((cid) => ({
        ids: (byCat.get(cid) || []).map((d) => d.id),
        angle: focusSectorAngle.get(cid) ?? 0,
      }));
      const homeOnly = new Map([...laid].filter(([id]) => coreIds.includes(id)));
      hardSeparate(homeOnly, DETAIL_MIN_GAP, 32);
      for (const [id, p] of homeOnly) laid.set(id, p);
      compactGroups(
        laid,
        foreignCats.map((cid) => (byCat.get(cid) || []).map((d) => d.id)),
        0.5,
      );
      snapExternalsToSectors(laid, sectorGroups, coreIds, EXTERNAL_CORE_GAP);
    }
    applyPositions(laid);

    const bands = catIds
      .filter((cid) => cid !== center.categoryId)
      .map((cid) => ({
        catId: cid,
        color: colorForId(cid),
        label: kb.categories.find((c) => c.id === cid)?.title || cid,
        localIds: coreIds,
        externalIds: (byCat.get(cid) || []).map((d) => d.id),
      }))
      .filter((b) => b.externalIds.length);
    regionOverlay?.setBands(cy, bands);

    cy.layout({ name: 'preset', fit: true, padding: 80 }).run();
    fitSafe(80);
    syncScreenFonts();
    regionOverlay?.paint();
    edgeOverlay?.paint();
    playEntrance();
  }

  function detailNode(d, kb) {
    const deg = getDetailDegree(kb, d.id);
    const size = detailNodeSize(deg);
    return {
      group: 'nodes',
      data: {
        id: d.id,
        label: d.title,
        kind: 'detail',
        color: colorForId(d.categoryId),
        size,
        refId: d.id,
        categoryId: d.categoryId,
        status: d.status,
      },
      classes: statusClassList(d.status, d.weak, 'detail'),
    };
  }

  function buildDetailEdges(kb, idSet) {
    const edges = [];
    const seen = new Set();
    const detMap = new Map(kb.details.map((d) => [d.id, d]));
    for (const id of idSet) {
      const d = detMap.get(id);
      if (!d) continue;
      for (const rid of d.relatedIds || []) {
        if (!idSet.has(rid)) continue;
        const key = [id, rid].sort().join('~');
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          group: 'edges',
          data: {
            id: `e_${key}`,
            source: id,
            target: rid,
            weight: 2.5,
          },
        });
      }
    }
    return edges;
  }

  function applySelectionStyles(selected) {
    if (!cy) return;
    cy.nodes().removeClass('selected-multi');
    for (const id of selected) {
      const n = cy.getElementById(id);
      if (n.nonempty()) n.addClass('selected-multi');
    }
  }

  function showCategories(kb, opts) {
    mode = 'categories';
    focusCategoryId = null;
    focusDetailId = null;
    freeform = false;
    render(kb, opts);
  }

  function enterCategoryDetail(categoryId, kb, opts) {
    mode = 'categoryDetail';
    focusCategoryId = categoryId;
    focusDetailId = null;
    freeform = false;
    render(kb, opts);
  }

  function enterFocusNeighbor(detailId, kb, opts) {
    mode = 'focusNeighbor';
    focusDetailId = detailId;
    focusCategoryId = kb.details.find((d) => d.id === detailId)?.categoryId || null;
    freeform = false;
    render(kb, opts);
  }

  /**
   * 扩展一层：按当前图内节点 relatedIds 向外加一层
   */
  function expandOneLayer(kb, opts = {}) {
    if (mode === 'categories') {
      // 类别视图扩展：进入第一个有关联的类别详情无意义；提示由 UI 处理
      return { added: 0 };
    }

    const detMap = new Map(kb.details.map((d) => [d.id, d]));
    const current = new Set(visibleDetailIds);
    const toAdd = new Set();

    for (const id of current) {
      const d = detMap.get(id);
      if (!d) continue;
      for (const rid of d.relatedIds || []) {
        const other = detMap.get(rid);
        if (other && !current.has(rid) && passesFilter(other)) toAdd.add(rid);
      }
      // 反向
      for (const other of kb.details) {
        if (current.has(other.id)) continue;
        if ((other.relatedIds || []).includes(id) && passesFilter(other)) toAdd.add(other.id);
      }
    }

    if (!toAdd.size) return { added: 0 };

    for (const id of toAdd) visibleDetailIds.add(id);
    freeform = true;
    renderExpandedSet(kb, opts);
    return { added: toAdd.size };
  }

  function renderExpandedSet(kb, opts = {}) {
    const selected = new Set(opts.selectedDetailIds || []);
    ensureCy();
    cy.elements().remove();

    const nodes = kb.details.filter((d) => visibleDetailIds.has(d.id) && passesFilter(d));
    visibleDetailIds = new Set(nodes.map((d) => d.id));
    const elements = nodes.map((d) => detailNode(d, kb));
    elements.push(...buildDetailEdges(kb, visibleDetailIds));
    cy.add(elements);
    applySelectionStyles(selected);

    // 按类别给种子，同色类别先聚在一块，再力导向拉开
    /** @type {Record<string, { x: number, y: number }>} */
    const seeds = {};
    const byCat = new Map();
    for (const d of nodes) {
      if (!byCat.has(d.categoryId)) byCat.set(d.categoryId, []);
      byCat.get(d.categoryId).push(d);
    }
    const catKeys = [...byCat.keys()];
    catKeys.forEach((cid, ci) => {
      const list = byCat.get(cid);
      const mid = ((ci + 0.5) / Math.max(catKeys.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const baseR = 220 + catKeys.length * 12;
      list.forEach((d, j) => {
        const a = mid + (j - (list.length - 1) / 2) * 0.45;
        const r = baseR + j * 20;
        seeds[d.id] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      });
    });

    const laid = runDetailForceLayout(kb, visibleDetailIds, seeds, {
      minGap: DETAIL_MIN_GAP,
      idealEdge: DETAIL_MIN_GAP + 28,
      anchorStrength: 0.02,
      charge: 5500 + nodes.length * 120,
    });
    applyPositions(laid);
    clearRegionBands();
    cy.layout({ name: 'preset', fit: true, padding: 80 }).run();
    fitSafe(80);
    syncScreenFonts();
    edgeOverlay?.paint();
    playEntrance();
  }

  /**
   * 从当前图移除节点（不删库）
   */
  function removeFromGraph(ids, kb, opts = {}) {
    const removeSet = new Set(ids);
    for (const id of removeSet) visibleDetailIds.delete(id);

    if (mode === 'categories') {
      // 类别视图移除 = 从图隐藏类别节点：用临时排除集合较复杂，简化为不支持类别视图移除库外显示
      // 实际：类别视图始终显示全部类别；移除仅对详细视图有意义
      return;
    }

    if (mode === 'focusNeighbor' && focusDetailId && removeSet.has(focusDetailId)) {
      showCategories(kb, opts);
      return;
    }

    if (mode === 'categoryDetail') {
      // 若本地节点全被移除，回类别视图
      const localLeft = kb.details.some(
        (d) => d.categoryId === focusCategoryId && visibleDetailIds.has(d.id),
      );
      if (!localLeft) {
        showCategories(kb, opts);
        return;
      }
    }

    freeform = true;
    renderExpandedSet(kb, opts);
  }

  /**
   * 搜索添加知识点到图
   */
  function addToGraph(ids, kb, opts = {}) {
    if (mode === 'categories') {
      // 添加详细点时自动切入其类别详情视图
      const first = kb.details.find((d) => ids.includes(d.id));
      if (first) {
        enterCategoryDetail(first.categoryId, kb, opts);
        for (const id of ids) {
          const d = kb.details.find((x) => x.id === id);
          if (d && passesFilter(d)) visibleDetailIds.add(id);
        }
        freeform = true;
        renderExpandedSet(kb, opts);
        return;
      }
      const cat = kb.categories.find((c) => ids.includes(c.id));
      if (cat) enterCategoryDetail(cat.id, kb, opts);
      return;
    }

    for (const id of ids) {
      const d = kb.details.find((x) => x.id === id);
      if (d && passesFilter(d)) visibleDetailIds.add(id);
      else if (kb.categories.some((c) => c.id === id)) {
        for (const det of kb.details.filter((x) => x.categoryId === id)) {
          if (passesFilter(det)) visibleDetailIds.add(det.id);
        }
      }
    }
    freeform = true;
    renderExpandedSet(kb, opts);
  }

  function destroy() {
    if (pulseTimer != null) {
      clearInterval(pulseTimer);
      pulseTimer = null;
    }
    if (cy) {
      cy.destroy();
      cy = null;
    }
    edgeOverlay?.destroy();
    edgeOverlay = null;
    regionOverlay?.destroy();
    regionOverlay = null;
  }

  return {
    getState,
    restoreState,
    refreshStatusStyles,
    setTagFilter,
    setWeakOnly,
    render,
    showCategories,
    enterCategoryDetail,
    enterFocusNeighbor,
    expandOneLayer,
    removeFromGraph,
    addToGraph,
    applySelectionStyles,
    destroy,
    getCy: () => cy,
  };
}
