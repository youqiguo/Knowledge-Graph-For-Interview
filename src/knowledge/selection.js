/**
 * 多选逻辑：选类别 = 选其下全部详细；类别未全选则类别不算已选
 */
export function createSelectionController(getKb) {
  /** @type {Set<string>} */
  let selected = new Set();
  const listeners = new Set();

  function emit() {
    for (const fn of listeners) fn(getSnapshot());
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getSelectedDetailIds() {
    return [...selected];
  }

  function isDetailSelected(id) {
    return selected.has(id);
  }

  function isCategoryFullySelected(categoryId) {
    const kb = getKb();
    const details = kb.details.filter((d) => d.categoryId === categoryId);
    if (!details.length) return false;
    return details.every((d) => selected.has(d.id));
  }

  function getSnapshot() {
    const kb = getKb();
    const fullySelectedCategories = kb.categories
      .filter((c) => isCategoryFullySelected(c.id))
      .map((c) => c.id);
    return {
      detailIds: [...selected],
      categoryIds: fullySelectedCategories,
    };
  }

  function toggleDetail(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    emit();
  }

  function setDetail(id, on) {
    if (on) selected.add(id);
    else selected.delete(id);
    emit();
  }

  function toggleCategory(categoryId) {
    const kb = getKb();
    const details = kb.details.filter((d) => d.categoryId === categoryId);
    const allOn = details.length > 0 && details.every((d) => selected.has(d.id));
    if (allOn) {
      for (const d of details) selected.delete(d.id);
    } else {
      for (const d of details) selected.add(d.id);
    }
    emit();
  }

  function clear() {
    selected = new Set();
    emit();
  }

  /** @param {string[]} ids */
  function replaceSelection(ids) {
    selected = new Set(ids || []);
    emit();
  }

  /** 批量加入多选（不清除已有） */
  function addDetails(ids) {
    let changed = false;
    for (const id of ids || []) {
      if (!selected.has(id)) {
        selected.add(id);
        changed = true;
      }
    }
    if (changed) emit();
  }

  /** 从图移除节点时取消多选 */
  function unselectDetails(ids) {
    let changed = false;
    for (const id of ids) {
      if (selected.delete(id)) changed = true;
    }
    if (changed) emit();
  }

  /** 库删除后清理无效 id */
  function pruneMissing() {
    const kb = getKb();
    const alive = new Set(kb.details.map((d) => d.id));
    let changed = false;
    for (const id of [...selected]) {
      if (!alive.has(id)) {
        selected.delete(id);
        changed = true;
      }
    }
    if (changed) emit();
  }

  return {
    subscribe,
    getSelectedDetailIds,
    isDetailSelected,
    isCategoryFullySelected,
    getSnapshot,
    toggleDetail,
    setDetail,
    toggleCategory,
    clear,
    replaceSelection,
    addDetails,
    unselectDetails,
    pruneMissing,
  };
}
