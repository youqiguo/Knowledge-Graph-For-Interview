import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
// 固定从项目根加载 .env（不依赖 process.cwd()）
dotenv.config({ path: path.join(rootDir, '.env') });
const PORT = Number(process.env.PORT) || 3001;
const distDir = path.join(rootDir, 'dist');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const SCORE_SYSTEM_PROMPT = `你是严格的技术面试评分助手。根据题目、参考答案与考生作答，给出 0–100 的分数，并简要说明理由。
只返回合法 JSON 对象，不要 markdown，不要其它文字。格式：
{"score": <number>, "reason": "<string>"}
评分标准：准确性与完整性为主；表述不完整可酌情扣分；完全无关或空白给低分。`;

app.post('/api/score', async (req, res) => {
  const { question, userAnswer, referenceAnswer, detailTitle, categoryTitle } = req.body || {};

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: '缺少题目 question' });
  }
  if (typeof userAnswer !== 'string') {
    return res.status(400).json({ error: '缺少用户答案 userAnswer' });
  }
  if (typeof referenceAnswer !== 'string') {
    return res.status(400).json({ error: '缺少参考答案 referenceAnswer' });
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  // DeepSeek OpenAI 兼容：https://api.deepseek.com （见 https://api-docs.deepseek.com/zh-cn/）
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'deepseek-v4-pro';
  const thinkingType = String(process.env.OPENAI_THINKING || 'enabled').toLowerCase();
  const reasoningEffort = String(process.env.OPENAI_REASONING_EFFORT || 'high').toLowerCase();

  if (!apiKey) {
    return res.status(503).json({
      error: '未配置 OPENAI_API_KEY。请复制 .env.example 为 .env 并填写密钥。',
    });
  }

  const userPrompt = [
    categoryTitle ? `类别：${categoryTitle}` : null,
    detailTitle ? `知识点：${detailTitle}` : null,
    `题目：${question}`,
    `参考答案：${referenceAnswer}`,
    `考生作答：${userAnswer || '（空）'}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    /** @type {Record<string, unknown>} */
    const payload = {
      model,
      messages: [
        { role: 'system', content: SCORE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
    };

    // DeepSeek：thinking + reasoning_effort（OpenAI 兼容扩展字段）
    if (thinkingType === 'enabled' || thinkingType === 'disabled') {
      payload.thinking = { type: thinkingType };
    }
    if (thinkingType === 'enabled') {
      payload.reasoning_effort = ['low', 'medium', 'high'].includes(reasoningEffort)
        ? reasoningEffort
        : 'high';
    } else {
      payload.temperature = 0.2;
    }

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({
        error: `上游 API 错误 ${resp.status}`,
        detail: text.slice(0, 500),
      });
    }

    const data = await resp.json();
    const message = data?.choices?.[0]?.message;
    // 思考模式：最终作答仍在 content；reasoning_content 为思维链（评分只用 content）
    const content =
      typeof message?.content === 'string' && message.content.trim()
        ? message.content
        : typeof message?.reasoning_content === 'string'
          ? message.reasoning_content
          : null;
    if (!content || typeof content !== 'string') {
      return res.status(502).json({ error: '上游未返回有效内容' });
    }

    const parsed = parseScoreJson(content);
    if (!parsed) {
      return res.status(502).json({
        error: '评分结果 JSON 解析失败',
        raw: content.slice(0, 800),
      });
    }

    return res.json({
      score: parsed.score,
      reason: parsed.reason,
      referenceAnswer,
    });
  } catch (err) {
    return res.status(502).json({
      error: '调用评分 API 失败',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get('/api/health', (_req, res) => {
  const hasKey = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  res.json({
    ok: true,
    hasKey,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
    model: process.env.OPENAI_MODEL || 'deepseek-v4-pro',
    thinking: process.env.OPENAI_THINKING || 'enabled',
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'high',
  });
});

if (fs.existsSync(distDir) && process.env.SERVE_DIST !== '0') {
  // 开发时仅跑代理：设置 SERVE_DIST=0；生产/预览托管 dist
  if (process.env.NODE_ENV === 'production' || process.env.SERVE_DIST === '1') {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const file = req.path.endsWith('.html')
        ? path.join(distDir, req.path.slice(1))
        : path.join(distDir, 'knowledge.html');
      if (fs.existsSync(file)) return res.sendFile(file);
      return res.sendFile(path.join(distDir, 'knowledge.html'));
    });
  }
}

app.listen(PORT, () => {
  const hasKey = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  console.log(`[score-proxy] http://localhost:${PORT}  key=${hasKey ? 'ok' : 'MISSING'}`);
});

function parseScoreJson(content) {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  try {
    const obj = JSON.parse(text);
    return normalizeScore(obj);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return normalizeScore(JSON.parse(m[0]));
    } catch {
      return null;
    }
  }
}

function normalizeScore(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const score = Number(obj.score);
  const reason = typeof obj.reason === 'string' ? obj.reason : '';
  if (!Number.isFinite(score)) return null;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reason: reason || '（无理由）',
  };
}
