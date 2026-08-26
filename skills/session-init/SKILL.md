---
name: session-init
description: Use at the start of every new session (after the first user message) — restore the session checkpoint, read unread mailbox messages, and surface matching rules for the task at hand. Report only; never block.
---

# Session Init · 新会话启动仪式

> 自 .reasonix session-init 改造：RAG/KG 路径检查已退役（vault 井统一检索取代）；
> 检查内容 DSH 化。异常不阻塞会话，仅报告。
> 2026-08-16 机制化更新：开场哨兵（sentinel-plugin）已自动注入"停靠点+未读信箱"块——
> 本技能做的是**补充与核对**，不是唯一通道。

## 0. 先看开场哨兵（已机制化）

本回合上下文中若已出现「开场哨兵」块（停靠点 + 未读信箱摘要）：**不要重复读取**，
直接跳到第 3 步。未出现（standard preset 或插件未挂）→ 按第 1-2 步手动补做。

## 1. 恢复上次停靠点

调用 `mcp__memory__resume`（scope 依次尝试：当前项目名 → `global`）。
如有内容：一句话复述"上次干到哪、接下来干什么"。

## 2. 查收信箱 + 本机会话总线

- 调用 `mcp__memory__pulse`（session=本会话 id，note=当前任务一句话），登记在线；
- `mcp__memory__peers`（默认 30 分钟窗口）列出活跃会话——发现相关者，`post` 定向投递到其 session id；
- 调用 `mcp__memory__mailbox`（`to: global` 与 `to: <当前项目名>`，`unread_only: true`）。
未读信件 → 逐条列出标题；处理后 `ack`。

## 3. 匹配规则（机械步骤，不可跳过）

从第一条用户消息提取 2-4 个关键任务词（任务对象 + 动作 + 领域），调用
`mcp__memory__recall(query=任务词)`（**不要传 scope**——缺省=全库；scope 过滤是显式收窄手段）：
- MUST_FOLLOW 清单必须**原样输出**在本报告的"规则"行，并承诺执行；
- 零命中如实报告"规则: 0 条"——宁查报 0，好过跳过；
- 专业领域问题（疗愈/心理/哲学）→ 另查 `mcp__vault__vault_search`（知识库强制检索义务，见 cognitio 技能）；
- 需要探索性检索时再用 `mcp__memory__search`（type 过滤 rule/pattern/pattern+proposition）；
- 完整哨兵点策略见 cognitio 技能的"注入策略"节。

## 4. 关键工件可达性（快检，报告不阻塞）

- 工作区 `D:\deepseek`、`.mcp-servers`、`.memory` —— 用文件工具确认；
- 任一不可达 → 报告「⚠️ 路径不可达: XXX」，不做推断（cognitio：记忆与现实矛盾时先确认现实）。

## 输出格式

```
启动校验 · YYYY-MM-DD
停靠点: （复述或"无"）
信箱: N 封未读（标题列表）
规则: 命中 K 条（关键词）
工件: ✅/⚠️
```
