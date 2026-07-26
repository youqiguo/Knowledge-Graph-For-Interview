#!/usr/bin/env node
/**
 * 已废弃：旧版「一题一节点、title=整题」导入。
 * 请改用 kb-rebuild-from-md.mjs + kb-clusters.mjs。
 */
console.error(
  [
    'kb-import-md.mjs 已废弃（一题一 detail 的旧模型）。',
    '',
    '正确流程：',
    '  1. 维护 .cursor/skills/ingest-interview-qa/scripts/kb-clusters.mjs',
    '     （知识点 title/content + qaIds + related + theme）',
    '  2. 源文：Notes/面试问答-待确认.md（本地目录，见 .gitignore）',
    '  3. 重建：',
    '     node .cursor/skills/ingest-interview-qa/scripts/kb-rebuild-from-md.mjs --kb data/interview-qa-kb.json',
    '',
    '单条入库请用 kb-search.mjs + kb-apply.mjs（append-qa / create-detail）。',
  ].join('\n'),
);
process.exit(1);
