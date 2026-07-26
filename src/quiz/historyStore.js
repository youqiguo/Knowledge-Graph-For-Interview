/**
 * 面试模拟：答题历史 + 简易遗忘曲线（SM-2 风格）
 */

const HISTORY_KEY = 'kg_quiz_history_v1';

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

/**
 * @param {string} questionId
 * @returns {QuizRecord | null}
 */
export function getRecord(questionId) {
  return loadHistoryMap()[questionId] || null;
}

/**
 * 分数 → SM-2 quality (0–5)
 * @param {number} score
 */
function scoreToQuality(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  if (s >= 95) return 5;
  if (s >= 85) return 4;
  if (s >= 70) return 3;
  if (s >= 55) return 2;
  if (s >= 40) return 1;
  return 0;
}

/**
 * @param {QuizRecord | null | undefined} prev
 * @param {number} score
 * @param {number} now
 */
function nextSchedule(prev, score, now) {
  const q = scoreToQuality(score);
  let ease = prev?.ease ?? 2.5;
  let intervalDays = prev?.intervalDays ?? 0;

  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    // 答得不好：缩短间隔，尽快再练
    intervalDays = score < 40 ? 0.25 : 0.5;
  } else if (!prev || !prev.attempts.length || intervalDays <= 0) {
    intervalDays = 1;
  } else if (intervalDays < 1.5) {
    intervalDays = 3;
  } else {
    intervalDays = Math.min(60, intervalDays * ease);
  }

  return {
    ease: Math.round(ease * 100) / 100,
    intervalDays: Math.round(intervalDays * 100) / 100,
    nextDueAt: now + intervalDays * 24 * 60 * 60 * 1000,
  };
}

/**
 * 记录一次作答并更新遗忘曲线
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
  const schedule = nextSchedule(prev, payload.score, now);
  const attempt = {
    score: Math.max(0, Math.min(100, Math.round(Number(payload.score) || 0))),
    at: now,
    userAnswer: String(payload.userAnswer ?? ''),
    reason: typeof payload.reason === 'string' ? payload.reason : '',
  };

  /** @type {QuizRecord} */
  const next = {
    questionId: payload.questionId,
    question: payload.question || prev?.question || '',
    detailTitle: payload.detailTitle || prev?.detailTitle || '',
    categoryTitle: payload.categoryTitle || prev?.categoryTitle || '',
    attempts: [...(prev?.attempts || []), attempt].slice(-40),
    ease: schedule.ease,
    intervalDays: schedule.intervalDays,
    nextDueAt: schedule.nextDueAt,
    lastScore: attempt.score,
  };
  map[payload.questionId] = next;
  saveHistoryMap(map);
  return next;
}

/**
 * @param {number} [now]
 * @returns {'new' | 'due' | 'soon' | 'ok'}
 */
export function reviewStatus(record, now = Date.now()) {
  if (!record || !record.attempts?.length) return 'new';
  if (record.nextDueAt <= now) return 'due';
  const day = 24 * 60 * 60 * 1000;
  if (record.nextDueAt - now <= day) return 'soon';
  return 'ok';
}

/**
 * 按遗忘曲线优先抽取题目
 * 优先级：已到期 > 从未作答 > 即将到期 > 其余（低分优先）
 * @param {import('../shared/schema.js').ExportQuestion[]} bank
 * @param {number} n
 * @param {number} [now]
 */
export function pickByForgettingCurve(bank, n, now = Date.now()) {
  const map = loadHistoryMap();
  const count = Math.max(1, Math.min(bank.length, Math.floor(n) || 1));

  /** @type {{ q: import('../shared/schema.js').ExportQuestion, priority: number, jitter: number }[]} */
  const ranked = bank.map((q) => {
    const rec = map[q.id];
    const status = reviewStatus(rec, now);
    const last = rec?.lastScore ?? -1;
    let priority = 0;
    if (status === 'due') priority = 400 + Math.max(0, 100 - (last < 0 ? 50 : last));
    else if (status === 'new') priority = 300;
    else if (status === 'soon') priority = 200 + Math.max(0, 100 - last);
    else priority = 100 + Math.max(0, 100 - last);
    // 到期越久权重越高
    if (status === 'due' && rec) {
      const overdueDays = (now - rec.nextDueAt) / (24 * 60 * 60 * 1000);
      priority += Math.min(80, overdueDays * 8);
    }
    return { q, priority, jitter: Math.random() };
  });

  ranked.sort((a, b) => b.priority - a.priority || a.jitter - b.jitter);
  return ranked.slice(0, count).map((x) => x.q);
}

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
  due: '待复习',
  soon: '即将到期',
  ok: '间隔中',
};
