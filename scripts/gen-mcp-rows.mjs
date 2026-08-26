#!/usr/bin/env node
// cognitio MCP 井行生成器（阶段三边界补偿）——
// DSH 官方形态中 bundle patch 的 insert 行无法相对解析 MCP server 的 command/args
// （patch 只有 name 语义），因此 cognitio 的 MCP 井行仍需放在 preset/宿主层。
// 本脚本生成可直接粘贴进 agent.cordis.yml 的 yml 块（参数化路径与数据目录）。
// 用法：node scripts/gen-mcp-rows.mjs [--data <数据目录>] [--pkgs <安装根>]
//   --data  数据目录（默认 $MEMORY_DIR 或 D:/deepseek/.memory）
//   --pkgs  包安装根（默认 <profile>/node_modules/cognitio-core）
import path from 'node:path';

const args = process.argv.slice(2);
const val = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const dataDir = val('--data', process.env.MEMORY_DIR ?? 'D:/deepseek/.memory');
const pkgRoot = val('--pkgs', '<profile>/node_modules/cognitio-core');
const node = process.execPath.replace(/\\/g, '/');
const posix = (p) => p.replace(/\\/g, '/');

const row = (id, serverName, argFile, env, timeout) => `- id: ${id}
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: ${serverName}
    transport: stdio
    command: '${node}'
    args:
      - '${posix(path.join(pkgRoot, argFile))}'
    env:
      ${env}
    failOnStartupError: true
    toolCallTimeoutMs: ${timeout}`;

const rows = [
  row('cognitio-mcp-memory', 'cognitio-memory', 'src/memory-server.mjs', `MEMORY_DIR: '${posix(dataDir)}'`, 30000),
  row('cognitio-mcp-vault', 'cognitio-vault', 'src/vault-server.mjs', `VAULT_DIR: '${posix(path.dirname(dataDir))}/vault'`, 30000),
];
console.log(`# cognitio MCP 井行（gen-mcp-rows.mjs 生成，粘贴到 agent.cordis.yml；数据目录: ${dataDir}）\n`);
console.log(rows.join('\n\n'));
