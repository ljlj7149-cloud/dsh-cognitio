---
name: memory-consolidation
description: 记忆库巩固：调度提醒或收尾时，用 consolidate_candidates 找疑似重复对，按 keep/merge/archive/skip 决策并执行；仅同类型可合并，全程版本链可回滚。
---

# Memory Consolidation · 记忆巩固

> 移植 mneme autoDream 的决策纪律（keep/merge/archive/conflict + fail-safe 校验），
> 但裁决者仍是模型——工具只给出候选对（consolidate_candidates 已过滤同类型+稀有词重叠）。

## 触发

- 调度提醒（每 24h）到期；
- 会话收尾自省（cognitio A 步）发现 stats 里 chains 增长明显；
- 用户说"整理记忆/巩固记忆"。

## 流程

1. `mcp__memory__consolidate_candidates` 取候选对（默认按 overlap 降序前 10）。
2. 逐对决策（四选一）：
   - **merge**：两条确实重复 → 保内容更全/更新的一条，另一条内容并入后 `forget` 掉弱侧；
     合并版本在 content 末尾注明 `merged from <key>（日期）`；
   - **archive**：旧信息已过时 → 弱侧 `remember` 更新 status=superseded 并在 content 注明指向 keeper，
     或直接 `forget`；
   - **keep both**：表面重叠但各有独立价值（如一条是规则、一条是背景事实，虽然工具已限同类型）→ 不动；
   - **skip**：拿不准 → **不动**。宁可留冗余，不可错删。
3. 每对处理完用 `get` 复核一次结果。

## 硬约束（mneme fail-safe 移植）

- 仅同 type 可合并（工具已保证）；
- 每对至少保留一条——禁止把两条都 forget；
- 不编造内容：merge 只做原文拼接+标注，不"归纳改写"；
- 不碰 `case/*` 与 `system/checkpoint/*`（工具已排除）；
- 每次 merge/forget 后跑一遍 `search` 验证关键触发词仍能命中保留条目。

## 红线

- 拿不准 = skip，不是 merge；
- 巩固不是压缩：内容总量下降不是目标，消除"真重复/真过时"才是；
- 版本链与墓碑保证可回滚——但不等于可以鲁莽；误合并会污染 recall 质量。
