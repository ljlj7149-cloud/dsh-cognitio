// vault-server.mjs —— 文献井（P4-a：FTS 召回，只读）。2026-08-16。
//
// 定位分工（调研定论）：RAG/向量 = 只读记忆（即时召回）；编译式 wiki = 可写记忆。
// 本井是"只读"侧的最小实现：把 vault 文本文献编入 SQLite FTS5（trigram），
// 提供 vault_search（含 negative 负结果标记）/ vault_get（字节上限）/ vault_reindex。
// 后续演进：语义向量混合（sqlite-vec+transformers.js）、编译式 wiki 页面检索（P4-b）。
//
// 护栏：只读（无写工具）；node_modules/.git 排除；单文件内容 20 万字符上限；
// 索引库在 D:/deepseek/.memory/vault-index.sqlite（gitignored）。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_ROOT = path.join(process.env.DSH_HOME ?? homedir(), '.dsh', 'cognitio', 'vault');
const MAX_FILE_CHARS = 200_000;
const GET_CAP = 8192;

export function createVaultServer(opts = {}) {
  const root = opts.dir ?? process.env.VAULT_DIR ?? DEFAULT_ROOT;
  // 索引跟随数据目录（中立化 2026-08-27）：无显式 env 时默认 <root>/../vault-index.sqlite；
  // 生产已显式传 VAULT_INDEX_DB（见 web profile 井行），不破坏现状。
  const indexDb = opts.indexDb ?? process.env.VAULT_INDEX_DB ?? path.join(path.dirname(root), 'vault-index.sqlite');

  const db = new DatabaseSync(indexDb);
  db.exec(`CREATE TABLE IF NOT EXISTS docs (
    path TEXT PRIMARY KEY, dir TEXT NOT NULL, title TEXT NOT NULL,
    mtime_ms INTEGER NOT NULL, content TEXT NOT NULL
  )`);
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(path UNINDEXED, dir UNINDEXED, title, content, tokenize='trigram')`);

  const EXCLUDE_DIRS = new Set(['node_modules', '.git']);

  function scan() {
    const files = [];
    const walk = (dir, depth) => {
      if (depth > 8) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!EXCLUDE_DIRS.has(e.name)) walk(path.join(dir, e.name), depth + 1);
        } else if (/\.(md|markdown|txt)$/i.test(e.name)) {
          files.push(path.join(dir, e.name));
        }
      }
    };
    walk(root, 0);
    return files;
  }

  function reindex() {
    db.prepare('DELETE FROM docs').run();
    db.prepare('DELETE FROM docs_fts').run();
    const ins = db.prepare('INSERT INTO docs (path, dir, title, mtime_ms, content) VALUES (?, ?, ?, ?, ?)');
    const insFts = db.prepare('INSERT INTO docs_fts (path, dir, title, content) VALUES (?, ?, ?, ?)');
    let count = 0;
    for (const p of scan()) {
      try {
        const st = fs.statSync(p);
        let text = fs.readFileSync(p, 'utf8');
        if (text.length > MAX_FILE_CHARS) text = text.slice(0, MAX_FILE_CHARS);
        const rel = path.relative(root, p).replace(/\\/g, '/');
        const dirName = path.dirname(rel).split('/')[0] || '.';
        const title = path.basename(p, path.extname(p));
        ins.run(p, dirName, title, st.mtimeMs, text);
        insFts.run(p, dirName, title, text);
        count += 1;
      } catch { /* 跳过不可读文件 */ }
    }
    return count;
  }

  const server = new McpServer({ name: 'vault-server', version: '1.0.0' });

  server.registerTool(
    'vault_search',
    {
      description:
        'Search the local literature vault (compiled FTS index over markdown/txt docs, read-only). Returns matched docs with score, dir, snippet, and mtime. If results empty, negative=true — you MUST then state honestly "知识库未找到相关信息" rather than guessing. 专业问题（疗愈/心理/哲学领域）在回答前必须先查本井（知识库强制检索义务）。',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search terms; CJK phrases supported (trigram substring)'),
        limit: z.number().int().min(1).max(20).optional().describe('Max results (default 8)'),
      }),
    },
    async (args) => {
      const limit = args.limit ?? 8;
      const terms = args.query.split(/\s+/).filter(Boolean);
      const results = [];
      if (terms.length > 0) {
        const seen = new Set();
        for (const t of terms) {
          const like = `%${t.replace(/[\\%_]/g, m => '\\' + m)}%`;
          for (const r of db.prepare('SELECT path, dir, title, mtime_ms FROM docs WHERE title LIKE ? ESCAPE \'\\\' OR dir LIKE ? ESCAPE \'\\\' LIMIT ?').all(like, like, limit * 4)) {
            if (!seen.has(r.path)) { seen.add(r.path); results.push({ ...r, score: 0, snippet: '' }); }
          }
          // 审计修补（C9）：2 字 CJK 词也搜正文（FTS trigram 需 3 字符，短词只靠 LIKE）
          if ([...t].length === 2 && /^[\u4e00-\u9fff]{2}$/.test(t)) {
            for (const r of db.prepare('SELECT path, dir, title, mtime_ms FROM docs WHERE content LIKE ? ESCAPE \'\\\' LIMIT ?').all(like, limit * 4)) {
              if (!seen.has(r.path)) { seen.add(r.path); results.push({ ...r, score: 0, snippet: '' }); }
            }
          }
        }
        const match = terms.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
        try {
          for (const r of db.prepare(`SELECT d.path, d.dir, d.title, d.mtime_ms, snippet(docs_fts, 3, '[', ']', '…', 24) AS snip, bm25(docs_fts) AS rank
            FROM docs_fts JOIN docs d ON d.path = docs_fts.path WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?`).all(match, limit * 4)) {
            if (!seen.has(r.path)) { seen.add(r.path); results.push({ path: r.path, dir: r.dir, title: r.title, mtime_ms: r.mtime_ms, score: Math.round(-r.rank * 100) / 100, snippet: r.snip }); }
          }
        } catch { /* FTS 匹配失败（特殊字符等）→ 仅 LIKE 结果 */ }
      }
      const page = results.slice(0, limit);
      return { content: [{ type: 'text', text: JSON.stringify({ count: page.length, negative: page.length === 0, results: page }) }] };
    },
  );

  server.registerTool(
    'vault_get',
    {
      description: 'Read one vault document by its indexed path (from vault_search results). Content hard-capped at 8192 bytes; truncated flag marks the cut. Read-only.',
      inputSchema: z.object({ path: z.string().min(1).max(500) }),
    },
    async (args) => {
      const row = db.prepare('SELECT path, title, content FROM docs WHERE path = ?').get(args.path);
      if (!row) return { content: [{ type: 'text', text: JSON.stringify({ found: false, hint: '路径不在索引中；先 vault_search' }) }] };
      let text = row.content;
      let truncated = false;
      if (Buffer.byteLength(text, 'utf8') > GET_CAP) { text = text.slice(0, Math.floor(GET_CAP / 2)); truncated = true; }
      return { content: [{ type: 'text', text: JSON.stringify({ found: true, title: row.title, bytes: Buffer.byteLength(text, 'utf8'), truncated, text }) }] };
    },
  );

  server.registerTool(
    'vault_reindex',
    {
      description: 'Rescan the vault directory and rebuild the FTS index. Returns the indexed document count. Call after adding/removing vault files.',
      inputSchema: z.object({}),
    },
    async () => {
      const count = reindex();
      return { content: [{ type: 'text', text: JSON.stringify({ indexed: count, root }) }] };
    },
  );

  return server;
}

if (process.argv[1] && process.argv[1].endsWith('vault-server.mjs')) {
  const server = createVaultServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch(() => process.exit(1));
}
