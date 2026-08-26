// sentinel-plugin.mjs —— 哨兵注入插件（B 计划落地，2026-08-15 用户批准全自主）。
//
// v4.4（P0 触发质量治理）：
//  1. 意图分级：闲聊确认型零注入 / 阅读型仅 CHECK+FYI / 动作型全量 MUST_FOLLOW
//  2. 开场哨兵：每会话第一回合注入停靠点 + 未读信箱摘要（替代 session-init 自觉）
//  3. 纠错信号哨兵：用户消息含"不对/还是不行/报错"等 → 注入 fail-fast + 先归类再修复 + case_log 提醒
//
// 机制：挂 agent/pre-step（官方 agent-instructions 同款事件），在每回合第一步
// 用最新用户消息对本地记忆库做 recall；命中 MUST_FOLLOW 时按 kind:"enter" 模式
// 把规则清单注入为本回合上下文消息（用户角色、source.kind="sentinel"、空 changes——
// 与官方注入消息同形，且不走 inbox；kind 用独立值而非 agent-instructions，
// 2026-08-18 修复：harness-pro 的 tool-bootstrap 会按 suppressedContextSources
// 剥离 source.kind=agent-instructions 的首请求消息，导致开场/知识域哨兵在第一回合
// 静默消失——改用自定义 kind 后不再被该过滤器命中，首请求哨兵真实生效）。
//
// 防御设计（无人值守红线）：
//   1. 只在 step===1 注入（每回合最多一次）；reject 决策原样放行；
//   2. 任何异常（库不可读/调用失败/JSON 异常）→ 返回原 decision，绝不破坏回合；
//   3. 不注册任何进程级服务/Provider——无 cordis 撞车风险；
//   4. 回滚 = 删除 preset 中本行并重启。
//
// 导入解析：被 cordis-plugin-loader 以绝对路径动态 import；内部相对导入
// 由 Node 从本文件位置解析（.mcp-servers/node_modules 可达）。
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import { createMemoryServer } from './memory-server.mjs';

let clientPromise = null;
export function getClient(dir) {
  if (!clientPromise) {
    clientPromise = (async () => {
      // 注记（审计 C6）：插件在宿主进程内运行，MEMORY_DIR 仅对井 stdio spawn 生效，故此处兜底为
      // 硬编码；若日后迁移记忆库路径，必须同步改此处与 harness-now 井行的 MEMORY_DIR（两处一致）。
      const server = createMemoryServer({ dir: dir ?? process.env.MEMORY_DIR ?? path.join(process.env.DSH_HOME ?? homedir(), '.dsh', 'cognitio') });
      const client = new Client({ name: 'sentinel-plugin', version: '1.0.0' });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await server.connect(st);
      await client.connect(ct);
      return { client, server };
    })();
  }
  return clientPromise;
}

export function userText(messages) {
  for (const m of messages ?? []) {
    const parts = (m.content ?? []).filter(p => p && p.type === 'text' && typeof p.text === 'string').map(p => p.text).filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }
  return '';
}

export async function recallRules(query, dir) {
  const { client } = await getClient(dir);
  const r = await client.callTool({ name: 'recall', arguments: { query } });
  return JSON.parse(r.content[0].text);
}

// ── v4.4 意图分级 ──
const CHAT_RE = /^(收到|好的|好|ok|嗯+|可以|行|1|了解|明白|知道了|没问题)$/i;
const READING_RE = /^(介绍|什么是|解释|简述|科普|讲讲|谈谈|分析一下|评估一下|帮我看看)/;
const ACTION_RE = /(改|修|写|提交|部署|安装|执行|创建|删除|运行|跑|测试|修复|实现|重构|优化|配置|迁移|备份|同步|重启|排查)/;
export function classifyIntent(text) {
  const t = (text ?? '').trim();
  if (t.length <= 6 && CHAT_RE.test(t)) return 'chat';
  if (READING_RE.test(t) && !ACTION_RE.test(t)) return 'reading';
  return 'action';
}

// ── v4.4 纠错信号 ──
const CORRECTION_RE = /(不对|还是不行|仍然不行|又错了|报错|崩溃|错了|不行啊|搞错了|出错了|还是不对)/;
export function isCorrectionSignal(text) {
  return CORRECTION_RE.test(text ?? '');
}

// ── P4 知识库强制检索义务（专业问题域检测）──
// 2026-08-18 扩充：哲学域词表从「显式提"哲学"才命中」扩到学科术语与经典论题
// （中文房间/强人工智能/能指所指等），否则"中文房间论证"这类明摆着的哲学问题
// 首回合不触发知识域义务。
const KNOWLEDGE_DOMAIN_RE = /(疗愈|心理|精神分析|哲学|哲学史|灵性|艺术治疗|弗洛伊德|佛洛依德|荣格|尼采|康德|黑格尔|拉康|潜意识|正念|冥想|心理动力学|存在主义|现象学|中文房间|塞尔|图灵测试|强人工智能|弱人工智能|人工智能哲学|心灵哲学|心智哲学|认识论|形而上学|伦理学|美学|逻辑学|符号学|索绪尔|能指|所指|维特根斯坦|海德格尔|萨特|加缪|笛卡尔|休谟|洛克|斯宾诺莎|亚里士多德|柏拉图|苏格拉底|叔本华|柏格森|胡塞尔|梅洛庞蒂|梅洛-庞蒂|德里达|福柯|德勒兹|齐泽克|阿多诺|本雅明|意向性|符号接地|自由意志|决定论|诠释学|阐释学|语言哲学|分析哲学|欧陆哲学|结构主义|后结构主义|解构主义|法兰克福学派|存在与时间|二元论|唯物主义|唯心主义)/;
export function isKnowledgeDomain(text) {
  return KNOWLEDGE_DOMAIN_RE.test(text ?? '');
}
export function buildKnowledgeBlock() {
  return '知识库强制检索义务（专业问题域命中）：回答前必须先调 mcp__vault__vault_search 查文献库（疗愈/心理/哲学文献）。命中 → 基于检索结果回答并给出来源文献名；未命中 → 如实声明"知识库未找到相关信息"，不凭记忆臆答。';
}

// ── v4.4 开场哨兵：停靠点 + 未读信箱 ──
export async function buildOpeningBlock(client) {
  try {
    const [r, m] = await Promise.all([
      client.callTool({ name: 'resume', arguments: { scope: 'global' } }),
      client.callTool({ name: 'mailbox', arguments: { to: 'global', unread_only: true } }),
    ]);
    const resume = JSON.parse(r.content[0].text);
    const mail = JSON.parse(m.content[0].text);
    let text = '开场哨兵（本会话初始状态）\n';
    if (resume && typeof resume.content === 'string' && resume.content.length > 0) {
      const c = resume.content;
      text += `- 停靠点 v${resume.v ?? '?'}: ${c.slice(0, 300)}${c.length > 300 ? '…' : ''}\n`;
    } else {
      text += '- 停靠点: 无\n';
    }
    const unread = (mail?.mail ?? []).filter(x => x.read !== true).slice(0, 3);
    text += unread.length > 0
      ? `- 未读信箱 ${unread.length} 封: ${unread.map(x => x.title).join('；')}`
      : '- 未读信箱: 无';
    return text;
  } catch {
    return null; // 防御：开场块失败不影响回合
  }
}

// ── v4.4 纠错信号哨兵：fail-fast + 先归类再修复 + case_log 提醒 ──
export async function buildCorrectionBlock(client) {
  try {
    const d = await recallRules('不对 两次');
    const lines = (d?.must_follow ?? []).map(m => `- [MUST_FOLLOW] ${m.key}：${String(m.content ?? '').slice(0, 200)}`);
    lines.push('- 纠错处置顺序：先归类（读范畴/案例归档）→ 再修复；归类在修复之前，不先归类=修完必忘');
    lines.push('- 修复完成后 case_log 归档本案例（symptom/resolution/related），供后续触发');
    return `纠错信号哨兵（检测到纠错信号）\n${lines.join('\n')}`;
  } catch {
    return '纠错信号哨兵（检测到纠错信号）\n- 纠错处置顺序：先归类（读范畴/案例归档）→ 再修复；归类在修复之前\n- 修复完成后 case_log 归档本案例';
  }
}

// ── v4.5 P1：查询精炼（确定性，非 LLM）──
export function refineQuery(text) {
  const t = (text ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.length <= 24) return t;
  const first = t.split(/[。！？!?；;\n]/)[0];
  if (first && first.length > 0 && first.length <= 40) return first;
  return t.slice(0, 40);
}

// ── A1（2026-08-18 用户开启）：每轮纸条——任何非闲聊回合必注入一行召回声明：
// 命中 MUST_FOLLOW/CHECK/FYI 照旧注入内容；未命中则注入负结果声明。机械强制
// "每问必过知识库"，不靠模型自觉。──
export function buildRecallNegativeBlock(d, intent, mustInjected = false) {
  if (intent === 'chat') return null;
  if (intent === 'reading') {
    const checkFyi = [...(d?.check ?? []), ...(d?.fyi ?? [])];
    if (checkFyi.length > 0) return null;
    return '哨兵检索（本回合已查本地记忆库）：未命中 CHECK/FYI 背景信息，如实声明。';
  }
  // action：MUST_FOLLOW 未注入即声明（仅背景信息命中不算约束命中）
  if (mustInjected) return null;
  // 治本 B（2026-08-26/27）：显式指令并入机械纸条——flash 吃显式指令（阈值型人格），
  // 纸条每回合机械注入，任何模型/预设都吃得到；不依赖特定预设 prompt。
  return '哨兵检索（本回合已查本地记忆库）：未命中 MUST_FOLLOW 强制规则，如实声明——本回合无既有规则约束。\n（显式指令：本回合若将动工具写文件改配置提交部署，动手前先主动 mcp__memory__recall(任务动作词) 一次，再执行——不依赖本条提醒的自觉。）';
}

// ── 治本 A（2026-08-26）：动作词副查询——机械消除"查询词局限"根因，不依赖模型自省 ──
// 三事故根因之一 = 用户口语无触发词（哨兵查询词=用户消息原文，零命中）；
// flash 又不自觉做第二层 recall。此处哨兵自己从消息里确定性抽取"动作词+对象"
// （纯正则，无 LLM），主查询零命中时追加副查询——注入独立于模型人格。
const ACTION_WORD_RE = /(调整|修改|新建|创建|删除|提交|部署|安装|执行|运行|测试|修复|实现|重构|优化|配置|迁移|备份|同步|重启|启动|停止|排查|检查|查看|升级|更新|卸载|清理|改|修|写|装|跑)/g;
export function extractActionTerms(text) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  const matched = [...t.matchAll(ACTION_WORD_RE)].map(m => m[0]);
  if (matched.length === 0) return [];
  const seen = new Set(); const words = [];
  const push = (w) => { if (w && w.length > 0 && !seen.has(w)) { seen.add(w); words.push(w); } };
  for (const w of matched) push(w);
  const clean = t
    .replace(/帮我|请|麻烦|把|一下|一个|帮我一下|给我|我们|咱们|直接|先|再|顺便/g, ' ')
    .replace(/[。！？!?；;，,：:\s]+/g, ' ')
    .trim();
  const tokens = clean.split(' ').filter(Boolean)
    .map(s => s.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(Boolean)
    .filter(p => !matched.includes(p));
  const core = tokens.join(' ').slice(0, 16);
  if (core) push(core);
  // 单个对象 token（中文双字触发词的关键命中面："改preset" 触发词 vs token "preset"）
  for (const tok of tokens.slice(0, 3)) push(tok);
  for (const w of matched) {
    if (core && !core.startsWith(w)) push((w + ' ' + core).slice(0, 24));
  }
  return words.slice(0, 4);
}

// ── v4.5 P1：会话内注入冷却/去重（键级；审计修补 C1：状态按 agent 分桶——WeakMap，真·会话级）──
const injectionStateByAgent = new WeakMap();
function stateOf(agent) {
  if (!agent) return new Map(); // 无 agent 身份 → 独立空状态（保守：不跨会话共享）
  let m = injectionStateByAgent.get(agent);
  if (!m) { m = new Map(); injectionStateByAgent.set(agent, m); }
  return m;
}
export function filterInjected(list, turn, st = new Map(), cooldownTurns = 3) {
  const out = [];
  for (const m of list ?? []) {
    const prev = st.get(m.key);
    if (prev && turn - prev.turn < cooldownTurns) continue;
    st.set(m.key, { turn });
    out.push(m);
  }
  return out;
}
export function resetInjectionState() { /* WeakMap 无法全局清空：状态随 agent 生命周期自动回收 */ }

// ── v4.5 P1：注入审计上报（防御：失败静默）──
function hashQuery(q) {
  let h = 5381;
  for (let i = 0; i < q.length; i++) h = ((h << 5) + h + q.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
async function recordInjection(client, hook, session, query, keys, score, usedChars = 0, recency = 0) {
  try {
    await client.callTool({
      name: 'injection_log',
      arguments: { hook, session, query_hash: hashQuery(query), key: keys.join(','), score, provenance: 'sentinel-plugin', used_chars: usedChars, recency },
    });
  } catch { /* 防御：审计失败不影响回合 */ }
}

export default {
  apply(ctx) {
    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next();
      try {
        const { messages, turn, step } = payload;
        // v4.6 审计追溯：injection_log.session 不再写空串；DSH payload 没有标准 sessionId 时
        // 用 agent 身份兜底，仍取不到写 'unknown'（与空串区分：未知 ≠ 缺失）。
        const agentId = typeof payload?.agent === 'string' ? payload.agent : (payload?.agent?.sessionId ?? payload?.agent?.id);
        const session = String(payload?.sessionId ?? agentId ?? 'unknown').slice(0, 80);
        if (step !== 1) return decision;
        if (!decision || decision.kind === 'reject' || !Array.isArray(decision.messages)) return decision;
        const query = userText(messages);
        if (!query) return decision;
        const intent = classifyIntent(query);
        const { client } = await getClient();
        const blocks = [];
        // 审计修补（C7）：开场块提到 intent 判断之前——首条消息即使是"收到"也不跳过停靠点/信箱
        if (turn === 1) {
          const open = await buildOpeningBlock(client);
          if (open) {
            blocks.push(open);
            void recordInjection(client, 'opening', session, query, [], 0);
          }
        }
        if (intent === 'chat' && blocks.length === 0) return decision; // 闲聊确认型：零规则注入
        if (isCorrectionSignal(query)) {
          const corr = await buildCorrectionBlock(client);
          if (corr) {
            blocks.push(corr);
            void recordInjection(client, 'correction', session, query, [], 0);
          }
        }
        // P4：专业问题域 → 知识库强制检索义务
        if (isKnowledgeDomain(query)) {
          blocks.push(buildKnowledgeBlock());
          void recordInjection(client, 'knowledge-obligation', session, query, [], 0);
        }
        // v4.5 P1：查询精炼后再 recall（首句/40 字符上限），降低长消息噪音
        const d = await recallRules(refineQuery(query));
        const recencyNow = stateOf(payload.agent).size; // 会话累计注入键数（抗噪音/冷却维度的代理指标）
        if (intent === 'reading') {
          // 阅读型：仅 CHECK/FYI 摘要，不注入 MUST_FOLLOW
          const checkFyi = [...(d?.check ?? []), ...(d?.fyi ?? [])].slice(0, 3);
          if (checkFyi.length > 0) {
            const lines = checkFyi.map(m => {
              const label = (d.check ?? []).includes(m) ? 'CHECK' : 'FYI';
              return `- [${label}] ${m.key}（score ${m.score}）：${String(m.excerpt ?? '').slice(0, 120)}`;
            });
            blocks.push(`哨兵召回（阅读型，仅供参考）\n${lines.join('\n')}`);
            void recordInjection(client, 'pre-step-reading', session, query, checkFyi.map(m => m.key), checkFyi.reduce((a, m) => a + (m.score ?? 0), 0), d?.used_chars ?? 0, recencyNow);
          } else {
            // A1：阅读型未命中 → 负结果纸条
            blocks.push(buildRecallNegativeBlock(d, 'reading'));
            void recordInjection(client, 'pre-step-negative', session, query, [], 0, d?.used_chars ?? 0, recencyNow);
          }
        } else if (Array.isArray(d?.must_follow) && d.must_follow.length > 0) {
          // v4.5 P1：键级冷却去重（同键 3 回合内不重复注入；状态按 agent 会话级隔离）
          const fresh = filterInjected(d.must_follow, turn, stateOf(payload.agent));
          if (fresh.length > 0) {
            const lines = fresh.map(m => `- [MUST_FOLLOW] ${m.key}（score ${m.score}）：${m.content}`);
            blocks.push(`哨兵召回（本回合必须执行的既有规则，来源：本地记忆库）\n${lines.join('\n')}\n（回执：本回合回复开头请用一行复述以上 MUST_FOLLOW 键清单，供 injection_log 审计）`);
            void recordInjection(client, 'pre-step-action', session, query, fresh.map(m => m.key), fresh.reduce((a, m) => a + (m.score ?? 0), 0), d?.used_chars ?? 0, recencyNow);
          } else {
            // A1：动作型 MUST_FOLLOW 未注入 → 负结果纸条
            blocks.push(buildRecallNegativeBlock(d, 'action', false));
            void recordInjection(client, 'pre-step-negative', session, query, [], 0, d?.used_chars ?? 0, recencyNow);
          }
        } else {
          // 治本 A（2026-08-26）：主查询零命中 → 动作词副查询兜底（机械消除查询词局限）。
          // 提取动作词+对象（确定性正则），逐词 recall 合并 MUST_FOLLOW；命中即按正常
          // MUST_FOLLOW 注入（hook=pre-step-action-fallback 可审计），不依赖模型自觉。
          const fallbackTerms = extractActionTerms(query);
          let fbMust = [];
          let fbScore = 0;
          let fbUsedChars = 0;
          for (const term of fallbackTerms) {
            try {
              const fb = await recallRules(term);
              fbUsedChars += fb?.used_chars ?? 0;
              for (const m of (fb?.must_follow ?? [])) {
                if (!fbMust.some(x => x.key === m.key)) { fbMust.push(m); fbScore += (m.score ?? 0); }
              }
            } catch { /* 防御 */ }
          }
          const fbFresh = filterInjected(fbMust, turn, stateOf(payload.agent));
          if (fbFresh.length > 0) {
            const lines = fbFresh.map(m => `- [MUST_FOLLOW] ${m.key}（score ${m.score}）：${m.content}`);
            blocks.push(`哨兵召回（本回合必须执行的既有规则，来源：本地记忆库·动作词兜底）\n${lines.join('\n')}\n（回执：本回合回复开头请用一行复述以上 MUST_FOLLOW 键清单，供 injection_log 审计）`);
            void recordInjection(client, 'pre-step-action-fallback', session, `${query}|${fallbackTerms.join(',')}`, fbFresh.map(m => m.key), fbScore, fbUsedChars, recencyNow);
          } else {
            // A1：动作型无 MUST_FOLLOW 命中 → 负结果纸条
            blocks.push(buildRecallNegativeBlock(d, 'action', false));
            void recordInjection(client, 'pre-step-negative', session, query, [], 0);
          }
        }
        if (blocks.length === 0) return decision;
        // 修复（2026-08-16）：必须带 id——DSH 加载时校验 user/message 事件
        // 的 identified message，无 id 的事件会导致整个会话历史加载失败
        // （SessionPersistenceCorruptionError: "lacks an identified message"）。
        const desired = {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: blocks.join('\n\n') }],
          // kind 用自定义 'sentinel' 而非 'agent-instructions'：DSH 会话层只校验
          // identified message 的 id，kind 无白名单；而 harness-pro tool-bootstrap
          // 会剥离 suppressedContextSources=[agent-instructions,…] 的首请求消息。
          source: { kind: 'sentinel', form: 'instructions', changes: [], sentinel: true },
        };
        const lastClaimedIndex = decision.messages.findLastIndex((message) => messages.includes(message));
        if (lastClaimedIndex < 0) return decision;
        return { kind: 'enter', messages: decision.messages.toSpliced(lastClaimedIndex + 1, 0, desired) };
      } catch {
        return decision; // 防御：任何失败都不影响回合
      }
    }, { global: true });
    return () => {
      if (clientPromise) {
        clientPromise.then(({ client, server }) => {
          try { client.close(); } catch {}
          try { server.close(); } catch {}
        });
        clientPromise = null;
      }
    };
  },
};
