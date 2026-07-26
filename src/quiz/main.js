import { marked } from 'marked';
import { buildInterviewExport } from '../shared/schema.js';
import { loadKb, pruneQuizPool } from '../shared/storage.js';
import {
  loadHistoryMap,
  recordAttempt,
  pickByForgettingCurve,
  reviewStatus,
  formatDue,
  STATUS_LABELS,
  getRecord,
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
/** 是否按遗忘曲线抽题 */
let useForgettingCurve = true;
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
  const due = bank.filter((q) => reviewStatus(hist[q.id]) === 'due').length;
  const neu = bank.filter((q) => reviewStatus(hist[q.id]) === 'new').length;
  const scopeText = scopeInfo.usingPool
    ? `面试池 ${scopeInfo.poolCount} 个知识点`
    : '面试池为空 · 暂使用知识库全部知识点';

  root.innerHTML = `
    <div class="quiz-card">
      <h2 style="margin-top:0">面试模拟</h2>
      <p class="muted">题目与答案与知识点库共用。请在图谱页多选后点击「加入面试模拟」；已加入的知识点才会作为抽题范围。池为空时暂从全部有面试题的知识点中抽取。</p>
      <div class="result-block" style="margin-top:0">
        <strong>当前范围</strong>
        <p class="muted" style="margin:8px 0 0" id="bankInfo">
          ${scopeText} → ${bank.length} 道题
          · 待复习 ${due} · 新题 ${neu}
          ${scopeInfo.skipped ? ` · ${scopeInfo.skipped} 个知识点无面试题已跳过` : ''}
        </p>
      </div>
      <label style="margin-top:14px">抽取题数 N</label>
      <input type="number" id="n" min="1" value="${Math.min(5, Math.max(1, bank.length))}" />
      <label class="field-row" style="margin-top:10px">
        <input type="checkbox" id="useCurve" class="check" ${useForgettingCurve ? 'checked' : ''} />
        <span>按遗忘曲线自动选取题目（优先待复习 / 新题 / 低分）</span>
      </label>
      <div class="actions">
        <button type="button" class="primary" id="btnStart" ${bank.length ? '' : 'disabled'}>开始模拟</button>
        <button type="button" id="btnRefresh">刷新范围</button>
        <button type="button" id="btnList" ${bank.length ? '' : 'disabled'}>题目列表</button>
        <a class="link-btn" href="/knowledge.html">去图谱添加</a>
      </div>
      <p class="muted" style="margin-top:16px">评分经由本地 Express 代理 <code>/api/score</code>。答题历史保存在本机，按题目 id 与知识库对应。</p>
    </div>
  `;

  const nEl = root.querySelector('#n');
  nEl.max = String(Math.max(1, bank.length));
  if (bank.length) {
    nEl.value = String(Math.min(Number(nEl.value) || 5, bank.length));
  }

  root.querySelector('#useCurve').onchange = (e) => {
    useForgettingCurve = e.target.checked;
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
    if (!bank.length) {
      render();
      return;
    }
    let n = Number(nEl.value) || 1;
    n = Math.max(1, Math.min(bank.length, Math.floor(n)));
    const picked = useForgettingCurve ? pickByForgettingCurve(bank, n) : shuffle(bank).slice(0, n);
    startSession(picked);
  };
}

function renderQuestionList() {
  const hist = loadHistoryMap();
  const now = Date.now();
  const rows = bank.map((q) => {
    const rec = hist[q.id];
    const status = reviewStatus(rec, now);
    const attempts = rec?.attempts || [];
    const last = rec?.lastScore;
    const avg =
      attempts.length > 0
        ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
        : null;
    return { q, rec, status, attempts, last, avg };
  });

  // 待复习靠前
  const order = { due: 0, new: 1, soon: 2, ok: 3 };
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  root.innerHTML = `
    <div class="quiz-card">
      <div class="list-head">
        <h2 style="margin:0">题目列表 · ${bank.length}</h2>
        <button type="button" id="btnBackSetup">返回</button>
      </div>
      <p class="muted">可查看历史分数；点击「练这题」单独开练。状态由遗忘曲线推算。</p>
      <div class="q-list" id="qList"></div>
    </div>
  `;

  const listEl = root.querySelector('#qList');
  for (const row of rows) {
    const { q, rec, status, attempts, last, avg } = row;
    const open = expandedHistoryId === q.id;
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
          · 下次 ${status === 'new' ? '首次' : formatDue(rec?.nextDueAt)}
        </div>
      </div>
      <div class="q-item-actions">
        <button type="button" data-hist="${escapeAttr(q.id)}">${open ? '收起' : '历史'}</button>
        <button type="button" data-detail="${escapeAttr(q.id)}">详情</button>
        <button type="button" class="primary" data-practice="${escapeAttr(q.id)}">练这题</button>
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
      <h3 style="margin-top:8px">${escapeHtml(q.question)}</h3>
      <p class="muted">
        最近 ${rec?.lastScore ?? '—'} · 间隔 ${rec?.intervalDays ?? '—'} 天
        · 下次复习 ${status === 'new' ? '尚未作答' : formatDue(rec?.nextDueAt)}
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
        <button type="button" class="primary" id="btnPracticeOne">练这题</button>
      </div>
    </div>
  `;

  root.querySelector('#btnBackList').onclick = () => {
    phase = 'list';
    render();
  };
  root.querySelector('#btnPracticeOne').onclick = () => startSession([q]);
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
      <h2 style="margin-top:0">${escapeHtml(q.question)}</h2>
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
  const rec = getRecord(q.id);
  root.innerHTML = `
    <div class="quiz-card">
      <p class="muted">第 ${index + 1} / ${sessionQuestions.length} 题 · 评分结果</p>
      <h2 style="margin-top:0">${escapeHtml(q.question)}</h2>
      <div class="score-big">${lastScore?.score ?? '—'}</div>
      <p class="muted">已写入历史 · 建议下次复习：${formatDue(rec?.nextDueAt)}</p>
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
      <h2 style="margin-top:0">模拟完成</h2>
      <p>共 ${results.length} 题，平均分 <span class="score-big" style="font-size:1.6rem">${avg}</span></p>
      <p class="muted">答题已按遗忘曲线更新下次复习时间。</p>
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
