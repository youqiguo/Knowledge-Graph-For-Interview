/**
 * 类别着色：
 * - 色相在色环上尽量分散，避免整体发灰/撞色
 * - 有关联边的相邻类别强制拉开色相（图着色 + 最大最小色相间隔）
 */

/** @type {Map<string, string>} */
let categoryColorCache = new Map();

/**
 * 在 HSL 色环上生成高饱和、暗底可读的颜色。
 * 注意：Cytoscape 只解析经典写法 `hsl(h, s%, l%)`（必须有逗号），
 * 现代 CSS `hsl(h s% l%)` 会解析失败并回退成灰色。
 * @param {number} h 0-360
 */
function hslColor(h) {
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${Math.round(hue)}, 78%, 58%)`;
}

/** @param {number} h @param {number} s 0-1 @param {number} l 0-1 */
function hslToHex(h, s, l) {
  const hue = (((h % 360) + 360) % 360) / 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + hue * 12) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** 给 Cytoscape 用的稳妥色值（hex） */
function vividColor(h) {
  return hslToHex(((h % 360) + 360) % 360, 0.78, 0.58);
}

/**
 * 色相最短角距离
 * @param {number} a
 * @param {number} b
 */
function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * 贪婪图着色：相邻点不同色号，再映射到分散色相
 * @param {string[]} categoryIds
 * @param {Iterable<[string, string]>} edges 无向边
 */
export function rebuildCategoryColors(categoryIds, edges = []) {
  const ids = [...new Set(categoryIds)];
  const n = ids.length;
  const map = new Map();
  if (!n) {
    categoryColorCache = map;
    return map;
  }

  /** @type {Map<string, Set<string>>} */
  const adj = new Map(ids.map((id) => [id, new Set()]));
  for (const [a, b] of edges) {
    if (!adj.has(a) || !adj.has(b) || a === b) continue;
    adj.get(a).add(b);
    adj.get(b).add(a);
  }

  // 度数高的先调整，优先保证枢纽节点与邻居可辨
  const order = [...ids].sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0));

  // 先按节点数在色环均匀占位（全局不撞色），再按邻接约束微调
  const slotStep = 360 / n;
  const hues = new Map();
  ids.forEach((id, i) => {
    hues.set(id, (i * slotStep + 12) % 360);
  });

  // 多轮：若与邻居色相过近，在色环上找「距邻居最远」的位置
  const minSep = Math.max(38, Math.min(70, 320 / Math.max(n, 1)));
  for (let round = 0; round < 8; round++) {
    let changed = false;
    for (const id of order) {
      const neighborHues = [...(adj.get(id) || [])]
        .map((nb) => hues.get(nb))
        .filter((x) => typeof x === 'number');
      if (!neighborHues.length) continue;

      const cur = hues.get(id);
      let curMin = 180;
      for (const nh of neighborHues) curMin = Math.min(curMin, hueDist(cur, nh));
      if (curMin >= minSep) continue;

      let bestH = cur;
      let bestScore = -1;
      for (let t = 0; t < 36; t++) {
        const cand = (t * 360) / 36;
        let minD = 180;
        for (const nh of neighborHues) minD = Math.min(minD, hueDist(cand, nh));
        // 同时略微避开其他已占用色相，减少全局近似
        let others = 180;
        for (const [oid, oh] of hues) {
          if (oid === id) continue;
          others = Math.min(others, hueDist(cand, oh));
        }
        const score = minD * 3 + others;
        if (score > bestScore) {
          bestScore = score;
          bestH = cand;
        }
      }
      if (Math.abs(bestH - cur) > 0.5) {
        hues.set(id, bestH);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const id of ids) {
    map.set(id, vividColor(hues.get(id) ?? 0));
  }

  categoryColorCache = map;
  return map;
}

/**
 * @param {string} categoryId
 * @param {string[]} [allCategoryIds]
 * @param {Iterable<[string, string]>} [edges]
 */
export function colorForId(categoryId, allCategoryIds, edges) {
  if (allCategoryIds) rebuildCategoryColors(allCategoryIds, edges || []);
  if (categoryColorCache.has(categoryId)) return categoryColorCache.get(categoryId);
  let h = 0;
  const str = String(categoryId || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return vividColor(h % 360);
}

/**
 * @param {string} id
 */
export function regionColorForId(id) {
  return withAlpha(colorForId(id), 0.12);
}

/**
 * @param {string} id
 */
export function borderColorForId(id) {
  return withAlpha(colorForId(id), 0.5);
}

/**
 * @param {string} color
 * @param {number} a
 */
function withAlpha(color, a) {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const m = color.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/);
  if (m) return `hsla(${m[1]}, ${m[2]}%, ${m[3]}%, ${a})`;
  const m2 = color.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (m2) return `hsla(${m2[1]}, ${m2[2]}%, ${m2[3]}%, ${a})`;
  return color;
}
