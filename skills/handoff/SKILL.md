---
name: handoff
description: Use at the end of a session or before pausing — compact the session state into the memory checkpoint (and optionally a handoff document) for cross-session continuity. Model-invoked.
---

# Handoff · 会话交接

> 自 .reasonix handoff 迁移，机制化：写 `mcp__memory__checkpoint` 为主，文件版为辅。

## 每次会话末尾（或用户说"暂停/收工"）执行

1. **写停靠点**：`mcp__memory__checkpoint`，content 包含：
   - 会话摘要（本次做了什么）
   - 未完成任务 + 下一步动作
   - 关键决策（不可轻易推翻的裁定）
   - 关联文件路径
2. **信箱留话**（如有需要别人/未来接手的事）：`mcp__memory__post`。
3. **案例归档**：本次被纠正过 → `case_log` 逐条归档（归类在修复之前）。

## 规则

- 不写 API Key、密码等敏感信息（`rules/meta/no-secrets-in-memory`）；
- content 控制在一屏内（≤30 行等价信息量），引用路径而非复制内容。
