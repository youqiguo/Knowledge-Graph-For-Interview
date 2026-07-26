---
name: ingest-interview-qa
description: >-
  Extracts interview questions/answers from user text, searches the local knowledge
  base for the top 10 similar detail nodes via code, then appends QA to a matched
  node or creates a new detail. Use when ingesting interview notes, technical Q&A,
  知识点入库, 抽取问答, matching knowledge points, or adding interviewQA to the
  GameDesign knowledge graph. Never edit knowledge-base.json by hand—only via scripts.
---

# 知识点检索入库

将用户提供的文本整理为面试问答，用**代码检索**匹配已有详细知识点，再经**脚本**写入知识点库 JSON。

## 硬性约束（必须遵守）

1. **禁止**用编辑器 / `Write` / `StrReplace` / 补丁直接改 `data/knowledge-base.json`、`data/sample-kb.json`、`data/interview-qa-kb.json` 或任何知识点库 JSON。
2. **大模型只负责文本与判定**：抽取问答、提炼知识点标题/内容、补全答案、推测检索词、阅读脚本输出、判定归属、维护聚类表、向用户说明。
3. **一切库变更只能通过脚本**：
   - 检索：`kb-search.mjs`
   - 写入：`kb-apply.mjs`（`append-qa` / `create-detail` / `create-category`）
   - 面经批量重建：`kb-rebuild-from-md.mjs`（配合 `kb-clusters.mjs`）
4. 长文本先写入临时 `.txt`（可用 Write），再用 `--question-file` / `--answer-file` / `--content-file` / `--query-file` 传给脚本；**不要**为了图省事去手改 JSON。
5. 若脚本失败：根据 stderr 修参数后重跑脚本，仍不得直接改 JSON。

## 数据模型（关键：知识点 ≠ 整道面试题）

详细节点（`details[]`）表示**知识点**，不是把整题当节点：

| 字段 | 含义 | 正确示例 | 错误示例 |
|------|------|----------|----------|
| `title` | 短知识点名 | `虚表与动态多态` | `C++ 如何实现动态多态？……` |
| `content` | 知识点综述（原理/要点，2～5 句） | 「动态多态靠虚函数……」 | 直接粘贴整段面试答案 |
| `interviewQA` | 挂在该知识点下的问答 | Q/A 若干条 | 把答案塞进 `content`、QA 留空 |
| `relatedIds` | 关联其他**详细知识点** id | `["det_vtable","det_smart_ptr"]` | 空数组且不做关联 |
| `tags` | 检索/筛选标签 | `["多态","虚表"]` | 只写「面试」 |

类别节点（`categories[]`）是主题分组；类别视图边来自**跨类** `relatedIds`（见 `computeCategoryLinks`）。  
类内详细视图边来自可见节点间的 `relatedIds`。

**图谱展示（类 Obsidian Graph，渲染时计算，不写进 JSON）：**

- 大小：关联越多 → 球越大（`categoryNodeSize` / `detailNodeSize`）
- 位置：统一力导向（斥力 + 边弹簧 + 弱向心）+ **硬碰撞最小间距**（`layoutForce`，默认 minGap=112）；类别详情/聚焦视图可带分区种子与锚点
- 颜色：色环均匀铺开，并对**有关联边的相邻类别**强制拉开色相（`rebuildCategoryColors`，输出 hex 供 Cytoscape）
- Obsidian 本体图谱闭源；实现参考其公开行为与 d3-force / 开源类 Obsidian 图谱的力导向+碰撞思路

**入库时必须：**

1. 先判断问答属于哪个知识点（已有则 `append-qa`）。
2. 新建详细知识点时：`title`/`content` 写知识点，`question`/`answer` 只进 `interviewQA`。
3. 同步维护 `relatedIds`（同主题近邻 + 跨主题相关）；语义无向，可只写一侧，批量脚本会对称补全。

## 权威库路径

- 主库：`data/knowledge-base.json`
- 面经库：`data/interview-qa-kb.json`（由 `kb-rebuild-from-md.mjs` 生成）
- 若不存在：由 `kb-io` / 检索脚本从 `data/sample-kb.json` 复制初始化（仍勿手改）
- 图谱 UI 使用浏览器 localStorage；脚本写入完成后提醒用户在图谱页「导入」该 JSON 同步

## 脚本

工作目录：项目根 `GameDesign/`。

**检索 Top10**（禁止凭感觉编造 Top10）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query "关键词1 关键词2" --top 10
node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query-file path/to/query.txt
```

**追加 QA**（挂到已有知识点，不改 title/content 为整题）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode append-qa --detail-id det_xxx --question "..." --answer "..."
# 或
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode append-qa --detail-id det_xxx --question-file tmp/q.txt --answer-file tmp/a.txt
```

**新建详细知识点**（title/content 必须是知识点；QA 可选同时写入）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode create-detail --category-id cat_xxx --title "虚表与动态多态" --content-file tmp/c.txt --tags "多态,虚表" --question-file tmp/q.txt --answer-file tmp/a.txt
```

**新建类别**

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode create-category --title "类别名" --content "说明"
```

**面经 MD 批量重建**（聚类表 → 知识点库）

1. 维护 `scripts/kb-clusters.mjs`：每个 cluster 含 `title`/`content`/`qaIds`/`related`/`tags`/`theme`
2. 源文：`Notes/面试问答-待确认.md`
3. 运行：

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-rebuild-from-md.mjs --kb data/interview-qa-kb.json
```

禁止再用「一题一个 detail、title=整题、content=整答」的旧导入方式。

## 工作流（按序执行）

```
Task Progress:
- [ ] 1. 抽取问答（仅文本，不碰 JSON）
- [ ] 2. 提炼所属知识点标题 + 综述 content（若需新建）
- [ ] 3. 推测检索词
- [ ] 4. 运行 kb-search.mjs 得 Top10
- [ ] 5. 判定归属，并给出 relatedIds 建议
- [ ] 6. 确认后仅用 kb-apply / kb-rebuild 写入
- [ ] 7. 回报用户（附脚本 stdout）
```

### 1. 抽取问答

列出 `{ question, answer }[]`。缺答案则按工业界深度补全（原理、常见坑、复杂度/场景、对比）。

### 2. 提炼知识点

对每题给出：

- `kpTitle`：短名（名词短语，不含「？」「请说出」）
- `kpContent`：2～5 句综述（不是把 A 原文塞进 content）
- 若多题同属一点：合并到同一 detail，多条 `interviewQA`

### 3. 推测检索词

每题 3–8 个检索词（中英均可）。

### 4. 代码检索

拼接 `--query` 或 `--query-file`，运行 `kb-search.mjs`，把 `results` 读入上下文。

### 5. 判定归属

| 情况 | 动作（仅通过脚本） |
|------|---------------------|
| 明确属于某一已有详细知识点 | `append-qa`，必要时补 `relatedIds`（若 apply 无此模式，在聚类表/后续脚本中维护） |
| Top10 均不相关，或 Top1 score 偏低且语义不符 | `create-detail`（知识点 title/content + 本条 QA） |
| 连类别都不合适 | 先 `create-category`，再 `create-detail` |
| 大批面经 MD | 更新 `kb-clusters.mjs` 后 `kb-rebuild-from-md.mjs` |

### 6. 写入

- 默认：先展示抽取、知识点提炼、Top10、判定与**拟执行的 node 命令**，用户确认后再跑脚本
- 用户说「直接入库 / 自动应用」：跳过确认，立刻跑脚本
- **禁止**确认后改为手改 JSON

### 7. 回报

展示抽取 QA、知识点标题、Top10 摘要、判定理由、关联边、脚本 stdout。  
提醒：图谱页 → 导入对应 JSON 同步。

## 输出模板

```markdown
## 抽取
1. Q: ...
   A: ...
   知识点: title / content 摘要

## 检索与判定
### 题 1
- 检索词: ...
- Top1: `det_id` title (score)
- 判定: append-qa | create-detail
- 关联: det_a, det_b
- 理由: ...
- 命令: node .../kb-apply.mjs ...

## 写入结果（脚本文本）
- （粘贴 stdout）
- 请导入 data/....json 到图谱页
```
