/**
 * 将「题干无代码、答案里带语言标记代码块」的题：代码并入题干，并从答案去掉重复代码块。
 * 用法：
 *   node .../kb-fix-qa-stem-code.mjs --kb data/interview-qa-kb.json
 *   node .../kb-fix-qa-stem-code.mjs --kb data/knowledge-base.json --dry-run
 */
import {
  loadKb,
  saveKb,
  parseArgs,
  defaultKbPath,
  projectRoot,
} from './lib/kb-io.mjs';
import path from 'path';

function extractFenced(md) {
  const withLang = [];
  const plain = [];
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(String(md ?? '')))) {
    const fence = m[0];
    const lang = String(m[1] || '').trim();
    if (lang) withLang.push({ fence, lang, index: m.index, end: m.index + fence.length });
    else plain.push({ fence, lang: '', index: m.index, end: m.index + fence.length });
  }
  return { withLang, plain };
}

/**
 * 从答案去掉第一段「**代码：** + 带语言代码块」（保留输出与解释）
 */
function stripLeadingCodeSection(answer, codeFence) {
  let a = String(answer ?? '');
  // 去掉 **代码：** / 代码： 标题 + 紧随的该代码块
  const patterns = [
    new RegExp(
      String.raw`(?:\*\*代码：\*\*|代码：)\s*\n?` +
        codeFence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        String.raw`\s*`,
    ),
    new RegExp(codeFence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String.raw`\s*`),
  ];
  for (const re of patterns) {
    if (re.test(a)) {
      a = a.replace(re, '');
      break;
    }
  }
  return a.replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n').trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const kbRel = typeof args.kb === 'string' ? args.kb : defaultKbPath();
  const kbPath = path.isAbsolute(kbRel) ? kbRel : path.join(projectRoot(), kbRel);
  const dry = args['dry-run'] === true;
  const { path: resolved, data: kb } = loadKb(kbPath);

  const changes = [];
  const details = kb.details.map((d) => {
    const interviewQA = (d.interviewQA || []).map((qa) => {
      const q = String(qa.question || '');
      const a = String(qa.answer || '');
      if (/```/.test(q)) return qa;
      const { withLang } = extractFenced(a);
      if (!withLang.length) return qa;
      // 仅当题干像「如下/以下代码」或答案以代码段开头时修复
      const looksLikeStemMissing =
        /如下代码|以下代码|下列代码|看代码|代码的运行|运行结果/.test(q) ||
        /^(?:\*\*代码：\*\*|代码：)/.test(a.trim());
      if (!looksLikeStemMissing) return qa;

      const first = withLang[0];
      const newQ = `${q.trim()}\n\n${first.fence}`;
      const newA = stripLeadingCodeSection(a, first.fence);
      changes.push({
        detailId: d.id,
        detailTitle: d.title,
        qaId: qa.id,
        questionBefore: q.slice(0, 80),
        answerHeadAfter: newA.slice(0, 80),
      });
      return { ...qa, question: newQ, answer: newA };
    });
    return { ...d, interviewQA };
  });

  if (!dry && changes.length) {
    saveKb({ ...kb, details }, resolved);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        action: 'fix-qa-stem-code',
        kbPath: resolved,
        dryRun: dry,
        changed: changes.length,
        changes,
      },
      null,
      2,
    ) + '\n',
  );
}

main();
