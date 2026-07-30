---
name: ingest-interview-qa
description: >-
  Extracts interview Q&A from user text, code-searches the local knowledge base
  for top similar detail nodes, then appends QA or creates details via scripts.
  Also refines coarse categories into finer category nodes and reclassifies
  details. Use when ingesting interview notes, technical Q&A, 知识点入库, 抽取问答,
  matching knowledge points, adding interviewQA, or 细化类别颗粒度. Never edit
  knowledge-base JSON by hand—only via kb-search / kb-apply / kb-rebuild scripts.
---

# 知识点检索入库

将用户文本整理为面试问答，用**代码检索**匹配已有详细知识点，再经**脚本**写入知识点库 JSON。  
图谱 UI 与面试模拟**共用**各详细节点下的 `interviewQA`；面试抽题范围由图谱「面试池」（手动加入）决定，本 Skill **不**改面试池。

## 硬性约束（必须遵守）

1. **禁止**用编辑器 / `Write` / `StrReplace` / 补丁直接改：
   - `data/knowledge-base.json`
   - `data/sample-kb.json`
   - `data/interview-qa-kb.json`
   - 或其他知识点库 JSON
2. **大模型只负责文本与判定**：抽取问答、提炼知识点、补全答案、推测检索词、读脚本 stdout、判定归属、维护聚类表、向用户说明。
3. **一切库变更只能通过脚本**（工作目录：项目根 `GameDesign/`）：

| 脚本 | 用途 |
|------|------|
| `kb-search.mjs` | 检索 TopN 相似详细知识点 |
| `kb-apply.mjs` | 写入：QA / 节点 / 关联 / 列表（含 `update-qa`） |
| `kb-fix-qa-stem-code.mjs` | 题干缺代码时从答案迁入代码块 |
| `kb-rebuild-from-md.mjs` | 面经 MD + 聚类表批量重建 |
| `kb-clusters.mjs` | 聚类定义（供 rebuild 读取，非 CLI） |
| `kb-import-md.mjs` | **已废弃**（旧「一题一节点」） |

4. 长文本先写入 `tmp/*.txt`（可用 Write），再用 `--question-file` / `--answer-file` / `--content-file` / `--query-file` 传入；路径相对项目根即可。
5. 脚本失败：根据 stderr 改参数后重跑，仍不得手改 JSON。

## 与产品的关系

| 概念 | 说明 |
|------|------|
| `interviewQA` | 权威问答；图谱详情编辑与面试模拟评分共用同一套 |
| 面试池 | 图谱多选后点「加入面试模拟」才进入抽题范围；池空时模拟页暂用全部有 QA 的知识点 |
| localStorage | 图谱运行时数据在浏览器；脚本写的是磁盘 `data/*.json`，完成后提醒用户**导入**同步 |
| `.gitignore` | `data/`、`Notes/` 等为本地资料，可能不在 Git 中，但不影响脚本读写 |

## 数据模型（关键：知识点 ≠ 整道面试题）

详细节点（`details[]`）是**知识点**，不是整题：

| 字段 | 含义 | 正确 | 错误 |
|------|------|------|------|
| `title` | 短知识点名 | `虚表与动态多态` | 整句面试题 |
| `content` | 原理综述 2～5 句 | 「动态多态靠虚函数……」 | 整段答案粘贴 |
| `interviewQA` | 挂在该点下的问答 | 多条 Q/A；**题干含答题所需代码** | 答案只写进 content；题干写「如下代码」却把代码只放在 answer |
| `relatedIds` | 关联其他详细 id | 同主题/跨主题近邻 | 长期空且不维护 |
| `tags` | 检索标签 | `多态,虚表` | 只写「面试」 |

类别（`categories[]`）为分组；跨类边来自跨类 `relatedIds`。

**类别颗粒度：** 类别本身也是「类别级知识点」，应可单独学习与着色。若某类主题过宽（下属细节跨多个可独立成块的子主题），应**拆成多个细分类别**，再把详细知识点迁入对应新类——勿长期塞在一个大类里。

**面试题题干：** 凡「说出如下代码运行结果」类题目，`question` 必须自带完整代码围栏（如 ` ```cpp `）；`answer` 只留输出与解析。发现题干缺代码时用脚本修复，禁止靠前端从答案抽代码。

**入库时必须：**

1. 先判断问答属于哪个知识点（已有则 `append-qa`）。
2. 新建时：`title`/`content` = 知识点；Q/A 只进 `interviewQA`。
3. 维护 `relatedIds`（用 `add-related` / `create-detail --related-ids`；默认对称补全）。
4. 发现类别过粗时：先细化类别，再重分详细知识点（见下节），再继续挂 QA。

## 权威库路径

- 主库（日常入库默认）：`data/knowledge-base.json`（`.gitignore`，本地生成）
- 面经批量库：`data/interview-qa-kb.json`（`kb-rebuild-from-md.mjs` 生成）
- 可提交样例：`datasample/sample-kb.json`（主库不存在时由 `kb-io` 复制初始化）
- 仍勿手改上述 JSON；一律走脚本

## 脚本用法

### 检索 Top10（禁止凭感觉编造）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query "虚表 动态多态" --top 10
node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query-file tmp/query.txt
node .cursor/skills/ingest-interview-qa/scripts/kb-search.mjs --query "..." --kb data/interview-qa-kb.json
```

stdout JSON：`results[]` 含 `id/title/score/tags/qaCount/relatedCount/snippet`。

### 列表（选类别 / 核对 id）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode list --kind categories
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode list --kind details
```

### 追加 QA

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode append-qa --detail-id det_xxx --question-file tmp/q.txt --answer-file tmp/a.txt
```

### 更新已有 QA（改题干/答案）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode update-qa \
  --detail-id det_xxx --qa-id qa_xxx \
  --question-file tmp/q.txt --answer-file tmp/a.txt
```

### 批量修复：题干缺代码（从答案迁入）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-fix-qa-stem-code.mjs --kb data/interview-qa-kb.json
# 可加 --dry-run 只预览
```

### 新建详细知识点

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode create-detail \
  --category-id cat_xxx --title "虚表与动态多态" \
  --content-file tmp/c.txt --tags "多态,虚表" \
  --related-ids det_a,det_b \
  --question-file tmp/q.txt --answer-file tmp/a.txt
```

### 新建类别

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode create-category --title "类别名" --content "说明"
```

### 细化类别颗粒度（粗类 → 多个细分类 → 重分详细点）

当已有类别主题过粗（例如「C++基础」同时塞虚函数、内存、语法糖等可独立成块的主题）时：

1. **列清单**：`list --kind categories` / `list --kind details`，标出过粗类别及其下属 `detail` id。
2. **建细分类别**：对每个子主题 `create-category`（title/content 写成可独立学习的类别知识点，非空壳分组名）。
3. **重分详细知识点**：用 `update-detail --category-id` 把各 detail 迁到对应细分类（**不改** `interviewQA` / `relatedIds`，除非顺带需要）。
4. **原粗类处理**（择一，向用户说明后执行）：
   - 下属已迁空：可保留为空壳供对照，或后续由用户决定是否废弃（当前脚本无 delete-category，勿手删 JSON）。
   - 仍有合理共性细节：可收窄原类 title/content，只留真正属于该粗主题的点。
5. **大批量面经库**：优先改 `kb-clusters.mjs` 的类别归属后跑 `kb-rebuild-from-md.mjs`，避免逐条 apply。

迁移示例：

```bash
# 新建细分类别
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode create-category \
  --title "虚函数与动态多态" --content "虚表、override、动态绑定相关。"

# 将详细知识点迁入新类（可改 title/tags/content；QA 不变）
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode update-detail \
  --detail-id det_virtual --category-id cat_新类id
```

判定启发式（类别过粗的信号）：

| 信号 | 建议 |
|------|------|
| 一类下细节主题明显分裂（语法 / 内存 / 并发混装） | 按子主题拆多个类别 |
| 新 QA 很难决定挂哪一类，总落在「大杂烩」 | 先拆类再入库 |
| 图谱上一类球过大、下属点语义跨度大 | 拆类并 `update-detail` 重分 |

### 关联边

```bash
# 追加关联（默认双向对称）
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode add-related --detail-id det_x --related-ids det_a,det_b

# 覆盖关联列表
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode set-related --detail-id det_x --related-ids det_a

# 仅写一侧：加 --no-symmetric
```

### 更新知识点元数据（不改 QA）

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode update-detail --detail-id det_x --title "新标题" --tags "a,b" --content-file tmp/c.txt

# 改归属类别（细化颗粒度后重分类）
node .cursor/skills/ingest-interview-qa/scripts/kb-apply.mjs --mode update-detail --detail-id det_x --category-id cat_yyy
```

### 面经 MD 批量重建

1. 维护 `scripts/kb-clusters.mjs`：每个 cluster 含 `id/theme/title/content/qaIds/related/tags`
2. 源文默认：`Notes/面试问答-待确认.md`
3. 运行：

```bash
node .cursor/skills/ingest-interview-qa/scripts/kb-rebuild-from-md.mjs --kb data/interview-qa-kb.json
# 可选：--md path/to/other.md
```

禁止再用「一题一个 detail、title=整题」的旧导入（`kb-import-md.mjs` 已拒绝执行）。

## 工作流（按序）

```
Task Progress:
- [ ] 0. （可选）类别过粗 → 拆细分类别 → update-detail 重分详细点
- [ ] 1. 抽取问答（仅文本）
- [ ] 2. 提炼所属知识点 title + content（若需新建）
- [ ] 3. 推测检索词
- [ ] 4. kb-search.mjs → Top10
- [ ] 5. 判定归属 + relatedIds 建议
- [ ] 6. 确认后仅用 kb-apply / kb-rebuild 写入
- [ ] 7. 回报（附 stdout）；提醒导入 JSON；可选说明面试池需手动加入
```

### 判定表

| 情况 | 动作 |
|------|------|
| 明确属于已有详细知识点 | `append-qa`；缺边则 `add-related` |
| Top10 均不相关 / Top1 偏低且不符 | `create-detail`（+ QA + related） |
| 无合适类别 | 先 `create-category` 再 `create-detail` |
| 已有类别颗粒度太粗 | 先 `create-category` 建多个细分类，再 `update-detail --category-id` 重分已有详细点；然后再挂新 QA |
| 大批面经 MD | 改 `kb-clusters.mjs`（含更细类别划分）后 `kb-rebuild-from-md.mjs` |

### 确认策略

- 默认：先展示抽取、知识点提炼、Top10、判定与**拟执行命令**，用户确认后再跑
- 用户说「直接入库 / 自动应用」：立即跑脚本
- **禁止**确认后改为手改 JSON

## 输出模板

```markdown
## 抽取
1. Q: ...
   A: ...
   知识点: title / content 摘要

## 检索与判定
### 题 1
- 检索词: ...
- Top1: `det_id` title (score, qaCount)
- 判定: append-qa | create-detail
- 关联: det_a, det_b
- 理由: ...
- 命令: node .../kb-apply.mjs ...

## 写入结果
- （粘贴 stdout）
- 请在图谱页导入对应 data/*.json 同步
- 面试模拟：导入后，在图谱将知识点「加入面试模拟」才会进入抽题池（池空则暂用全部）
```
