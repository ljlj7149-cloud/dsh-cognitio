// panel-api.mjs —— cognitio 系统设置页的 host HTTP 端点（2026-08-27）。
//
// 参考官方样例 dsh-message-edit（ctx.webServer.register exact 路由——静态 bundle
// 插件 client↔host 通信的标准做法，client 以同源 fetch 调用）。
// 端点：GET/POST /cognitio-panel，body {op, args}；op ∈ list/get/stats/effect/
// approve/reject/audit。审批语义与 8787 面板同权（approved=true 唯一合法通道，
// actor=approval-panel；8787 面板退役后本端点即等效入口）。
// 防御：任何异常 → {error} JSON，不抛（面板可用性优先）。
import { getClient } from './sentinel.mjs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { homedir } from 'node:os';

export const PANEL_PATH = '/cognitio-panel';

async function callMemory(name, args) {
  const { client } = await getClient();
  const r = await client.callTool({ name, arguments: args ?? {} });
  const t = r?.content?.[0]?.text ?? '';
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

// 惰性直连（与 memory 井同库，WAL 并发安全）——anomalies/confirm 走 SQL
let rawDb = null;
function db() {
  if (rawDb) return rawDb;
  const dir = process.env.MEMORY_DIR ?? path.join(process.env.DSH_HOME ?? homedir(), '.dsh', 'cognitio');
  rawDb = new DatabaseSync(path.join(dir, 'memory.sqlite'));
  try { rawDb.exec('PRAGMA journal_mode = WAL'); } catch { /* 只读兼容 */ }
  return rawDb;
}

const handlers = {
  async list(args) { return callMemory('list', { scope: args.scope, prefix: args.prefix, type: args.type, limit: args.limit ?? 100, offset: args.offset ?? 0 }); },
  async get(args) { const k = String(args?.key ?? ''); if (!k) return { error: 'key required' }; return callMemory('get', { key: k }); },
  async stats() { return callMemory('stats', {}); },
  async effect() { return callMemory('effect_stats', { limit: 100 }); },
  async approve(args) {
    const key = String(args?.key ?? ''); if (!key) return { error: 'key required' };
    const row = await callMemory('get', { key });
    if (row?.error) return row;
    const status = row.type === 'proposition' ? 'active' : 'stable';
    return callMemory('remember', {
      key, title: row.title, content: row.content, type: row.type,
      tags: row.tags, scope: row.scope, triggers: row.triggers ?? '',
      counterexamples: row.counterexamples ?? '', sources: row.sources ?? '',
      citation: row.citation ?? '', status, approved: true, actor: 'approval-panel',
      audit_note: 'user approved via cognitio panel',
    });
  },
  async reject(args) { const key = String(args?.key ?? ''); if (!key) return { error: 'key required' }; return callMemory('forget', { key, actor: 'approval-panel', audit_note: 'user rejected via cognitio panel' }); },
  async audit(args) { return callMemory('audit_log', { limit: args.limit ?? 50 }); },
  // 待裁决：列表+按方案执行（老面板 decisions tab 迁移）
  async decisions(args) { return callMemory('list_decisions', { status: args?.status ?? 'open', limit: 50 }); },
  async resolve(args) { return callMemory('resolve_decision', { id: args?.id, resolution: args?.resolution, actor: 'approval-panel' }); },
  // 可疑项：应审批域 stable 且近 7 天无 approve/confirm-bypass 记录（老面板 ANOMALY_SQL 移植）
  async anomalies(args) {
    const days = args?.days ?? 7; const cutoff = Date.now() - days * 86400000;
    const rows = db().prepare(`SELECT m.* FROM memories m
      WHERE m.v = (SELECT MAX(v) FROM memories m2 WHERE m2.key = m.key)
        AND m.key NOT IN (SELECT key FROM tombstones)
        AND m.status = 'stable' AND m.ts >= ?
        AND (m.type IN ('rule','pattern','case','proposition') OR m.key LIKE 'rules/%' OR m.key LIKE 'patterns/%' OR m.key LIKE 'propositions/%' OR m.key LIKE 'facts/philosophy/%')
        AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.key = m.key AND a.op IN ('approve','confirm-bypass'))
      ORDER BY m.ts DESC LIMIT 50`).all(cutoff);
    return { anomalies: rows.map((r) => ({ key: r.key, v: r.v, ts: r.ts, type: r.type, status: r.status, title: r.title })) };
  },
  // 补记：确认已审（写 audit_events confirm-bypass——与老面板语义一致）
  async confirm(args) {
    const key = String(args?.key ?? ''); if (!key) return { error: 'key required' };
    db().prepare('INSERT INTO audit_events (ts, op, actor, key, v, field, from_value, to_value, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(Date.now(), 'confirm-bypass', 'approval-panel', key, args?.v ?? 0, 'status', '', 'confirmed', 'user confirmed via cognitio panel');
    return { ok: true };
  },
};

function respondJson(res, status, value) {
  try {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
  } catch { /* 响应失败防御 */ }
}

async function readJson(req) {
  return new Promise((resolve) => {
    let text = '';
    req.on('data', (c) => { text += String(c); if (text.length > 1 << 20) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(text || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

async function handle(ctx, req, res) {
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    const op = String(body?.op ?? '');
    const fn = handlers[op];
    if (!fn) return respondJson(res, 400, { error: `unknown op: ${op || '(empty)'}` });
    const out = await fn(body?.args ?? {});
    respondJson(res, 200, { ok: !out?.error, ...out });
  } catch (e) {
    respondJson(res, 500, { error: String(e?.message ?? e) });
  }
}

/** 注册面板端点；webServer 不可达时静默返回 false（插件仍可用于无面板形态）。 */
export function installPanelApi(ctx) {
  const ws = ctx.get?.('webServer');
  if (!ws || typeof ws.register !== 'function') return false;
  ws.register({
    kind: 'exact',
    path: PANEL_PATH,
    handler: (req, res) => { void handle(ctx, req, res); },
  });
  return true;
}
