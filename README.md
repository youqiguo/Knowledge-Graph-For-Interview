# 知识点图谱 + 面试模拟评分

Vite 双页静态前端 + Express 评分代理（OpenAI 兼容 API）。

## 运行

```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
# 编辑 .env 填写 OPENAI_API_KEY（可选；无密钥时图谱仍可用，评分返回 503）
npm run dev
```

- 首页（自动跳转图谱）：http://localhost:5173/  
- 图谱：http://localhost:5173/knowledge.html  
- 面试模拟：http://localhost:5173/quiz.html  
- 评分代理：http://localhost:3001/api/score（Vite 已把 `/api` 代理到此）

生产构建：

```bash
npm run build
# Windows PowerShell:
$env:NODE_ENV="production"; node server/index.js
```

## 功能概要

1. **知识点库**：类别 / 详细知识点 CRUD，localStorage 持久化，完整库 JSON 导入导出  
2. **图谱**：Cytoscape 类别视图、类别详情（外部分组扇区）、聚焦邻居、扩展一层、从图移除、weak/标签筛选  
3. **面试池**：图谱多选后手动「加入面试模拟」；详情面板显示「已添加」。面试模拟只从池内 `interviewQA` 抽题；池为空时暂用全部。  
4. **面试复习**：手动点「开始复习」抽题；卡片优先度（优先重练 → 新题 → 低分，与日历无关；新题首答 <60 在下下次开始时置顶）→ `/api/score` 评分  

## 环境变量

见 `.env.example`（默认按 [DeepSeek API](https://api-docs.deepseek.com/zh-cn/)）：

- `OPENAI_API_KEY`：密钥  
- `OPENAI_BASE_URL`：默认 `https://api.deepseek.com`  
- `OPENAI_MODEL`：默认 `deepseek-v4-pro`  
- `OPENAI_THINKING`：`enabled` / `disabled`（对应请求体 `thinking.type`）  
- `OPENAI_REASONING_EFFORT`：`low` / `medium` / `high`  
- `PORT`：评分代理端口

## Agent Skill：知识点检索入库

项目内 Skill：`.cursor/skills/ingest-interview-qa/`（详见其中 `SKILL.md`）。

- **权威库**（仅允许脚本读写）：`data/knowledge-base.json`（可从 `datasample/sample-kb.json` 初始化）、面经库 `data/interview-qa-kb.json`
- **禁止手改 JSON**；用 `kb-search.mjs` / `kb-apply.mjs` / `kb-rebuild-from-md.mjs`
- `kb-apply` 支持：`append-qa` · `create-detail` · `create-category` · `add-related` · `set-related` · `update-detail` · `list`
- 图谱用 `localStorage`：脚本写入后需「导入」同步；面试模拟与库共用 `interviewQA`，抽题范围靠图谱「面试池」手动加入

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query "虚函数 多态" --top 10
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode list --kind categories
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode append-qa --detail-id det_xxx --question-file tmp/q.txt --answer-file tmp/a.txt
```
