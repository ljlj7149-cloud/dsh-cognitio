#!/usr/bin/env node
// build.mjs —— 生成运行入口 lib/（拷贝 src/*.mjs，原生 ESM 无需编译）。
// prepare 钩子执行：clean checkout 后 pnpm install 即产出 lib/，符合官方插件体检口径。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');
const lib = path.join(root, 'lib');
fs.mkdirSync(lib, { recursive: true });
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.mjs'))) {
  fs.copyFileSync(path.join(src, f), path.join(lib, f));
}
// lib/index.mjs = 聚合入口（core.mjs 拷贝后命名 index.mjs，语义为包主入口）
fs.copyFileSync(path.join(src, 'core.mjs'), path.join(lib, 'index.mjs'));
console.log('build: lib/ prepared (' + fs.readdirSync(lib).length + ' files)');
