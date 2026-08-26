// turn-archive-plugin.mjs —— 回合末归档（P2，2026-08-16）。
//
// 机制：监听 agent/turn-stopping（serial），按节奏 steer 一条"归档哨兵"消息：
// 模型在收尾步复盘本段回合，有教训 → case_log(draft)/规则候选/checkpoint，没有则跳过。
// ——"会话后归档不靠自觉"的机械落点（hermes hindsight / distill 范式的最轻形态）。
//
// 反例对策（方案 0C-E-1 steer 循环 / 0C-E-2 案例洪水）：
//   1. 节奏门：turn < 5 不 steer；距上次 steer < 5 回合不 steer（循环护栏）
//   2. 上限：每会话进程内最多 2 次 steer（防打扰与案例洪水）
//   3. 消息要求"没有则一句话跳过，不产生任何写入"
// 回滚 = 删除 preset 中本行并重启。
import { randomUUID } from 'node:crypto';

// 2026-08-18 B1 强化（用户批准蒸馏线）：steer 从"请复盘"升级为"必须产出"——
// 产出动作会被 action-guard 机械记账（injection_log hook=archive-production-observed），
// 零产出会话由每日离线蒸馏任务（协议 M7）兜底复查。
const ARCHIVE_STEER_TEXT =
  '回合归档哨兵（turn-stopping 注入，必须产出）：复盘最近几回合——① 有用户纠错/踩坑教训 → 调 mcp__memory__case_log 归档（先归类 category 再写）；② 有新规则候选/新知识 → mcp__memory__remember 写入（status=draft）；③ 停靠点有变化 → mcp__memory__checkpoint 更新。若确实没有值得沉淀的内容：回复一句话"本段无值得沉淀内容"作为声明。不允许只在心里判断、不允许静默跳过；本回合的产出动作会被机械记账审计，零产出的会话将在每日蒸馏任务中被离线复查。';

// 审计修补（C3）：节奏状态按 agent 分桶（WeakMap），真·会话级；否则会话 A 的 steer 会饿死会话 B。
const stateByAgent = new WeakMap();
function stateOf(agent) {
  if (!agent) return new Map(); // 无 agent 身份 → 独立空状态（保守）
  let m = stateByAgent.get(agent);
  if (!m) { m = new Map(); stateByAgent.set(agent, m); }
  return m;
}

export function shouldSteer(turn, st = new Map(), everyTurns = 5, maxSteers = 2) {
  if (!Number.isInteger(turn) || turn < everyTurns) return false;
  const last = st.get('lastSteerTurn');
  if (last !== undefined && turn - last < everyTurns) return false;
  if ((st.get('steerCount') ?? 0) >= maxSteers) return false;
  return true;
}

// 状态变更与判定分离：判定是纯谓词（可测），变更由 apply 显式执行
export function markSteered(turn, st = new Map()) {
  st.set('lastSteerTurn', turn);
  st.set('steerCount', (st.get('steerCount') ?? 0) + 1);
}

export default {
  apply(ctx) {
    ctx.on('agent/turn-stopping', async (payload) => {
      try {
        const turn = payload?.turn;
        const st = stateOf(payload?.agent);
        if (!shouldSteer(turn, st)) return;
        markSteered(turn, st);
        // 修复（2026-08-16）：steer 消息同样必须带 id（agent-loop 把消息
        // 原样 append 为 user/message 事件，加载校验缺 id 即整个会话打不开）。
        // 2026-08-18：kind 统一为 'sentinel'（与 sentinel-plugin 同协议），
        // 不再复用 agent-instructions，避免任何按 kind 过滤首请求/自动注入的
        // preset 过滤器误伤哨兵系消息。
        payload.agent.steer({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: ARCHIVE_STEER_TEXT }],
          source: { kind: 'sentinel', form: 'instructions', changes: [], sentinel: true },
        });
      } catch { /* 防御：任何失败都不影响回合 */ }
    }, { global: true });
    return () => {};
  },
};
