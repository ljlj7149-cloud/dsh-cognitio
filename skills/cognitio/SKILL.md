---
name: cognitio
description: Use for every task in this workspace — declare intent before acting, self-reflect after finishing, extract transferable patterns from every correction, and track capability gradients. Also use whenever the user corrects you, when deciding between options, or when writing or updating memory rules.
---

# Cognitio · 张力网络（转世版）

> 继承自用户自研的 cognitio 系统（.reasonix），机制已按 DSH 重造：
> 版本链取代"三步安全法"、统一 FTS 检索取代记忆/RAG 分裂、子代理可自动承担第三层审查。

## 机制化现状（2026-08-16，P0-P4 已落地）

本技能是**行为纪律层**；下面的机械层已接管大部分哨兵点（harness-now preset 挂载，重启生效）：

| 机械件 | 接管什么 |
|---|---|
| sentinel-plugin（pre-step） | 每回合自动 recall 注入（意图分级：闲聊零注入/阅读仅 CHECK+FYI/动作全量 MUST_FOLLOW+回执行）；开场哨兵（停靠点+信箱）；纠错信号哨兵（fail-fast+先归类再修复）；知识域强制查库义务（疗愈/心理/哲学及哲学论题术语——中文房间/能指所指/认识论等，命中即先 vault_search） |
| error-capture-plugin（agent/error） | 出错自动归档 draft 案例（过滤环境性错误，每会话≤3 条） |
| turn-archive-plugin（turn-stopping） | 回合末归档哨兵（每 5 回合 steer 一次，≤2 次） |
| action-guard-plugin（tools/pre-execute） | 动作前拦截接缝（当前只观测；deny/ask 规则待用户逐条批） |
| memory 井 v4.5 | injection_log 审计表/证据加权/Half-life 衰减+再巩固/渐进披露 summary/AGM 三操作/负结果声明/冷却去重 |
| vault 井 | 文献只读 FTS（vault_search/vault_get/vault_reindex），编译式 wiki 在 D:\deepseek\wiki |
| propositions | 范畴/命题类型（默认 candidate）；stats 输出范畴治理面板（案例计数→状态转换建议、ACTIVE≤6 警告、压缩提示） |

**你（模型）的职责边界**：机械件已覆盖的哨兵点**不要重复执行**（开场块已注入则不再 resume/mailbox）；
机械件没覆盖的（第三层子代理批判、深度抽象、写记忆前自检）仍按本技能自觉执行。

## 元规则（不可协商）

1. 一切记忆/规则都是 PROVISIONAL —— 随时可被新实践推翻；**仲裁者永远是用户**。
2. 稳定规则必须带反例条件（`counterexamples` 非空）。
3. 写入新规则前必须 `search` 已有记忆，发现重叠（`possible_duplicates` 或检索命中）先合并/降级/并存，必要时问用户。
4. 敏感信息（API Key/密码/token）**禁止**写入记忆或文档；只存在于 .env 与密码管理器。
5. 记忆与现实矛盾时，先用工具确认现实，不急于下结论。

## 四层进化（每次任务强制走）

### C. 意图先声明（动手前）
回复：**"我理解你想做：①… ②… ③…，对吗？"** 用户确认或纠正后再动手。
代码修改场景：先列 2-3 条可能错误的假设，逐条用工具验证。

### A. 任务后自省（收工前）
自问：**"我刚才漏了什么？以后同类任务怎么避免？"**
- 有教训 → `case_log`（symptom/resolution/related + **category=propositions/<cat-key>**，能归类必须归类——先归类再修复的落点，stats 按 category 计数驱动范畴状态机）；
- 有可迁移规则 → `remember`（type=rule，带 counterexamples 与触发词 tags）；
- 任务收尾 → `checkpoint`（scope=当前项目或 global）。

### B. 纠正 → 提取模式 → 跨域迁移（每次被纠正时）
被纠正时不只修当下：
1. **先归类**（修之前先归档 case，`category` 指向范畴键 `propositions/cat1~cat5` 或 `propositions/candidate-*`），再修复——归类在修复之前，不先归类=修完必忘；
2. 提取底层可迁移模式，按"具体场景 + 抽象模式 + 适用域列表"存为 type=pattern；
3. 扫描所有写入点：是否还有别处需要同步更新？

### D. 能力梯度追踪（每 10 次纠正后）
调用 `stats`：按 type/status/scope 与案例趋势看分布。
- 「漏了深挖」多 → 强化 C 步；
- 「没做验证」多 → 强化验证清单；
- 「分析错误」多 → 强化探索深度。
针对性加固最薄弱环节，并更新对应规则。

## 三层审查

1. **第一层（自动）**：`remember` 写入自带相似性检测（possible_duplicates），发现冲突必须处理。
2. **第二层（我主动）**：任务开始 `search` 匹配触发词（tags），命中规则必须执行其行动指令。v4.3 检索支持自然短语与双向匹配（详见 .design/trigger-audit.md），查询直接用任务原词即可，无需拼触发词。
3. **第三层（深度抽象时）**：命题摘要交给**独立上下文的子代理**批判 → 整合两个视角 → 写入 `counterexamples`/`sources` → **用户最终裁定**。频率上限：每会话 ≤3 次。

## 注入策略（哨兵点 · v4.3）

> 原则：**注入 = 动作前置检查，不是背景噪音**。闲聊/阅读/分析轮次零注入。

| 哨兵点 | 何时 | 动作 |
|---|---|---|
| 开场 | 每次会话第一条消息后（session-init 第 3 步） | `recall(任务词)`，MUST_FOLLOW 清单原样输出并执行 |
| 改文件前 | 任何 write/edit/代码修改之前 | `recall("修改 代码")`（pre-code-assumption 规则与之并列） |
| 提交前 | git commit / push 之前 | `recall("git 提交")`（commit 自解释规则） |
| 部署前 | 任何 deploy/上线/SSH 操作之前 | `recall("部署 维护")` |
| 写记忆前 | 任何 remember/case_log 之前 | `recall("新规则 密钥")`（no-secrets 自检） |
| 纠错信号 | 用户说"不对/还是不行"、报错出现 | `recall("不对 两次")`（fail-fast-two-strikes） |

- MUST_FOLLOW（≤3 条）：照单全做；CHECK：读完自行判断；FYI：仅背景。
- 预算：每次注入 ≤1200 字符（recall 已内置硬上限）。
- 零命中也要如实说"哨兵: 0 条"——不查或查了不说，比查了报 0 更糟。

## 记忆工具使用约定

- **键体系**：`rules/<域>/<名>`（行动指令）、`patterns/<名>`（抽象模式）、`case/<日期>/<哈希>`（案例，由 case_log 自动）、`system/checkpoint/<scope>`（停靠点）、其它分层键为 fact。
- **type 语义**：fact 声明性知识；rule 条件→动作；pattern 场景+模式+适用域；case 症状+日期+解法。
- **触发词**：存 `triggers` 字段（管道分隔，如 `新技术|选框架`），供第二层匹配；tags 仅作分类标签（命中 +1）。
- **会话开始**：`resume` 读停靠点；**会话结束**：`checkpoint` 写停靠点（auto-save-session 的机制化）。
- **验证**：任何"改后必验证"动作失败 → 修复重验，最多 3 轮，仍失败停手问用户；错误模糊时第一轮失败就问。
- **失败两次即停**：用户连续两次否定同一方向 → 换策略，禁止第三次原路重试。

## 与旧版 cognitio 的差异（转世说明）

| 旧（reasonix） | 新（DSH） |
|---|---|
| remember 同名覆盖 → 三步安全法 | 版本链，原文永不丢，直接 remember 即可 |
| 记忆搜索与 RAG 分离 | 统一 FTS5 混合检索（search） |
| 第三层审查手动发 OpenCode | 子代理自动批判 + 用户仲裁 |
| ≤6 范畴/200 行压缩靠自觉 | `stats` 主动建议 |
| v5 编译器注入 risk_notes | 第二层 search 匹配（v4.3 将自动注入） |
