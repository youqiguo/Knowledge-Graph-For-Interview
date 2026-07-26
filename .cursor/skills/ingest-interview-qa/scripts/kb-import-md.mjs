#!/usr/bin/env node
/**
 * 已废弃：旧版「一题一节点、title=整题」导入。
 * 请改用 kb-rebuild-from-md.mjs + kb-clusters.mjs。
 */
console.error(
  [
    'kb-import-md.mjs 已废弃。',
    '请使用：',
    '  node .cursor/skills/ingest-interview-qa/scripts/kb-rebuild-from-md.mjs --kb data/interview-qa-kb.json',
    '并维护聚类表 scripts/kb-clusters.mjs（知识点 title/content + qaIds + related）。',
  ].join('\n'),
);
process.exit(1);
