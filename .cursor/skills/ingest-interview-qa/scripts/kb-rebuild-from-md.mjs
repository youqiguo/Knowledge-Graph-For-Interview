#!/usr/bin/env node
/**
 * 从面经 Markdown + kb-clusters.mjs 重建知识点库 JSON。
 * 知识点 title/content ≠ 整题；问答写入 interviewQA；relatedIds 建边并对称补全。
 *
 *   node .cursor/skills/ingest-interview-qa/scripts/kb-rebuild-from-md.mjs
 *   node .../kb-rebuild-from-md.mjs --kb data/interview-qa-kb.json
 *   node .../kb-rebuild-from-md.mjs --md Notes/面试问答-待确认.md --kb data/interview-qa-kb.json
 *
 * 默认源文 Notes/… 与输出 data/… 均在 .gitignore 中，仅本地使用。
 */
import fs from 'fs';
import path from 'path';
import { projectRoot, saveKb, parseArgs } from './lib/kb-io.mjs';
import { CLUSTERS, THEME_TO_CAT } from './kb-clusters.mjs';

function parseMd(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const idxs = [];
  const secRe = /^## (.+)$/gm;
  let s;
  while ((s = secRe.exec(normalized))) {
    idxs.push({ theme: s[1].trim(), i: s.index, e: s.index + s[0].length });
  }
  /** @type {Map<string, { id: string, theme: string, question: string, answer: string, source: string }>} */
  const byId = new Map();
  for (let i = 0; i < idxs.length; i++) {
    const body = normalized.slice(idxs[i].e, idxs[i + 1]?.i ?? normalized.length);
    const ir =
      /### \d+\. (.+?)\n\n- id: `([^`]+)`\n- 来源: (.+?)\n\n\*\*答案\*\*\n\n([\s\S]*?)\n+---/g;
    let im;
    while ((im = ir.exec(body))) {
      const id = im[2].trim();
      byId.set(id, {
        id,
        theme: idxs[i].theme,
        question: im[1].trim(),
        source: im[3].trim(),
        answer: im[4].trim(),
      });
    }
  }
  return byId;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = projectRoot();
  const mdRel = typeof args.md === 'string' ? args.md : 'Notes/面试问答-待确认.md';
  const kbRel = typeof args.kb === 'string' ? args.kb : 'data/interview-qa-kb.json';
  const mdPath = path.isAbsolute(mdRel) ? mdRel : path.join(root, mdRel);
  const kbPath = path.isAbsolute(kbRel) ? kbRel : path.join(root, kbRel);

  const byId = parseMd(fs.readFileSync(mdPath, 'utf8'));
  const usedQa = new Set();
  const clusterIds = new Set(CLUSTERS.map((c) => c.id));

  /** @type {any[]} */
  const categories = [];
  const catSeen = new Set();
  for (const c of CLUSTERS) {
    const meta = THEME_TO_CAT[c.theme];
    if (!meta) throw new Error(`未知 theme: ${c.theme}`);
    if (catSeen.has(meta.id)) continue;
    catSeen.add(meta.id);
    categories.push({
      id: meta.id,
      title: meta.title,
      content: meta.content,
      aiExplorePrompt: `围绕「${meta.title}」讲解下属知识点，对比易混概念并给出面试追问。`,
      status: 'learning',
      weak: false,
    });
  }

  /** @type {any[]} */
  const details = [];
  const missing = [];
  const unknownRelated = [];

  for (const c of CLUSTERS) {
    const meta = THEME_TO_CAT[c.theme];
    const interviewQA = [];
    for (const qid of c.qaIds) {
      const item = byId.get(qid);
      if (!item) {
        missing.push(`${c.id} <- ${qid}`);
        continue;
      }
      usedQa.add(qid);
      interviewQA.push({
        id: `qa_${qid}`,
        question: item.question,
        answer: item.answer,
      });
    }
    if (!interviewQA.length) {
      console.warn('跳过无 QA 的聚类:', c.id);
      continue;
    }

    const relatedIds = [];
    for (const rid of c.related || []) {
      if (!clusterIds.has(rid)) {
        unknownRelated.push(`${c.id} -> ${rid}`);
        continue;
      }
      if (rid !== c.id) relatedIds.push(rid);
    }

    details.push({
      id: c.id,
      categoryId: meta.id,
      title: c.title,
      content: c.content,
      aiExplorePrompt: `深入讲解「${c.title}」：原理、常见坑、复杂度/场景对比，并围绕下属面试题展开。`,
      status: 'unlearned',
      weak: false,
      tags: c.tags || [],
      relatedIds,
      interviewQA,
    });
  }

  // 未聚类的 QA：各自落成独立知识点（保底）
  const orphan = [...byId.values()].filter((x) => !usedQa.has(x.id));
  for (const item of orphan) {
    const meta = THEME_TO_CAT[item.theme];
    if (!meta) {
      missing.push(`orphan theme ${item.theme} ${item.id}`);
      continue;
    }
    if (!catSeen.has(meta.id)) {
      catSeen.add(meta.id);
      categories.push({
        id: meta.id,
        title: meta.title,
        content: meta.content,
        aiExplorePrompt: `围绕「${meta.title}」讲解下属知识点。`,
        status: 'learning',
        weak: false,
      });
    }
    const detId = `det_orphan_${item.id}`;
    details.push({
      id: detId,
      categoryId: meta.id,
      title: item.question.replace(/[？?].*$/, '').replace(/^(说一下|简述|什么是|如何|怎么)/, '').trim().slice(0, 24) || item.id,
      content: item.answer
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[#>*_`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180),
      aiExplorePrompt: `讲解该知识点并结合面试题。`,
      status: 'unlearned',
      weak: false,
      tags: [item.theme, '待归类'],
      relatedIds: [],
      interviewQA: [{ id: `qa_${item.id}`, question: item.question, answer: item.answer }],
    });
  }

  // 对称补全 relatedIds（无向语义）
  const detMap = new Map(details.map((d) => [d.id, d]));
  for (const d of details) {
    for (const rid of d.relatedIds) {
      const other = detMap.get(rid);
      if (!other) continue;
      if (!other.relatedIds.includes(d.id)) other.relatedIds.push(d.id);
    }
  }

  const kb = { version: 1, categories, details };
  saveKb(kb, kbPath);

  const edgeCount = details.reduce((n, d) => n + d.relatedIds.length, 0) / 2;
  const qaCount = details.reduce((n, d) => n + d.interviewQA.length, 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'rebuild-from-md',
        kbPath,
        categories: categories.length,
        details: details.length,
        interviewQA: qaCount,
        undirectedEdgesApprox: edgeCount,
        orphanCount: orphan.length,
        missingQaRefs: missing,
        unknownRelated,
      },
      null,
      2,
    ),
  );
}

main();
