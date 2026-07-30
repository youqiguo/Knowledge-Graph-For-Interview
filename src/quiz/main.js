import { marked } from 'marked';
import { buildInterviewExport } from '../shared/schema.js';
import { loadKb, pruneQuizPool } from '../shared/storage.js';
import {
  loadHistoryMap,
  recordAttempt,
  pickQuestions,
  beginReviewSession,
  reviewStatus,
  formatDue,
  STATUS_LABELS,
  getRecord,
  markQuestionMastered,
  unmarkQuestionMastered,
  filterActiveQuestions,
} from './historyStore.js';

const root = document.getElementById('quizRoot');

marked.setOptions({
  gfm: true,
  breaks: true,
});
marked.use({
  renderer: {
    html({ text }) {
      return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },
  },
});

/** @typedef {import('../shared/schema.js').ExportQuestion} ExportQuestion */

/** @type {'setup' | 'list' | 'history' | 'answering' | 'result' | 'summary'} */
let phase = 'setup';
/** @type {ExportQuestion[]} */
let bank = [];
/** @type {ExportQuestion[]} */
let sessionQuestions = [];
let index = 0;
/** @type {{ questionId: string, question: string, score: number, reason: string, userAnswer: string, referenceAnswer: string, detailTitle: string }[]} */
let results = [];
let lastScore = null;
let busy = false;
let draftAnswer = '';
/** 是否智能抽题（新题/低分优先；false 则纯随机）。与时间无关 */
let useSmartPick = true;
/** 列表里展开历史的题目 id */
let expandedHistoryId = null;
/** 查看某题完整历史时的 id */
let historyFocusId = null;
/** 当前抽题范围说明（来自图谱「面试池」） */
let scopeInfo = {
  poolCount: 0,
  detailCount: 0,
  skipped: 0,
  usingPool: false,
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 题干 Markdown（代码应写在知识库 question 字段，不从答案抽取） */
function renderQuestionStem(question) {
  return `<div class="md-body question-stem">${renderMarkdown(question)}</div>`;
}

function render() {
  if (phase === 'setup') return renderSetup();
  if (phase === 'list') return renderQuestionList();
  if (phase === 'history') return renderQuestionHistory();
  if (phase === 'answering') return renderAnswering();
  if (phase === 'result') return renderResult();
  if (phase === 'summary') return renderSummary();
}

function startSession(questions) {
  if (!questions.length) return;
  sessionQuestions = questions;
  index = 0;
  results = [];
  lastScore = null;
  draftAnswer = '';
  phase = 'answering';
  render();
}

/**
 * 从知识点库 + 手动加入的面试池刷新题池（与图谱共用 interviewQA）
 */
function refreshBankFromKb() {
  const kb = loadKb();
  const pool = pruneQuizPool(kb);
  const usingPool = pool.length > 0;
  const { exportData, skipped, scopeDetailIds } = buildInterviewExport(
    kb,
    usingPool ? pool : null,
  );
  bank = exportData.questions;
  scopeInfo = {
    poolCount: pool.length,
    detailCount: scopeDetailIds.length,
    skipped: skipped.length,
    usingPool,
  };
  return scopeInfo;
}

function renderSetup() {
  refreshBankFromKb();
  const hist = loadHistoryMap();
  const active = filterActiveQuestions(bank);
  const masteredN = bank.length - active.length;
  const weak = active.filter((q) => reviewStatus(hist[q.id]) === 'weak').length;
  const neu = active.filter((q) => reviewStatus(hist[q.id]) === 'new').length;
  const scopeText = scopeInfo.usingPool
    ? `面试池 ${scopeInfo.poolCount} 个知识点`
    : '面试池为空 · 暂使用知识库全部知识点';

  root.innerHTML = `
    <div class="quiz-card">
      <h2 style="margin-top:0">面试复习</h2>
      <p class="muted">点击「开始复习」后立即抽题作答。选题与日历时间无关：默认按卡片优先度（优先重练 → 新题 → 低分）。新题首答低于 60 会在下下次「开始复习」时置顶。答题中可点「这题懂了」标记已学会，之后自动抽题不再出现。请在图谱页多选后「加入面试模拟」设定范围；池为空时暂从全部有面试题的知识点中抽取。</p>
      <div class="result-block" style="margin-top:0">
        <strong>当前范围</strong>
        <p class="muted" style="margin:8px 0 0" id="bankInfo">
          ${scopeText} → 可练 ${active.length} / 共 ${bank.length} 道
          · 新题 ${neu} · 需加强 ${weak}${masteredN ? ` · 已学会 ${masteredN}` : ''}
          ${scopeInfo.skipped ? ` · ${scopeInfo.skipped} 个知识点无面试题已跳过` : ''}
        </p>
      </div>
      <label style="margin-top:14px">抽取题数 N</label>
      <input type="number" id="n" min="1" value="${Math.min(5, Math.max(1, active.length))}" />
      <label class="field-row" style="margin-top:10px">
        <input type="checkbox" id="useSmart" class="check" ${useSmartPick ? 'checked' : ''} />
        <span>智能选取（卡片优先度：优先重练 / 新题 / 低分；关闭则为纯随机）</span>
      </label>
      <div class="actions">
        <button type="button" class="primary" id="btnStart" ${active.length ? '' : 'disabled'}>开始复习</button>
        <button type="button" id="btnRefresh">刷新范围</button>
        <button type="button" id="btnList" ${bank.length ? '' : 'disabled'}>题目列表</button>
        <a class="link-btn" href="/knowledge.html">去图谱添加</a>
      </div>
      <p class="muted" style="margin-top:16px">评分经由本地 Express 代理 <code>/api/score</code>。答题历史保存在本机，按题目 id 与知识库对应。</p>
    </div>
  `;

  const nEl = root.querySelector('#n');
  nEl.max = String(Math.max(1, active.length));
  if (active.length) {
    nEl.value = String(Math.min(Number(nEl.value) || 5, active.length));
  }

  root.querySelector('#useSmart').onchange = (e) => {
    useSmartPick = e.target.checked;
  };

  root.querySelector('#btnRefresh').onclick = () => {
    refreshBankFromKb();
    render();
  };

  root.querySelector('#btnList').onclick = () => {
    if (!bank.length) return;
    expandedHistoryId = null;
    phase = 'list';
    render();
  };

  root.querySelector('#btnStart').onclick = () => {
    refreshBankFromKb();
    const pool = filterActiveQuestions(bank);
    if (!pool.length) {
      render();
      return;
    }
    let n = Number(nEl.value) || 1;
    n = Math.max(1, Math.min(pool.length, Math.floor(n)));
    beginReviewSession();
    const picked = useSmartPick ? pickQuestions(bank, n) : shuffle(pool).slice(0, n);
    startSession(picked);
  };
}

function renderQuestionList() {
  const hist = loadHistoryMap();
  const rows = bank.map((q) => {
    const rec = hist[q.id];
    const status = reviewStatus(rec);
    const attempts = rec?.attempts || [];
    const last = rec?.lastScore;
    const avg =
      attempts.length > 0
        ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
        : null;
    return { q, rec, status, attempts, last, avg };
  });

  // 优先重练 / 新题 / 需加强靠前；已学会靠后
  const order = { retry: 0, new: 1, weak: 2, mid: 3, ok: 4, mastered: 5 };
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  root.innerHTML = `
    <div class="quiz-card">
      <div class="list-head">
        <h2 style="margin:0">题目列表 · ${bank.length}</h2>
        <button type="button" id="btnBackSetup">返回</button>
      </div>
      <p class="muted">可查看历史分数；「这题懂了」后标记已学会、自动抽题不再出现。可在列表「恢复练习」取消。</p>
      <div class="q-list" id="qList"></div>
    </div>
  `;

  const listEl = root.querySelector('#qList');
  for (const row of rows) {
    const { q, status, attempts, last, avg } = row;
    const open = expandedHistoryId === q.id;
    const mastered = status === 'mastered';
    const el = document.createElement('div');
    el.className = `q-item status-${status}`;
    el.innerHTML = `
      <div class="q-item-main">
        <div class="q-item-top">
          <span class="chip status-chip">${STATUS_LABELS[status]}</span>
          ${q.categoryTitle ? `<span class="chip">${escapeHtml(q.categoryTitle)}</span>` : ''}
          ${q.detailTitle ? `<span class="chip">${escapeHtml(q.detailTitle)}</span>` : ''}
        </div>
        <div class="q-item-title" title="${escapeAttr(q.question)}">${escapeHtml(q.question)}</div>
        <div class="q-item-meta muted">
          最近 ${last == null ? '—' : last}
          · 均分 ${avg == null ? '—' : avg}
          · ${attempts.length} 次
        </div>
      </div>
      <div class="q-item-actions">
        <button type="button" data-hist="${escapeAttr(q.id)}">${open ? '收起' : '历史'}</button>
        <button type="button" data-detail="${escapeAttr(q.id)}">详情</button>
        ${
          mastered
            ? `<button type="button" data-unmaster="${escapeAttr(q.id)}">恢复练习</button>`
            : `<button type="button" class="primary" data-practice="${escapeAttr(q.id)}">练这题</button>
               <button type="button" data-master="${escapeAttr(q.id)}">这题懂了</button>`
        }
      </div>
      ${
        open
          ? `<div class="q-item-history">
              ${
                attempts.length
                  ? attempts
                      .slice()
                      .reverse()
                      .map(
                        (a, i) => `
                    <div class="hist-row">
                      <span>${formatDue(a.at)}</span>
                      <strong class="${a.score >= 70 ? 'ok' : a.score >= 40 ? 'mid' : 'bad'}">${a.score}</strong>
                      <span class="muted trunc" title="${escapeAttr(a.userAnswer)}">${escapeHtml(
                          (a.userAnswer || '（空）').slice(0, 48),
                        )}</span>
                    </div>`,
                      )
                      .join('')
                  : '<p class="muted">暂无作答记录</p>'
              }
            </div>`
          : ''
      }
    `;
    listEl.appendChild(el);
  }

  root.querySelector('#btnBackSetup').onclick = () => {
    phase = 'setup';
    render();
  };

  listEl.querySelectorAll('[data-hist]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-hist');
      expandedHistoryId = expandedHistoryId === id ? null : id;
      render();
    });
  });
  listEl.querySelectorAll('[data-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      historyFocusId = btn.getAttribute('data-detail');
      phase = 'history';
      render();
    });
  });
  listEl.querySelectorAll('[data-practice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-practice');
      const q = bank.find((x) => x.id === id);
      if (q) startSession([q]);
    });
  });
  listEl.querySelectorAll('[data-master]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-master');
      const q = bank.find((x) => x.id === id);
      if (!q) return;
      if (!confirm('标记为已学会？之后自动抽题将不再出现本题。')) return;
      markQuestionMastered({
        questionId: q.id,
        question: q.question,
        detailTitle: q.detailTitle,
        categoryTitle: q.categoryTitle,
      });
      render();
    });
  });
  listEl.querySelectorAll('[data-unmaster]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-unmaster');
      if (!id) return;
      unmarkQuestionMastered(id);
      render();
    });
  });
}

/** 跳过当前题进入下一题或汇总 */
function advanceAfterSkip() {
  draftAnswer = '';
  lastScore = null;
  if (index >= sessionQuestions.length - 1) {
    phase = results.length ? 'summary' : 'setup';
  } else {
    index += 1;
    phase = 'answering';
  }
  render();
}

function markCurrentMasteredAndAdvance(q) {
  if (!confirm('标记为已学会？之后自动抽题将不再出现本题。')) return;
  markQuestionMastered({
    questionId: q.id,
    question: q.question,
    detailTitle: q.detailTitle,
    categoryTitle: q.categoryTitle,
  });
  advanceAfterSkip();
}

function renderQuestionHistory() {
  const q = bank.find((x) => x.id === historyFocusId);
  const rec = historyFocusId ? getRecord(historyFocusId) : null;
  if (!q) {
    phase = 'list';
    return render();
  }
  const attempts = [...(rec?.attempts || [])].reverse();
  const status = reviewStatus(rec);

  root.innerHTML = `
    <div class="quiz-card">
      <div class="list-head">
        <h2 style="margin:0">答题历史</h2>
        <button type="button" id="btnBackList">返回列表</button>
      </div>
      <div class="quiz-meta">
        <span class="chip status-chip">${STATUS_LABELS[status]}</span>
        ${q.categoryTitle ? `<span class="chip">${escapeHtml(q.categoryTitle)}</span>` : ''}
        ${q.detailTitle ? `<span class="chip">${escapeHtml(q.detailTitle)}</span>` : ''}
      </div>
      ${renderQuestionStem(q.question)}
      <p class="muted">
        最近 ${rec?.lastScore ?? '—'} · 共 ${rec?.attempts?.length ?? 0} 次
        ${status === 'new' ? ' · 尚未作答' : ''}
      </p>
      <div class="result-block">
        <strong>参考答案</strong>
        <div class="md-body">${renderMarkdown(q.answer)}</div>
      </div>
      <div class="hist-detail-list">
        ${
          attempts.length
            ? attempts
                .map(
                  (a) => `
            <div class="hist-detail-card">
              <div class="hist-detail-head">
                <strong class="${a.score >= 70 ? 'ok' : a.score >= 40 ? 'mid' : 'bad'}">${a.score}</strong>
                <span class="muted">${formatDue(a.at)}</span>
              </div>
              ${a.reason ? `<div class="md-body">${renderMarkdown(a.reason)}</div>` : ''}
              <div class="md-body">${renderMarkdown(a.userAnswer || '（空）')}</div>
            </div>`,
                )
                .join('')
            : '<p class="muted">暂无作答记录</p>'
        }
      </div>
      <div class="actions" style="margin-top:16px">
        ${
          status === 'mastered'
            ? `<button type="button" id="btnUnmaster">恢复练习</button>`
            : `<button type="button" class="primary" id="btnPracticeOne">练这题</button>
               <button type="button" id="btnMastered">这题懂了</button>`
        }
      </div>
    </div>
  `;

  root.querySelector('#btnBackList').onclick = () => {
    phase = 'list';
    render();
  };
  const practiceBtn = root.querySelector('#btnPracticeOne');
  if (practiceBtn) practiceBtn.onclick = () => startSession([q]);
  const masterBtn = root.querySelector('#btnMastered');
  if (masterBtn) {
    masterBtn.onclick = () => {
      if (!confirm('标记为已学会？之后自动抽题将不再出现本题。')) return;
      markQuestionMastered({
        questionId: q.id,
        question: q.question,
        detailTitle: q.detailTitle,
        categoryTitle: q.categoryTitle,
      });
      render();
    };
  }
  const unmasterBtn = root.querySelector('#btnUnmaster');
  if (unmasterBtn) {
    unmasterBtn.onclick = () => {
      unmarkQuestionMastered(q.id);
      render();
    };
  }
}

function renderAnswering() {
  const q = sessionQuestions[index];
  const rec = getRecord(q.id);
  const status = reviewStatus(rec);
  root.innerHTML = `
    <div class="quiz-card">
      <p class="muted">第 ${index + 1} / ${sessionQuestions.length} 题
        · <span class="chip status-chip">${STATUS_LABELS[status]}</span>
        ${rec?.lastScore != null ? `· 上次 ${rec.lastScore}` : ''}
      </p>
      ${renderQuestionStem(q.question)}
      <div class="quiz-meta">
        ${q.categoryTitle ? `<span class="chip">${escapeHtml(q.categoryTitle)}</span>` : ''}
        ${q.detailTitle ? `<span class="chip">${escapeHtml(q.detailTitle)}</span>` : ''}
        ${(q.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
      </div>
      <label>你的回答</label>
      <textarea id="answer" placeholder="在此作答…">${escapeHtml(draftAnswer)}</textarea>
      <div class="actions">
        <button type="button" class="primary" id="btnSubmit" ${busy ? 'disabled' : ''}>
          ${busy ? '评分中…' : '提交并评分'}
        </button>
        <button type="button" id="btnMastered" ${busy ? 'disabled' : ''}>这题懂了</button>
        <button type="button" id="btnToList" ${busy ? 'disabled' : ''}>题目列表</button>
      </div>
      <p class="muted" id="err"></p>
    </div>
  `;

  const answerEl = root.querySelector('#answer');
  answerEl.oninput = () => {
    draftAnswer = answerEl.value;
  };

  root.querySelector('#btnToList').onclick = () => {
    if (busy) return;
    phase = 'list';
    render();
  };

  root.querySelector('#btnMastered').onclick = () => {
    if (busy) return;
    markCurrentMasteredAndAdvance(q);
  };

  root.querySelector('#btnSubmit').onclick = async () => {
    if (busy) return;
    busy = true;
    draftAnswer = answerEl.value;
    render();
    const errEl = () => document.getElementById('err');

    try {
      const resp = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.question,
          userAnswer: draftAnswer,
          referenceAnswer: q.answer,
          detailTitle: q.detailTitle,
          categoryTitle: q.categoryTitle,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      lastScore = {
        score: data.score,
        reason: data.reason,
        referenceAnswer: data.referenceAnswer ?? q.answer,
      };
      recordAttempt({
        questionId: q.id,
        question: q.question,
        detailTitle: q.detailTitle,
        categoryTitle: q.categoryTitle,
        score: lastScore.score,
        userAnswer: draftAnswer,
        reason: lastScore.reason,
      });
      results.push({
        questionId: q.id,
        question: q.question,
        score: lastScore.score,
        reason: lastScore.reason,
        userAnswer: draftAnswer,
        referenceAnswer: lastScore.referenceAnswer,
        detailTitle: q.detailTitle || '',
      });
      phase = 'result';
    } catch (e) {
      busy = false;
      phase = 'answering';
      render();
      const el = errEl();
      if (el) el.textContent = `评分失败：${e.message || e}`;
      return;
    }
    busy = false;
    draftAnswer = '';
    render();
  };
}

function renderResult() {
  const q = sessionQuestions[index];
  const isLast = index >= sessionQuestions.length - 1;
  const userAnswer = results[results.length - 1]?.userAnswer || '（空）';
  root.innerHTML = `
    <div class="quiz-card">
      <p class="muted">第 ${index + 1} / ${sessionQuestions.length} 题 · 评分结果</p>
      ${renderQuestionStem(q.question)}
      <div class="score-big">${lastScore?.score ?? '—'}</div>
      <p class="muted">已写入历史 · 下次复习请手动点击「开始复习」</p>
      <div class="result-block">
        <strong>评分理由</strong>
        <div class="md-body">${renderMarkdown(lastScore?.reason || '')}</div>
      </div>
      <div class="result-block">
        <strong>参考答案</strong>
        <div class="md-body">${renderMarkdown(lastScore?.referenceAnswer || q.answer)}</div>
      </div>
      <div class="result-block">
        <strong>你的作答</strong>
        <div class="md-body">${renderMarkdown(userAnswer)}</div>
      </div>
      <div class="actions">
        <button type="button" class="primary" id="btnNext">${isLast ? '查看汇总' : '下一题'}</button>
        <button type="button" id="btnMastered">这题懂了</button>
        <button type="button" id="btnToList">题目列表</button>
      </div>
    </div>
  `;

  root.querySelector('#btnNext').onclick = () => {
    if (isLast) {
      phase = 'summary';
    } else {
      index += 1;
      lastScore = null;
      draftAnswer = '';
      phase = 'answering';
    }
    render();
  };
  root.querySelector('#btnMastered').onclick = () => {
    markCurrentMasteredAndAdvance(q);
  };
  root.querySelector('#btnToList').onclick = () => {
    phase = 'list';
    render();
  };
}

function renderSummary() {
  const avg =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
      : 0;

  root.innerHTML = `
    <div class="quiz-card">
      <h2 style="margin-top:0">复习完成</h2>
      <p>共 ${results.length} 题，平均分 <span class="score-big" style="font-size:1.6rem">${avg}</span></p>
      <p class="muted">答题历史已更新。再次复习请返回后手动点击「开始复习」。</p>
      <ul class="summary-list">
        ${results
          .map(
            (r, i) => `
          <li>
            <span>${i + 1}. ${escapeHtml(r.detailTitle || r.question.slice(0, 24))}</span>
            <strong>${r.score}</strong>
          </li>`,
          )
          .join('')}
      </ul>
      <div class="actions" style="margin-top:16px">
        <button type="button" class="primary" id="btnAgain">返回开始</button>
        <button type="button" id="btnList">题目列表</button>
        <button type="button" id="btnRefresh">刷新范围再练</button>
      </div>
    </div>
  `;

  root.querySelector('#btnAgain').onclick = () => {
    phase = 'setup';
    render();
  };
  root.querySelector('#btnList').onclick = () => {
    refreshBankFromKb();
    phase = 'list';
    render();
  };
  root.querySelector('#btnRefresh').onclick = () => {
    sessionQuestions = [];
    results = [];
    phase = 'setup';
    render();
  };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return '<p class="muted">（空）</p>';
  const html = marked.parse(raw, { async: false });
  return typeof html === 'string' ? html : String(html);
}

refreshBankFromKb();
render();
