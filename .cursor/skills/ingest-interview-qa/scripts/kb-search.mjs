#!/usr/bin/env node
import fs from 'fs';
import { loadKb, parseArgs, defaultKbPath } from './lib/kb-io.mjs';
import { searchDetails } from './lib/similarity.mjs';

function main() {
  const args = parseArgs(process.argv.slice(2));
  const kbPath = typeof args['kb'] === 'string' ? args['kb'] : defaultKbPath();
  const top = Math.max(1, Number(args['top'] || 10) || 10);

  let query = '';
  if (typeof args['query-file'] === 'string') {
    query = fs.readFileSync(args['query-file'], 'utf8');
  } else if (typeof args['query'] === 'string') {
    query = args['query'];
  }

  query = query.trim();
  if (!query) {
    console.error('用法: node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query "..." [--top 10] [--kb path]');
    console.error('  或: .../kb-search.mjs --query-file tmp/query.txt');
    process.exit(1);
  }

  const { path: resolved, data: kb } = loadKb(kbPath);
  const catMap = new Map(kb.categories.map((c) => [c.id, c]));
  const results = searchDetails(query, kb.details, catMap, top);

  const out = {
    kbPath: resolved,
    query,
    top,
    totalDetails: kb.details.length,
    results,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main();
