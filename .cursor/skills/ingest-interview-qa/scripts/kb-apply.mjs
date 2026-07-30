#!/usr/bin/env node
/**
 * 知识点库写入（唯一允许的变更入口之一）
 *
 * Modes:
 *   append-qa | update-qa | create-detail | create-category
 *   add-related | set-related | update-detail | list
 */
import {
  loadKb,
  saveKb,
  parseArgs,
  readTextArg,
  newId,
  defaultKbPath,
  parseIdList,
} from './lib/kb-io.mjs';

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args['mode'] || '');
  const kbPath = typeof args['kb'] === 'string' ? args['kb'] : defaultKbPath();
  const { path: resolved, data: kb } = loadKb(kbPath);

  if (mode === 'list') {
    const kind = String(args['kind'] || 'all');
    const out = {
      ok: true,
      action: 'list',
      kbPath: resolved,
      categories: kb.categories.map((c) => ({
        id: c.id,
        title: c.title,
        detailCount: kb.details.filter((d) => d.categoryId === c.id).length,
      })),
      details:
        kind === 'categories'
          ? undefined
          : kb.details.map((d) => ({
              id: d.id,
              title: d.title,
              categoryId: d.categoryId,
              tags: d.tags || [],
              relatedCount: (d.relatedIds || []).length,
              qaCount: (d.interviewQA || []).length,
            })),
    };
    if (kind === 'details') delete out.categories;
    print(out);
    return;
  }

  if (mode === 'append-qa') {
    const detailId = String(args['detail-id'] || '');
    const question = readTextArg(args['question'], args['question-file']).trim();
    const answer = readTextArg(args['answer'], args['answer-file']).trim();
    if (!detailId || !question) {
      fail('append-qa 需要 --detail-id 与 --question/--question-file');
    }
    const idx = kb.details.findIndex((d) => d.id === detailId);
    if (idx < 0) fail(`找不到详细知识点: ${detailId}`);

    const qaId = newId('qa');
    const qa = { id: qaId, question, answer: answer || '' };
    const details = kb.details.slice();
    details[idx] = {
      ...details[idx],
      interviewQA: [...(details[idx].interviewQA || []), qa],
    };
    saveKb({ ...kb, details }, resolved);
    print({
      ok: true,
      action: 'append-qa',
      kbPath: resolved,
      detailId,
      qaId,
      question,
      note: '面试模拟与知识库共用 interviewQA；需在图谱页导入 JSON 后才会进入 UI/面试池可选范围',
    });
    return;
  }

  if (mode === 'update-qa') {
    const detailId = String(args['detail-id'] || '').trim();
    const qaId = String(args['qa-id'] || '').trim();
    if (!detailId || !qaId) fail('update-qa 需要 --detail-id 与 --qa-id');
    const idx = kb.details.findIndex((d) => d.id === detailId);
    if (idx < 0) fail(`找不到详细知识点: ${detailId}`);
    const qas = [...(kb.details[idx].interviewQA || [])];
    const qi = qas.findIndex((q) => q.id === qaId);
    if (qi < 0) fail(`找不到问答: ${qaId}`);
    const cur = qas[qi];
    const patch = { ...cur };
    if (args['question'] !== undefined || args['question-file']) {
      patch.question = readTextArg(args['question'], args['question-file']).trim();
    }
    if (args['answer'] !== undefined || args['answer-file']) {
      patch.answer = readTextArg(args['answer'], args['answer-file']).trim();
    }
    if (!patch.question) fail('update-qa 后 question 不能为空');
    qas[qi] = patch;
    const details = kb.details.slice();
    details[idx] = { ...details[idx], interviewQA: qas };
    saveKb({ ...kb, details }, resolved);
    print({
      ok: true,
      action: 'update-qa',
      kbPath: resolved,
      detailId,
      qaId,
      questionHead: patch.question.slice(0, 120),
    });
    return;
  }

  if (mode === 'create-category') {
    const title = String(args['title'] || '').trim();
    const content = readTextArg(args['content'], args['content-file']).trim();
    const aiExplorePrompt = readTextArg(args['ai'], args['ai-file']).trim();
    if (!title) fail('create-category 需要 --title');

    const id = typeof args['id'] === 'string' ? args['id'] : newId('cat');
    if (kb.categories.some((c) => c.id === id)) fail(`类别 id 已存在: ${id}`);

    const cat = {
      id,
      title,
      content: content || '',
      aiExplorePrompt: aiExplorePrompt || '',
      status: 'unlearned',
      weak: false,
    };
    saveKb({ ...kb, categories: [...kb.categories, cat] }, resolved);
    print({ ok: true, action: 'create-category', kbPath: resolved, categoryId: id, title });
    return;
  }

  if (mode === 'create-detail') {
    const categoryId = String(args['category-id'] || '').trim();
    const title = String(args['title'] || '').trim();
    const content = readTextArg(args['content'], args['content-file']).trim();
    const aiExplorePrompt = readTextArg(args['ai'], args['ai-file']).trim();
    const tags = parseIdList(args['tags']);
    const relatedIds = parseIdList(args['related-ids']);
    const question = readTextArg(args['question'], args['question-file']).trim();
    const answer = readTextArg(args['answer'], args['answer-file']).trim();
    const symmetric = args['no-symmetric'] !== true;

    if (!categoryId || !title) fail('create-detail 需要 --category-id 与 --title');
    if (!kb.categories.some((c) => c.id === categoryId)) {
      fail(`类别不存在: ${categoryId}（可先 create-category）`);
    }

    const detailId = typeof args['id'] === 'string' ? args['id'] : newId('det');
    if (kb.details.some((d) => d.id === detailId)) fail(`详细知识点 id 已存在: ${detailId}`);

    for (const rid of relatedIds) {
      if (!kb.details.some((d) => d.id === rid)) {
        fail(`related-ids 引用不存在: ${rid}`);
      }
    }

    /** @type {{ id: string, question: string, answer: string }[]} */
    const interviewQA = [];
    let qaId = null;
    if (question) {
      qaId = newId('qa');
      interviewQA.push({ id: qaId, question, answer: answer || '' });
    }

    let details = [
      ...kb.details,
      {
        id: detailId,
        categoryId,
        title,
        content: content || '',
        aiExplorePrompt: aiExplorePrompt || '',
        status: 'unlearned',
        weak: false,
        tags,
        relatedIds: [...relatedIds],
        interviewQA,
      },
    ];

    if (symmetric && relatedIds.length) {
      details = applyRelated(details, detailId, relatedIds, { replace: false, symmetric: true });
    }

    saveKb({ ...kb, details }, resolved);
    print({
      ok: true,
      action: 'create-detail',
      kbPath: resolved,
      detailId,
      categoryId,
      qaId,
      title,
      relatedIds,
    });
    return;
  }

  if (mode === 'add-related' || mode === 'set-related') {
    const detailId = String(args['detail-id'] || '').trim();
    const relatedIds = parseIdList(args['related-ids']);
    const symmetric = args['no-symmetric'] !== true;
    if (!detailId) fail(`${mode} 需要 --detail-id`);
    if (!relatedIds.length && mode === 'add-related') {
      fail('add-related 需要 --related-ids（逗号分隔）');
    }
    if (!kb.details.some((d) => d.id === detailId)) fail(`找不到详细知识点: ${detailId}`);
    for (const rid of relatedIds) {
      if (rid === detailId) continue;
      if (!kb.details.some((d) => d.id === rid)) fail(`related-ids 引用不存在: ${rid}`);
    }

    const details = applyRelated(kb.details, detailId, relatedIds, {
      replace: mode === 'set-related',
      symmetric,
    });
    const self = details.find((d) => d.id === detailId);
    saveKb({ ...kb, details }, resolved);
    print({
      ok: true,
      action: mode,
      kbPath: resolved,
      detailId,
      relatedIds: self?.relatedIds || [],
      symmetric,
    });
    return;
  }

  if (mode === 'update-detail') {
    const detailId = String(args['detail-id'] || '').trim();
    if (!detailId) fail('update-detail 需要 --detail-id');
    const idx = kb.details.findIndex((d) => d.id === detailId);
    if (idx < 0) fail(`找不到详细知识点: ${detailId}`);

    const cur = kb.details[idx];
    const patch = { ...cur };
    if (typeof args['title'] === 'string') patch.title = String(args['title']).trim() || cur.title;
    if (args['content'] !== undefined || args['content-file']) {
      patch.content = readTextArg(args['content'], args['content-file']);
    }
    if (args['ai'] !== undefined || args['ai-file']) {
      patch.aiExplorePrompt = readTextArg(args['ai'], args['ai-file']);
    }
    if (typeof args['tags'] === 'string') patch.tags = parseIdList(args['tags']);
    if (typeof args['category-id'] === 'string') {
      const categoryId = String(args['category-id']).trim();
      if (!kb.categories.some((c) => c.id === categoryId)) fail(`类别不存在: ${categoryId}`);
      patch.categoryId = categoryId;
    }
    if (typeof args['status'] === 'string') patch.status = String(args['status']);
    if (args['weak'] === true || args['weak'] === 'true') patch.weak = true;
    if (args['weak'] === false || args['weak'] === 'false' || args['no-weak'] === true) {
      patch.weak = false;
    }

    const details = kb.details.slice();
    details[idx] = patch;
    saveKb({ ...kb, details }, resolved);
    print({
      ok: true,
      action: 'update-detail',
      kbPath: resolved,
      detailId,
      title: patch.title,
      categoryId: patch.categoryId,
      tags: patch.tags,
    });
    return;
  }

  fail(
    '未知 --mode。支持:\n' +
      '  append-qa | update-qa | create-detail | create-category\n' +
      '  add-related | set-related | update-detail | list\n' +
      '示例:\n' +
      '  --mode append-qa --detail-id det_x --question-file tmp/q.txt --answer-file tmp/a.txt\n' +
      '  --mode update-qa --detail-id det_x --qa-id qa_x --question-file tmp/q.txt\n' +
      '  --mode create-detail --category-id cat_x --title "..." --related-ids det_a,det_b\n' +
      '  --mode add-related --detail-id det_x --related-ids det_a,det_b\n' +
      '  --mode list --kind categories',
  );
}

/**
 * @param {any[]} details
 * @param {string} detailId
 * @param {string[]} relatedIds
 * @param {{ replace: boolean, symmetric: boolean }} opts
 */
function applyRelated(details, detailId, relatedIds, opts) {
  const next = details.map((d) => ({
    ...d,
    relatedIds: [...(d.relatedIds || [])],
  }));
  const self = next.find((d) => d.id === detailId);
  if (!self) return details;

  const clean = [...new Set(relatedIds.filter((id) => id && id !== detailId))];
  if (opts.replace) {
    self.relatedIds = clean;
  } else {
    for (const rid of clean) {
      if (!self.relatedIds.includes(rid)) self.relatedIds.push(rid);
    }
  }

  if (opts.symmetric) {
    const want = new Set(self.relatedIds);
    for (const d of next) {
      if (d.id === detailId) continue;
      if (want.has(d.id)) {
        if (!d.relatedIds.includes(detailId)) d.relatedIds.push(detailId);
      } else if (opts.replace) {
        d.relatedIds = d.relatedIds.filter((id) => id !== detailId);
      }
    }
  }

  return next;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function print(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

main();
