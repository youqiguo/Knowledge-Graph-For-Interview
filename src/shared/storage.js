import { createEmptyKb, validateKnowledgeBase } from './schema.js';

const STORAGE_KEY = 'kg_knowledge_base_v1';
const UI_STATE_KEY = 'kg_ui_state_v1';
/** 手动加入面试模拟的详细知识点 id 列表 */
const QUIZ_POOL_KEY = 'kg_quiz_pool_v1';

/**
 * @returns {import('./schema.js').KnowledgeBase}
 */
export function loadKb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyKb();
    const parsed = JSON.parse(raw);
    const result = validateKnowledgeBase(parsed);
    if (!result.ok) {
      console.warn('localStorage 知识点库校验失败', result.errors);
      return createEmptyKb();
    }
    return result.data;
  } catch (e) {
    console.warn('读取 localStorage 失败', e);
    return createEmptyKb();
  }
}

/**
 * @param {import('./schema.js').KnowledgeBase} kb
 */
export function saveKb(kb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kb));
}

export function clearKbStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 界面会话状态（视图、侧栏、选中等）
 * @returns {Record<string, unknown> | null}
 */
export function loadUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} state
 */
export function saveUiState(state) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('保存界面状态失败', e);
  }
}

/**
 * @returns {string[]}
 */
export function loadQuizPoolIds() {
  try {
    const raw = localStorage.getItem(QUIZ_POOL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === 'string');
  } catch {
    return [];
  }
}

/**
 * @param {string[]} ids
 */
export function saveQuizPoolIds(ids) {
  const unique = [...new Set((ids || []).filter((id) => typeof id === 'string'))];
  try {
    localStorage.setItem(QUIZ_POOL_KEY, JSON.stringify(unique));
  } catch (e) {
    console.warn('保存面试池失败', e);
  }
}

/**
 * @param {string[]} ids
 * @returns {{ ids: string[], added: number }}
 */
export function addToQuizPool(ids) {
  const prev = new Set(loadQuizPoolIds());
  let added = 0;
  for (const id of ids || []) {
    if (typeof id !== 'string' || !id || prev.has(id)) continue;
    prev.add(id);
    added += 1;
  }
  const next = [...prev];
  saveQuizPoolIds(next);
  return { ids: next, added };
}

/**
 * @param {string[]} ids
 * @returns {{ ids: string[], removed: number }}
 */
export function removeFromQuizPool(ids) {
  const drop = new Set((ids || []).filter((id) => typeof id === 'string'));
  const prev = loadQuizPoolIds();
  const next = prev.filter((id) => !drop.has(id));
  saveQuizPoolIds(next);
  return { ids: next, removed: prev.length - next.length };
}

/**
 * 剔除知识库中已不存在的 id
 * @param {import('./schema.js').KnowledgeBase} kb
 * @returns {string[]}
 */
export function pruneQuizPool(kb) {
  const valid = new Set((kb?.details || []).map((d) => d.id));
  const next = loadQuizPoolIds().filter((id) => valid.has(id));
  saveQuizPoolIds(next);
  return next;
}

/**
 * @param {BlobPart} content
 * @param {string} filename
 * @param {string} [mime]
 */
export function downloadJson(content, filename, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {File} file
 * @returns {Promise<unknown>}
 */
export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
