#!/usr/bin/env node
import { loadKb, saveKb, parseArgs, readTextArg, newId, defaultKbPath } from './lib/kb-io.mjs';

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args['mode'] || '');
  const kbPath = typeof args['kb'] === 'string' ? args['kb'] : defaultKbPath();
  const { path: resolved, data: kb } = loadKb(kbPath);

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
    const tags = String(args['tags'] || '')
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const question = readTextArg(args['question'], args['question-file']).trim();
    const answer = readTextArg(args['answer'], args['answer-file']).trim();

    if (!categoryId || !title) fail('create-detail 需要 --category-id 与 --title');
    if (!kb.categories.some((c) => c.id === categoryId)) {
      fail(`类别不存在: ${categoryId}（可先 create-category）`);
    }

    const detailId = typeof args['id'] === 'string' ? args['id'] : newId('det');
    if (kb.details.some((d) => d.id === detailId)) fail(`详细知识点 id 已存在: ${detailId}`);

    /** @type {{ id: string, question: string, answer: string }[]} */
    const interviewQA = [];
    let qaId = null;
    if (question) {
      qaId = newId('qa');
      interviewQA.push({ id: qaId, question, answer: answer || '' });
    }

    const detail = {
      id: detailId,
      categoryId,
      title,
      content: content || '',
      aiExplorePrompt: aiExplorePrompt || '',
      status: 'unlearned',
      weak: false,
      tags,
      relatedIds: [],
      interviewQA,
    };

    saveKb({ ...kb, details: [...kb.details, detail] }, resolved);
    print({
      ok: true,
      action: 'create-detail',
      kbPath: resolved,
      detailId,
      categoryId,
      qaId,
      title,
    });
    return;
  }

  fail(
    '未知 --mode。支持: append-qa | create-detail | create-category\n' +
      '示例:\n' +
      '  --mode append-qa --detail-id det_x --question "..." --answer "..."\n' +
      '  --mode create-detail --category-id cat_x --title "..." --question "..." --answer "..."\n' +
      '  --mode create-category --title "..."',
  );
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function print(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

main();
