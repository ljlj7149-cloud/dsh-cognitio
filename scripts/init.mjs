#!/usr/bin/env node
// cognitio seed/init —— 数据目录装订（阶段三）：建库 + 可选中子。
// 用法：node scripts/init.mjs [--dir <数据目录>] [--seed]
//   --dir   数据目录（默认 $MEMORY_DIR 或 D:/deepseek/.memory）
//   --seed  可选：建库后运行种子导入（存在 .mcp-servers/seed-import.mjs 时）
// 输出：数据目录初始化结果 —— 后续 MCP 井行请用 gen-mcp-rows.mjs 生成。
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const dir = dirIdx >= 0 ? args[dirIdx + 1] : (process.env.MEMORY_DIR ?? 'D:/deepseek/.memory');
const withSeed = args.includes('--seed');

fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });

const dbFile = path.join(dir, 'memory.sqlite');
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL');
// 权限表结构由 memory-server 首次连接时建；此处仅验证可写与目录 OK。
const probe = db.prepare('SELECT 1 AS ok').get();
db.close();

const out = { dir, dbFile, notesDir: path.join(dir, 'notes'), writable: probe.ok === 1, seeded: false };
if (withSeed) {
  const seedScript = new URL('../../.mcp-servers/seed-import.mjs', import.meta.url);
  if (fs.existsSync(seedScript)) {
    const { seedImport } = await import(seedScript.href);
    try { out.seeded = await seedImport(dir); } catch (e) { out.seedError = String(e.message ?? e); }
  } else {
    out.seedError = 'seed-import.mjs 未找到（种子导入脚本不进包——敏感/个人数据尊重工作区仓库）；请手动运行 .mcp-servers/seed-import.mjs';
  }
}
console.log(JSON.stringify(out, null, 2));
