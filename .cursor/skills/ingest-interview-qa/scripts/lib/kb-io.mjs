import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateKnowledgeBase, newId } from '../../../../../src/shared/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @returns {string} GameDesign 项目根 */
export function projectRoot() {
  // .../scripts/lib -> 上 5 级到项目根
  return path.resolve(__dirname, '../../../../../');
}

export function defaultKbPath() {
  return path.join(projectRoot(), 'data', 'knowledge-base.json');
}

/** 可提交的样例库（优先） */
export function sampleKbPath() {
  const preferred = path.join(projectRoot(), 'datasample', 'sample-kb.json');
  if (fs.existsSync(preferred)) return preferred;
  return path.join(projectRoot(), 'data', 'sample-kb.json');
}

/**
 * 确保 knowledge-base.json 存在（可从 datasample/sample-kb.json 复制）
 * @param {string} [kbPath]
 */
export function ensureKbFile(kbPath = defaultKbPath()) {
  if (fs.existsSync(kbPath)) return kbPath;
  const sample = sampleKbPath();
  fs.mkdirSync(path.dirname(kbPath), { recursive: true });
  if (fs.existsSync(sample)) {
    fs.copyFileSync(sample, kbPath);
  } else {
    fs.writeFileSync(
      kbPath,
      JSON.stringify({ version: 1, categories: [], details: [] }, null, 2) + '\n',
      'utf8',
    );
  }
  return kbPath;
}

/**
 * @param {string} [kbPath]
 */
export function loadKb(kbPath = defaultKbPath()) {
  ensureKbFile(kbPath);
  const raw = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  const result = validateKnowledgeBase(raw);
  if (!result.ok) {
    throw new Error(`知识点库校验失败:\n${result.errors.join('\n')}`);
  }
  return { path: kbPath, data: result.data };
}

/**
 * @param {object} kb
 * @param {string} [kbPath]
 */
export function saveKb(kb, kbPath = defaultKbPath()) {
  const result = validateKnowledgeBase(kb);
  if (!result.ok) {
    throw new Error(`写入前校验失败:\n${result.errors.join('\n')}`);
  }
  fs.mkdirSync(path.dirname(kbPath), { recursive: true });
  fs.writeFileSync(kbPath, JSON.stringify(result.data, null, 2) + '\n', 'utf8');
  return result.data;
}

export { newId, validateKnowledgeBase };

/**
 * 简易 argv 解析：--key value / --flag
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/**
 * @param {string | boolean | undefined} fileOrText
 * @param {string | boolean | undefined} fileFlag
 */
export function readTextArg(fileOrText, fileFlag) {
  if (typeof fileFlag === 'string' && fileFlag) {
    const p = path.isAbsolute(fileFlag) ? fileFlag : path.join(projectRoot(), fileFlag);
    return fs.readFileSync(p, 'utf8');
  }
  if (typeof fileOrText === 'string') return fileOrText;
  return '';
}

/**
 * 逗号/中文逗号分隔的 id / tag 列表
 * @param {string | boolean | undefined} value
 * @returns {string[]}
 */
export function parseIdList(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 面经重建默认输出 */
export function interviewQaKbPath() {
  return path.join(projectRoot(), 'data', 'interview-qa-kb.json');
}

/** 临时文本目录（长 Q/A 写入此处再 --*-file 传入） */
export function tmpDir() {
  const p = path.join(projectRoot(), 'tmp');
  fs.mkdirSync(p, { recursive: true });
  return p;
}
