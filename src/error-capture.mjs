// error-capture-plugin.mjs —— 出错归入（P2，2026-08-16）。
//
// 机制：监听 agent/error（emit，携带原始错误），过滤后自动把错误草稿写入记忆库
// （type=case, status=draft，模型/用户后续裁决升格）——"出错→归入"体验的机械落点。
//
// 防御与反例对策（方案 0C-E-2 案例洪水）：
//   1. 过滤：空/过短/过长/环境性错误（沙箱拒绝、EPERM、模块未找到等）不记录
//   2. 每会话进程内上限 3 条 draft（防洪水）
//   3. 任何异常静默（emit 事件本身无阻断能力，最坏=不漏一例）
// 回滚 = 删除 preset 中本行并重启。
import { createHash } from 'node:crypto';
import { getClient } from './sentinel.mjs';

// 环境性/良性错误模式：这些是探索期常态，不是"教训"
const SKIP_RE = /\[sandbox:|Access denied|EPERM|EADDRINUSE|ERR_MODULE_NOT_FOUND|ENOENT|no such file|not found|ECONNREFUSED|timeout|TIMEOUT|429|rate.?limit/i;
export const MAX_DRAFTS = 3;

export function shouldRecordCase(errorText, opts = {}) {
  const t = String(errorText ?? '').trim();
  if (t.length < 8 || t.length > 2000) return false;
  if (SKIP_RE.test(t)) return false;
  if ((opts.count ?? 0) >= MAX_DRAFTS) return false;
  return true;
}

export async function recordDraftCase(client, errorText, now = Date.now()) {
  const date = new Date(now).toISOString().slice(0, 10);
  const hash = createHash('sha256').update(`${date}\0${errorText}`).digest('hex').slice(0, 10);
  const key = `case/${date.replace(/-/g, '')}/${hash}`;
  const r = await client.callTool({
    name: 'remember',
    arguments: {
      key,
      type: 'case',
      status: 'draft',
      title: errorText.slice(0, 60),
      content: JSON.stringify({ symptom: errorText.slice(0, 300), resolution: '', error: errorText.slice(0, 500) }),
      tags: ['case', 'auto-captured'],
    },
  });
  return { key, result: JSON.parse(r.content[0].text) };
}

// 审计修补（C2）：draft 计数按 agent 分桶（WeakMap），真·每会话上限——payload.agent 是会话级身份。
const draftsByAgent = new WeakMap();
function draftCountOf(agent) {
  if (!agent) return MAX_DRAFTS; // 无 agent 身份 → 保守拒绝
  return draftsByAgent.get(agent) ?? 0;
}
function bumpDraftCount(agent) {
  if (!agent) return;
  draftsByAgent.set(agent, draftCountOf(agent) + 1);
}

export default {
  apply(ctx) {
    ctx.on('agent/error', async (payload) => {
      try {
        const err = payload?.error;
        const text = typeof err === 'string' ? err : (err?.message ?? String(err ?? ''));
        const count = draftCountOf(payload?.agent);
        if (!shouldRecordCase(text, { count })) return;
        bumpDraftCount(payload?.agent);
        const { client } = await getClient();
        await recordDraftCase(client, text);
      } catch { /* 防御：任何失败都不影响回合 */ }
    }, { global: true });
    // 审计修补（B1）：agent/request-error 监听——瀑布链必须调 next() 原样放行，仅旁路观测。
    ctx.on('agent/request-error', async (payload, next) => {
      try {
        const decision = await next();
        const failure = payload?.failure;
        const text = typeof failure === 'string' ? failure : (failure?.message ?? String(failure ?? ''));
        const count = draftCountOf(payload?.agent);
        if (shouldRecordCase(text, { count })) {
          bumpDraftCount(payload?.agent);
          const { client } = await getClient();
          await recordDraftCase(client, text);
        }
        return decision;
      } catch {
        try { return await next(); } catch { return undefined; }
      }
    }, { global: true });
    return () => {};
  },
};
