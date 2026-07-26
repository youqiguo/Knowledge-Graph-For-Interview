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
4. **面试模拟**：与知识库共用问答 →（可选遗忘曲线）抽 N 题 → 逐题作答 → `/api/score` 评分  

## 环境变量

见 `.env.example`（默认按 [DeepSeek API](https://api-docs.deepseek.com/zh-cn/)）：

- `OPENAI_API_KEY`：密钥  
- `OPENAI_BASE_URL`：默认 `https://api.deepseek.com`  
- `OPENAI_MODEL`：默认 `deepseek-v4-pro`  
- `OPENAI_THINKING`：`enabled` / `disabled`（对应请求体 `thinking.type`）  
- `OPENAI_REASONING_EFFORT`：`low` / `medium` / `high`  
- `PORT`：评分代理端口

## Agent Skill：知识点检索入库

项目内 Skill：`.cursor/skills/ingest-interview-qa/`。

- **权威库文件**（仅允许脚本读写）：[`data/knowledge-base.json`](data/knowledge-base.json)  
  不存在时会从 [`data/sample-kb.json`](data/sample-kb.json) 自动复制。Agent / 大模型只提供文本与参数，**不得直接编辑**该 JSON，一律通过 `kb-search.mjs` / `kb-apply.mjs`。
- **图谱页**仍使用浏览器 `localStorage`。脚本写入后，请在图谱页用「导入/导出 → 导入」加载该文件以同步界面。

常用命令（在项目根目录）：

```bash
# 检索最相似的 10 个详细知识点
node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query "虚函数 多态" --top 10

# 追加面试问答
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode append-qa --detail-id det_virtual --question "..." --answer "..."

# 新建详细知识点
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode create-detail --category-id cat_cpp --title "..." --content "..." --tags "a,b" --question "..." --answer "..."
```

把面试/技术文本交给 Agent 并提到「知识点入库」时，应自动按该 Skill 流程：抽取问答 → 代码检索 Top10 → 判定归属 → 写入 JSON。
