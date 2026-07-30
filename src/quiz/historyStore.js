/**
 * 面试复习：答题历史 + 卡片式抽题优先度（与日历时间无关）
 *
 * 优先度参考 Anki / 背单词：
 * 1. 新题首答 <60 → 标记 learning，在「下下次」点开始复习时优先度最高
 * 2. 未作答新题
 * 3. 近期低分 / 需加强
 * 4. 一般与较好
 */

const HISTORY_KEY = 'kg_quiz_history_v1';
const META_KEY = 'kg_quiz_meta_v1';

/**
 * @typedef {{
 *   score: number,
 *   at: number,
 *   userAnswer: string,
 *   reason?: string,
 * }} QuizAttempt
 *
 * @typedef {{
 *   questionId: string,
 *   question: string,
 *   detailTitle: string,
 *   categoryTitle: string,
 *   attempts: QuizAttempt[],
 *   ease: number,
 *   intervalDays: number,
 *   nextDueAt: number,
 *   lastScore: number | null,
 *   priorityAtSession?: number | null,
 *   mastered?: boolean,
 *   masteredAt?: number | null,
 * }} QuizRecord
 */

/**
 * @returns {Record<string, QuizRecord>}
 */
export function loadHistoryMap() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.records) return {};
    return /** @type {Record<string, QuizRecord>} */ (parsed.records);
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, QuizRecord>} records
 */
function saveHistoryMap(records) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ version: 1, records, updatedAt: Date.now() }),
    );
  } catch (e) {
    console.warn('保存答题历史失败', e);
  }
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { reviewSessionSeq: 0 };
    const parsed = JSON.parse(raw);
    return {
      reviewSessionSeq: Math.max(0, Number(parsed?.reviewSessionSeq) || 0),
    };
  } catch {
    return { reviewSessionSeq: 0 };
  }
}

function saveMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...meta, updatedAt: Date.now() }));
  } catch (e) {
    console.warn('保存复习元数据失败', e);
  }
}

/** 当前已开始过的复习场次序号（点「开始复习」时 +1） */
export function getReviewSessionSeq() {
  return loadMeta().reviewSessionSeq;
}

/**
 * 每次用户点击「开始复习」抽题前调用，返回新场次号
 */
export function beginReviewSession() {
  const meta = loadMeta();
  meta.reviewSessionSeq = (meta.reviewSessionSeq || 0) + 1;
  saveMeta(meta);
  return meta.reviewSessionSeq;
}

/**
 * @param {string} questionId
 * @returns {QuizRecord | null}
 */
export function getRecord(questionId) {
  return loadHistoryMap()[questionId] || null;
}

const FAIL_SCORE = 60;
/** 首答失败后隔几次「开始复习」再拉满优先：2 = 下下次 */
const FIRST_FAIL_BOOST_DELAY_SESSIONS = 2;

/**
 * 记录一次作答
 * @param {{
 *   questionId: string,
 *   question: string,
 *   detailTitle?: string,
 *   categoryTitle?: string,
 *   score: number,
 *   userAnswer: string,
 *   reason?: string,
 * }} payload
 */
export function recordAttempt(payload) {
  const now = Date.now();
  const map = loadHistoryMap();
  const prev = map[payload.questionId];
  const attempt = {
    score: Math.max(0, Math.min(100, Math.round(Number(payload.score) || 0))),
    at: now,
    userAnswer: String(payload.userAnswer ?? ''),
    reason: typeof payload.reason === 'string' ? payload.reason : '',
  };

  const prevAttempts = prev?.attempts || [];
  const isFirstAttempt = prevAttempts.length === 0;
  let priorityAtSession = prev?.priorityAtSession ?? null;

  if (isFirstAttempt && attempt.score < FAIL_SCORE) {
    // 新题首答不及格 → 下下次开始复习时优先度最高
    const seq = getReviewSessionSeq();
    priorityAtSession = seq + FIRST_FAIL_BOOST_DELAY_SESSIONS;
  } else if (attempt.score >= FAIL_SCORE) {
    priorityAtSession = null;
  }

  /** @type {QuizRecord} */
  const next = {
    questionId: payload.questionId,
    question: payload.question || prev?.question || '',
    detailTitle: payload.detailTitle || prev?.detailTitle || '',
    categoryTitle: payload.categoryTitle || prev?.categoryTitle || '',
    attempts: [...prevAttempts, attempt].slice(-40),
    ease: prev?.ease ?? 2.5,
    intervalDays: 0,
    nextDueAt: 0,
    lastScore: attempt.score,
    priorityAtSession,
    mastered: Boolean(prev?.mastered),
    masteredAt: prev?.mastered ? prev.masteredAt ?? null : null,
  };
  map[payload.questionId] = next;
  saveHistoryMap(map);
  return next;
}

/**
 * 标记「这题懂了」：已学会，自动抽题不再出现
 * @param {{
 *   questionId: string,
 *   question?: string,
 *   detailTitle?: string,
 *   categoryTitle?: string,
 * }} payload
 */
export function markQuestionMastered(payload) {
  const now = Date.now();
  const map = loadHistoryMap();
  const prev = map[payload.questionId];
  /** @type {QuizRecord} */
  const next = {
    questionId: payload.questionId,
    question: payload.question || prev?.question || '',
    detailTitle: payload.detailTitle || prev?.detailTitle || '',
    categoryTitle: payload.categoryTitle || prev?.categoryTitle || '',
    attempts: [...(prev?.attempts || [])],
    ease: prev?.ease ?? 2.5,
    intervalDays: 0,
    nextDueAt: 0,
    lastScore: prev?.lastScore ?? null,
    priorityAtSession: null,
    mastered: true,
    masteredAt: now,
  };
  map[payload.questionId] = next;
  saveHistoryMap(map);
  return next;
}

/**
 * 取消已学会，恢复可抽题
 * @param {string} questionId
 */
export function unmarkQuestionMastered(questionId) {
  const map = loadHistoryMap();
  const prev = map[questionId];
  if (!prev) return null;
  const next = {
    ...prev,
    mastered: false,
    masteredAt: null,
  };
  map[questionId] = next;
  saveHistoryMap(map);
  return next;
}

export function isMastered(record) {
  return Boolean(record?.mastered);
}

/**
 * @returns {'new' | 'retry' | 'weak' | 'mid' | 'ok' | 'mastered'}
 */
export function reviewStatus(record, sessionSeq = getReviewSessionSeq()) {
  if (isMastered(record)) return 'mastered';
  if (!record || !record.attempts?.length) return 'new';
  const last = record.lastScore ?? -1;
  const boostReady =
    record.priorityAtSession != null && sessionSeq >= record.priorityAtSession && last < FAIL_SCORE;
  if (boostReady) return 'retry';
  if (record.priorityAtSession != null && last < FAIL_SCORE) return 'weak';
  if (last < 55) return 'weak';
  if (last < 75) return 'mid';
  return 'ok';
}

/** 自动抽题池：排除已学会 */
export function filterActiveQuestions(bank) {
  const map = loadHistoryMap();
  return bank.filter((q) => !isMastered(map[q.id]));
}

/**
 * 卡片式抽题（与日历时间无关）；已学会题目不会入选
 * @param {import('../shared/schema.js').ExportQuestion[]} bank
 * @param {number} n
 */
export function pickQuestions(bank, n) {
  const map = loadHistoryMap();
  const sessionSeq = getReviewSessionSeq();
  const active = filterActiveQuestions(bank);
  if (!active.length) return [];
  const count = Math.max(1, Math.min(active.length, Math.floor(n) || 1));

  /** @type {{ q: import('../shared/schema.js').ExportQuestion, priority: number, jitter: number }[]} */
  const ranked = active.map((q) => {
    const rec = map[q.id];
    const status = reviewStatus(rec, sessionSeq);
    const last = rec?.lastScore ?? -1;
    const attempts = rec?.attempts?.length ?? 0;
    let priority = 0;

    if (status === 'retry') {
      priority = 1000 + Math.max(0, FAIL_SCORE - last);
    } else if (status === 'new') {
      priority = 500;
    } else if (status === 'weak') {
      priority = 300 + Math.max(0, 100 - last);
      if (rec?.priorityAtSession != null) priority += 40;
    } else if (status === 'mid') {
      priority = 150 + Math.max(0, 100 - last);
    } else {
      priority = 40 + Math.max(0, 100 - last) * 0.3;
    }

    if (attempts > 0 && attempts < 3 && last < 75) priority += 15;

    return { q, priority, jitter: Math.random() };
  });

  ranked.sort((a, b) => b.priority - a.priority || a.jitter - b.jitter);
  return ranked.slice(0, count).map((x) => x.q);
}

/** @deprecated */
export const pickByForgettingCurve = pickQuestions;

/**
 * @param {number} ts
 */
export function formatDue(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const STATUS_LABELS = {
  new: '新题',
  retry: '优先重练',
  weak: '需加强',
  mid: '一般',
  ok: '较好',
  mastered: '已学会',
};

export { FAIL_SCORE };
