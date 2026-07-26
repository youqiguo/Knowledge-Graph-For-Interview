/** @typedef {'unlearned' | 'learning' | 'mastered'} LearnStatus */

/** @typedef {{
 *   id: string,
 *   question: string,
 *   answer: string
 * }} InterviewQA */

/** @typedef {{
 *   id: string,
 *   title: string,
 *   content: string,
 *   aiExplorePrompt: string,
 *   status: LearnStatus,
 *   weak: boolean
 * }} Category */

/** @typedef {{
 *   id: string,
 *   categoryId: string,
 *   title: string,
 *   content: string,
 *   aiExplorePrompt: string,
 *   status: LearnStatus,
 *   weak: boolean,
 *   tags: string[],
 *   relatedIds: string[],
 *   interviewQA: InterviewQA[]
 * }} Detail */

/** @typedef {{
 *   version: number,
 *   categories: Category[],
 *   details: Detail[]
 * }} KnowledgeBase */

/** @typedef {{
 *   id: string,
 *   question: string,
 *   answer: string,
 *   detailId: string,
 *   detailTitle: string,
 *   categoryId: string,
 *   categoryTitle: string,
 *   tags: string[]
 * }} ExportQuestion */

/** @typedef {{
 *   version: number,
 *   exportedAt: string,
 *   source: string,
 *   questions: ExportQuestion[]
 * }} InterviewExport */

export const STATUSES = ['unlearned', 'learning', 'mastered'];

export const STATUS_LABELS = {
  unlearned: '未学习',
  learning: '正在学习',
  mastered: '已掌握',
};

export function createEmptyKb() {
  return { version: 1, categories: [], details: [] };
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} data
 * @returns {{ ok: true, data: KnowledgeBase } | { ok: false, errors: string[] }}
 */
export function validateKnowledgeBase(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['根对象无效'] };
  }
  const obj = /** @type {Record<string, unknown>} */ (data);
  if (obj.version !== 1) errors.push('version 必须为 1');
  if (!Array.isArray(obj.categories)) errors.push('categories 必须为数组');
  if (!Array.isArray(obj.details)) errors.push('details 必须为数组');
  if (errors.length) return { ok: false, errors };

  const catIds = new Set();
  for (const [i, c] of /** @type {unknown[]} */ (obj.categories).entries()) {
    const e = validateCategory(c, i);
    errors.push(...e);
    if (c && typeof c === 'object' && typeof /** @type {any} */ (c).id === 'string') {
      if (catIds.has(/** @type {any} */ (c).id)) {
        errors.push(`类别 id 重复: ${/** @type {any} */ (c).id}`);
      }
      catIds.add(/** @type {any} */ (c).id);
    }
  }

  const detIds = new Set();
  for (const [i, d] of /** @type {unknown[]} */ (obj.details).entries()) {
    const e = validateDetail(d, i, catIds);
    errors.push(...e);
    if (d && typeof d === 'object' && typeof /** @type {any} */ (d).id === 'string') {
      if (detIds.has(/** @type {any} */ (d).id)) {
        errors.push(`详细知识点 id 重复: ${/** @type {any} */ (d).id}`);
      }
      detIds.add(/** @type {any} */ (d).id);
    }
  }

  for (const d of /** @type {any[]} */ (obj.details)) {
    if (!d || typeof d !== 'object') continue;
    for (const rid of d.relatedIds || []) {
      if (!detIds.has(rid)) {
        errors.push(`详细知识点 ${d.id} 的 relatedIds 引用不存在: ${rid}`);
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: /** @type {KnowledgeBase} */ (normalizeKb(obj)) };
}

function validateCategory(c, i) {
  const errors = [];
  const p = `categories[${i}]`;
  if (!c || typeof c !== 'object') return [`${p} 无效`];
  const o = /** @type {any} */ (c);
  if (!o.id || typeof o.id !== 'string') errors.push(`${p}.id 必填`);
  if (!o.title || typeof o.title !== 'string') errors.push(`${p}.title 必填`);
  if (typeof o.content !== 'string') errors.push(`${p}.content 必须为字符串`);
  if (typeof o.aiExplorePrompt !== 'string') errors.push(`${p}.aiExplorePrompt 必须为字符串`);
  if (!STATUSES.includes(o.status)) errors.push(`${p}.status 无效`);
  if (typeof o.weak !== 'boolean') errors.push(`${p}.weak 必须为布尔值`);
  return errors;
}

function validateDetail(d, i, catIds) {
  const errors = [];
  const p = `details[${i}]`;
  if (!d || typeof d !== 'object') return [`${p} 无效`];
  const o = /** @type {any} */ (d);
  if (!o.id || typeof o.id !== 'string') errors.push(`${p}.id 必填`);
  if (!o.categoryId || typeof o.categoryId !== 'string') errors.push(`${p}.categoryId 必填`);
  else if (!catIds.has(o.categoryId)) errors.push(`${p}.categoryId 引用不存在: ${o.categoryId}`);
  if (!o.title || typeof o.title !== 'string') errors.push(`${p}.title 必填`);
  if (typeof o.content !== 'string') errors.push(`${p}.content 必须为字符串`);
  if (typeof o.aiExplorePrompt !== 'string') errors.push(`${p}.aiExplorePrompt 必须为字符串`);
  if (!STATUSES.includes(o.status)) errors.push(`${p}.status 无效`);
  if (typeof o.weak !== 'boolean') errors.push(`${p}.weak 必须为布尔值`);
  if (!Array.isArray(o.tags)) errors.push(`${p}.tags 必须为数组`);
  if (!Array.isArray(o.relatedIds)) errors.push(`${p}.relatedIds 必须为数组`);
  if (!Array.isArray(o.interviewQA)) errors.push(`${p}.interviewQA 必须为数组`);
  else {
    o.interviewQA.forEach((qa, j) => {
      if (!qa || typeof qa !== 'object') {
        errors.push(`${p}.interviewQA[${j}] 无效`);
        return;
      }
      if (!qa.id || typeof qa.id !== 'string') errors.push(`${p}.interviewQA[${j}].id 必填`);
      if (typeof qa.question !== 'string') errors.push(`${p}.interviewQA[${j}].question 必须为字符串`);
      if (typeof qa.answer !== 'string') errors.push(`${p}.interviewQA[${j}].answer 必须为字符串`);
    });
  }
  return errors;
}

function normalizeKb(obj) {
  return {
    version: 1,
    categories: obj.categories.map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content || '',
      aiExplorePrompt: c.aiExplorePrompt || '',
      status: c.status,
      weak: Boolean(c.weak),
    })),
    details: obj.details.map((d) => ({
      id: d.id,
      categoryId: d.categoryId,
      title: d.title,
      content: d.content || '',
      aiExplorePrompt: d.aiExplorePrompt || '',
      status: d.status,
      weak: Boolean(d.weak),
      tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
      relatedIds: Array.isArray(d.relatedIds) ? [...new Set(d.relatedIds.map(String))] : [],
      interviewQA: Array.isArray(d.interviewQA)
        ? d.interviewQA.map((qa) => ({
            id: qa.id,
            question: qa.question || '',
            answer: qa.answer || '',
          }))
        : [],
    })),
  };
}

/**
 * @param {unknown} data
 * @returns {{ ok: true, data: InterviewExport } | { ok: false, errors: string[] }}
 */
export function validateInterviewExport(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['根对象无效'] };
  }
  const obj = /** @type {any} */ (data);
  if (obj.version !== 1) errors.push('version 必须为 1');
  if (!Array.isArray(obj.questions)) errors.push('questions 必须为数组');
  if (errors.length) return { ok: false, errors };

  obj.questions.forEach((q, i) => {
    const p = `questions[${i}]`;
    if (!q || typeof q !== 'object') {
      errors.push(`${p} 无效`);
      return;
    }
    if (!q.id || typeof q.id !== 'string') errors.push(`${p}.id 必填`);
    if (typeof q.question !== 'string') errors.push(`${p}.question 必须为字符串`);
    if (typeof q.answer !== 'string') errors.push(`${p}.answer 必须为字符串`);
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      version: 1,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      source: typeof obj.source === 'string' ? obj.source : 'knowledge-graph',
      questions: obj.questions.map((q) => ({
        id: q.id,
        question: q.question || '',
        answer: q.answer || '',
        detailId: q.detailId || '',
        detailTitle: q.detailTitle || '',
        categoryId: q.categoryId || '',
        categoryTitle: q.categoryTitle || '',
        tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
      })),
    },
  };
}

/**
 * 从知识点库生成面试题列表（与图谱共用 interviewQA）
 * @param {KnowledgeBase} kb
 * @param {string[] | null | undefined} selectedDetailIds
 *   - 传入非空数组：仅这些详细知识点（多选缩小范围）
 *   - null / undefined / 空数组：使用库中全部详细知识点
 * @returns {{ exportData: InterviewExport, skipped: { id: string, title: string }[], scopeDetailIds: string[] }}
 */
export function buildInterviewExport(kb, selectedDetailIds) {
  const catMap = new Map(kb.categories.map((c) => [c.id, c]));
  const scopeDetailIds =
    Array.isArray(selectedDetailIds) && selectedDetailIds.length
      ? [...selectedDetailIds]
      : kb.details.map((d) => d.id);
  const selected = new Set(scopeDetailIds);
  const questions = [];
  const skipped = [];

  for (const d of kb.details) {
    if (!selected.has(d.id)) continue;
    const qas = d.interviewQA || [];
    if (!qas.length) {
      skipped.push({ id: d.id, title: d.title });
      continue;
    }
    const cat = catMap.get(d.categoryId);
    for (const qa of qas) {
      questions.push({
        id: qa.id,
        question: qa.question,
        answer: qa.answer,
        detailId: d.id,
        detailTitle: d.title,
        categoryId: d.categoryId,
        categoryTitle: cat?.title || '',
        tags: [...(d.tags || [])],
      });
    }
  }

  return {
    exportData: {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'knowledge-graph',
      questions,
    },
    skipped,
    scopeDetailIds,
  };
}

/**
 * 聚合跨类别关联：返回 Map<"catA|catB", count>（catA < catB）
 * @param {KnowledgeBase} kb
 */
export function computeCategoryLinks(kb) {
  const detMap = new Map(kb.details.map((d) => [d.id, d]));
  // relatedIds 有向存储、语义无向：按无向边去重计数
  const seen = new Set();
  const undirected = new Map();
  for (const d of kb.details) {
    for (const rid of d.relatedIds || []) {
      const other = detMap.get(rid);
      if (!other || other.categoryId === d.categoryId) continue;
      const pair = [d.id, rid].sort().join('~');
      if (seen.has(pair)) continue;
      seen.add(pair);
      const a = d.categoryId < other.categoryId ? d.categoryId : other.categoryId;
      const b = d.categoryId < other.categoryId ? other.categoryId : d.categoryId;
      const key = `${a}|${b}`;
      undirected.set(key, (undirected.get(key) || 0) + 1);
    }
  }
  return undirected;
}

/**
 * 某类别的跨类邻居：按外部类别分组
 * @param {KnowledgeBase} kb
 * @param {string} categoryId
 * @returns {Map<string, Detail[]>}
 */
export function getExternalNeighborsByCategory(kb, categoryId) {
  const detMap = new Map(kb.details.map((d) => [d.id, d]));
  const localIds = new Set(kb.details.filter((d) => d.categoryId === categoryId).map((d) => d.id));
  const byCat = new Map();

  const add = (detail) => {
    if (!byCat.has(detail.categoryId)) byCat.set(detail.categoryId, new Map());
    byCat.get(detail.categoryId).set(detail.id, detail);
  };

  for (const d of kb.details) {
    if (d.categoryId !== categoryId) continue;
    for (const rid of d.relatedIds || []) {
      const other = detMap.get(rid);
      if (other && !localIds.has(other.id)) add(other);
    }
  }
  // 反向：外部点指向本地
  for (const d of kb.details) {
    if (localIds.has(d.id)) continue;
    for (const rid of d.relatedIds || []) {
      if (localIds.has(rid)) add(d);
    }
  }

  const result = new Map();
  for (const [catId, map] of byCat) {
    result.set(catId, [...map.values()]);
  }
  return result;
}

/**
 * @param {KnowledgeBase} kb
 * @param {string} detailId
 */
export function getDirectNeighbors(kb, detailId) {
  const detMap = new Map(kb.details.map((d) => [d.id, d]));
  const center = detMap.get(detailId);
  if (!center) return [];
  const ids = new Set(center.relatedIds || []);
  for (const d of kb.details) {
    if ((d.relatedIds || []).includes(detailId)) ids.add(d.id);
  }
  ids.delete(detailId);
  return [...ids].map((id) => detMap.get(id)).filter(Boolean);
}

/**
 * 度数（无向）
 * @param {KnowledgeBase} kb
 * @param {string} detailId
 */
export function getDetailDegree(kb, detailId) {
  let deg = 0;
  const det = kb.details.find((d) => d.id === detailId);
  if (!det) return 0;
  const related = new Set(det.relatedIds || []);
  for (const d of kb.details) {
    if (d.id === detailId) continue;
    if (related.has(d.id) || (d.relatedIds || []).includes(detailId)) deg += 1;
  }
  return deg;
}
