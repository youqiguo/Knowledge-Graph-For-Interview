/**
 * 分词 + 加权 TF 余弦相似度（无外部依赖）
 */

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const s = String(text || '').toLowerCase();
  /** @type {string[]} */
  const tokens = [];

  // 连续英文/数字
  for (const m of s.matchAll(/[a-z0-9_]{2,}/g)) {
    tokens.push(m[0]);
  }

  // 去掉 ascii 词后对剩余做中文 2-gram
  const cjk = s.replace(/[a-z0-9_]+/g, ' ').replace(/\s+/g, '');
  for (let i = 0; i < cjk.length - 1; i++) {
    const a = cjk[i];
    const b = cjk[i + 1];
    if (isCjk(a) && isCjk(b)) tokens.push(a + b);
  }
  // 单字兜底（短查询）
  if (cjk.length === 1 && isCjk(cjk[0])) tokens.push(cjk[0]);

  return tokens;
}

function isCjk(ch) {
  const code = ch.codePointAt(0) || 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/**
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
export function toTf(tokens) {
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

/**
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 */
export function cosine(a, b) {
  if (!a.size || !b.size) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const [k, v] of smaller) {
    const u = larger.get(k);
    if (u) dot += v * u;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 把多段加权文本合成一个 TF
 * @param {{ text: string, weight: number }[]} parts
 */
export function weightedTf(parts) {
  const tf = new Map();
  for (const { text, weight } of parts) {
    const w = Number(weight) || 1;
    for (const tok of tokenize(text)) {
      tf.set(tok, (tf.get(tok) || 0) + w);
    }
  }
  return tf;
}

/**
 * @param {object} detail
 * @param {object} [category]
 * @returns {Map<string, number>}
 */
export function detailTf(detail, category) {
  /** @type {{ text: string, weight: number }[]} */
  const parts = [
    { text: detail.title || '', weight: 3 },
    { text: (detail.tags || []).join(' '), weight: 2.5 },
    { text: detail.content || '', weight: 1.5 },
    { text: category?.title || '', weight: 1.2 },
  ];
  for (const qa of detail.interviewQA || []) {
    parts.push({ text: qa.question || '', weight: 1.2 });
    // 答案权重略低，避免长答案淹没标题匹配
    parts.push({ text: qa.answer || '', weight: 0.7 });
  }
  return weightedTf(parts);
}

/**
 * @param {string} query
 * @param {object[]} details
 * @param {Map<string, object>} categoryMap
 * @param {number} top
 */
export function searchDetails(query, details, categoryMap, top = 10) {
  const qTf = weightedTf([{ text: query, weight: 1 }]);
  const scored = details.map((d) => {
    const cat = categoryMap.get(d.categoryId);
    const score = cosine(qTf, detailTf(d, cat));
    const snippet = String(d.content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    return {
      score,
      id: d.id,
      title: d.title,
      categoryId: d.categoryId,
      categoryTitle: cat?.title || d.categoryId,
      status: d.status,
      tags: d.tags || [],
      qaCount: (d.interviewQA || []).length,
      relatedCount: (d.relatedIds || []).length,
      snippet,
      _titleLen: String(d.title || '').length,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.qaCount !== a.qaCount) return b.qaCount - a.qaCount;
    return a._titleLen - b._titleLen;
  });

  return scored.slice(0, Math.max(1, top)).map((r, i) => {
    const { _titleLen, ...rest } = r;
    return { rank: i + 1, ...rest, score: Number(r.score.toFixed(6)) };
  });
}
