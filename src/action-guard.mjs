// action-guard-plugin.mjs —— 动作前拦截（P2-b 第 1 期：接缝探针，2026-08-16）。
//
// API 发现（一手核实）：tools/pre-execute 是 Scoped<ToolRuntime> 瀑布事件，
// PreToolDecision = allow | deny(reason) | ask(reason)；dsh-tool-jobs 已有
// ctx.on("tools/pre-execute", (exec, next) => …) 的宿主级先例。
//
// 本期策略（防御式/零风险）：
//   - 只观测不拦截：命中关注列表的工具调用 → 上报 injection_log（hook=pre-execute-observed）
//   - 事件不可达时插件完全惰性（try/catch 包裹注册，armed 标记）
//   - 验证事件可达后（日志出现 observed 行），下一期才逐条上 deny/ask 规则（用户逐条批准）
//
// 治本 A·工具时点机械召回（2026-08-27，目标③原文落点）：
//   工具调用的"那一刻"（而非回合开始）执行 recall(工具动作词)——捕获"回合开始没意识到
//   要写文件、现在真要写了"的漏场景（flash 弱人格常在此断链）；命中记
//   hook=pre-execute-recall-hit（含 used_chars），与 sentinel 回合级副查询互补，
//   并为 N7 提供工具时刻的机械预期锚。
//   防御：recall 失败不影响 next()；只对关注工具执行（不扩大噪声面）。
//
// 风险注记：ask 决策会走审批栈；本部署 approval=never 时 ask 大概率 fail-closed——
// 上线 deny/ask 规则前必须先与用户确认审批策略。
// 回滚 = 删除 preset 中本行并重启。
import { getClient } from './sentinel.mjs';

// 关注列表：写文件类与命令类工具（首期只观测）
const OBSERVE_TOOLS = new Set(['write', 'edit', 'pwsh', 'todo_write', 'job_kill']);

// 工具名 → 召回动作词（确定性映射，零 LLM；命中本机记忆库用）
export const TOOL_ACTION_WORDS = {
  write: '写文件 创建 修改',
  edit: '改文件 修改 编辑',
  pwsh: '命令 执行 脚本',
  bash: '命令 执行 脚本',
  todo_write: '任务 计划',
  job_kill: '任务 取消',
};

// 2026-08-18 B1（用户批准蒸馏线）：归档产出机械记账——remember/case_log/checkpoint
// 调用单独记 hook=archive-production-observed，供"蒸馏有没有发生"的离线审计。
// 工具名宽松匹配：DSH MCP 工具可能是 mcp__memory__remember 等全名，取末段判断。
export function classifyTool(name, observeSet = OBSERVE_TOOLS) {
  if (typeof name !== 'string' || name.length === 0) return null;
  const last = name.split('/').pop().split('__').pop();
  if (last === 'remember' || last === 'case_log' || last === 'checkpoint') return 'archive';
  if (observeSet.has(name) || observeSet.has(last)) return 'observe';
  return null;
}

export function guardDecision(exec, observeSet = OBSERVE_TOOLS) {
  return classifyTool(exec?.name, observeSet);
}

export function actionWordsFor(toolName) {
  // 宽松匹配末段（mcp__x__write 形）
  const last = String(toolName ?? '').split('/').pop().split('__').pop();
  return TOOL_ACTION_WORDS[last] ?? TOOL_ACTION_WORDS[toolName] ?? null;
}

async function reportObserved(exec, kind) {
  try {
    const { client } = await getClient();
    await client.callTool({
      name: 'injection_log',
      arguments: { hook: kind === 'archive' ? 'archive-production-observed' : 'pre-execute-observed', session: '', query_hash: '', key: exec?.name ?? '', score: 0, provenance: 'action-guard-plugin' },
    });
  } catch { /* 防御 */ }
}

// 治本 A·工具时点机械召回：recall(动作词)，命中记 pre-execute-recall-hit。
async function reportToolRecall(exec) {
  const query = actionWordsFor(exec?.name);
  if (!query) return;
  try {
    const { client } = await getClient();
    const d = await client.callTool({ name: 'recall', arguments: { query } });
    const dd = JSON.parse(d.content[0].text);
    const keys = (dd?.must_follow ?? []).map(m => m.key);
    if (keys.length > 0) {
      await client.callTool({
        name: 'injection_log',
        arguments: {
          hook: 'pre-execute-recall-hit', session: '', query_hash: '',
          key: keys.join(','), score: (dd.must_follow ?? []).reduce((a, m) => a + (m.score ?? 0), 0),
          used_chars: dd?.used_chars ?? 0, provenance: 'action-guard-plugin',
        },
      });
    }
  } catch { /* 防御：recall 失败不影响工具决策 */ }
}

let armed = false;
export function isArmed() { return armed; }

export default {
  apply(ctx) {
    try {
      ctx.on('tools/pre-execute', (exec, next) => {
        try {
          const kind = guardDecision(exec);
          if (kind === 'observe' || kind === 'archive') void reportObserved(exec, kind);
          if (kind === 'observe') void reportToolRecall(exec);
        } catch { /* 防御 */ }
        return next();
      }, { global: true });
      armed = true;
    } catch {
      armed = false; // 事件不可达：插件惰性，绝不破坏回合
    }
    return () => {};
  },
};
