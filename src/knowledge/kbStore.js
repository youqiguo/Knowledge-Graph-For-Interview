import {
  createEmptyKb,
  newId,
  validateKnowledgeBase,
  buildInterviewExport,
} from '../shared/schema.js';
import { loadKb, saveKb } from '../shared/storage.js';

/**
 * 知识点库状态与 CRUD
 */
export function createKbStore(onChange) {
  /** @type {import('../shared/schema.js').KnowledgeBase} */
  let kb = loadKb();
  if (!kb.categories.length && !kb.details.length) {
    // 首次空库时由 main 负责加载示例
  }

  const listeners = new Set();
  if (onChange) listeners.add(onChange);

  function emit() {
    saveKb(kb);
    for (const fn of listeners) fn(kb);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function get() {
    return kb;
  }

  function setKb(next, { persist = true } = {}) {
    const result = validateKnowledgeBase(next);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    kb = result.data;
    if (persist) emit();
    else for (const fn of listeners) fn(kb);
  }

  function replaceFromImport(data) {
    setKb(data);
  }

  function resetEmpty() {
    kb = createEmptyKb();
    emit();
  }

  function getCategory(id) {
    return kb.categories.find((c) => c.id === id) || null;
  }

  function getDetail(id) {
    return kb.details.find((d) => d.id === id) || null;
  }

  function detailsOfCategory(categoryId) {
    return kb.details.filter((d) => d.categoryId === categoryId);
  }

  function addCategory(partial = {}) {
    const cat = {
      id: partial.id || newId('cat'),
      title: partial.title || '新类别',
      content: partial.content || '',
      aiExplorePrompt: partial.aiExplorePrompt || '',
      status: partial.status || 'unlearned',
      weak: Boolean(partial.weak),
    };
    kb = { ...kb, categories: [...kb.categories, cat] };
    emit();
    return cat;
  }

  function updateCategory(id, patch) {
    const idx = kb.categories.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const next = { ...kb.categories[idx], ...patch, id };
    const categories = kb.categories.slice();
    categories[idx] = next;
    kb = { ...kb, categories };
    emit();
    return next;
  }

  function deleteCategory(id) {
    kb = {
      ...kb,
      categories: kb.categories.filter((c) => c.id !== id),
      details: kb.details.filter((d) => d.categoryId !== id),
    };
    // 清理指向已删详细点的 relatedIds
    const alive = new Set(kb.details.map((d) => d.id));
    kb = {
      ...kb,
      details: kb.details.map((d) => ({
        ...d,
        relatedIds: d.relatedIds.filter((rid) => alive.has(rid)),
      })),
    };
    emit();
  }

  function addDetail(partial = {}) {
    if (!partial.categoryId || !getCategory(partial.categoryId)) {
      throw new Error('必须指定有效的 categoryId');
    }
    const detail = {
      id: partial.id || newId('det'),
      categoryId: partial.categoryId,
      title: partial.title || '新知识点',
      content: partial.content || '',
      aiExplorePrompt: partial.aiExplorePrompt || '',
      status: partial.status || 'unlearned',
      weak: Boolean(partial.weak),
      tags: Array.isArray(partial.tags) ? [...partial.tags] : [],
      relatedIds: Array.isArray(partial.relatedIds) ? [...partial.relatedIds] : [],
      interviewQA: Array.isArray(partial.interviewQA)
        ? partial.interviewQA.map((qa) => ({
            id: qa.id || newId('qa'),
            question: qa.question || '',
            answer: qa.answer || '',
          }))
        : [],
    };
    kb = { ...kb, details: [...kb.details, detail] };
    emit();
    return detail;
  }

  function updateDetail(id, patch) {
    const idx = kb.details.findIndex((d) => d.id === id);
    if (idx < 0) return null;
    const prev = kb.details[idx];
    const next = {
      ...prev,
      ...patch,
      id,
      tags: patch.tags != null ? [...patch.tags] : prev.tags,
      relatedIds: patch.relatedIds != null ? [...new Set(patch.relatedIds)] : prev.relatedIds,
      interviewQA:
        patch.interviewQA != null
          ? patch.interviewQA.map((qa) => ({
              id: qa.id || newId('qa'),
              question: qa.question || '',
              answer: qa.answer || '',
            }))
          : prev.interviewQA,
    };
    if (next.categoryId !== prev.categoryId && !getCategory(next.categoryId)) {
      throw new Error('无效的 categoryId');
    }
    const details = kb.details.slice();
    details[idx] = next;
    kb = { ...kb, details };
    emit();
    return next;
  }

  function deleteDetail(id) {
    kb = {
      ...kb,
      details: kb.details
        .filter((d) => d.id !== id)
        .map((d) => ({
          ...d,
          relatedIds: d.relatedIds.filter((rid) => rid !== id),
        })),
    };
    emit();
  }

  function search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
      return {
        categories: [...kb.categories],
        details: [...kb.details],
      };
    }
    return {
      categories: kb.categories.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.content.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      ),
      details: kb.details.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          d.id.toLowerCase().includes(q),
      ),
    };
  }

  function exportInterview(selectedDetailIds) {
    return buildInterviewExport(kb, selectedDetailIds);
  }

  return {
    subscribe,
    get,
    setKb,
    replaceFromImport,
    resetEmpty,
    getCategory,
    getDetail,
    detailsOfCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    addDetail,
    updateDetail,
    deleteDetail,
    search,
    exportInterview,
  };
}
