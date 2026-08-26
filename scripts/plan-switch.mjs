#!/usr/bin/env node
// plan-switch.mjs —— 4 preset 挂载切换的 dry-run 计划器（只读，不修改任何文件）。
// 扫描 ~/.dsh/.agent-presets/*/agent.cordis.yml 中 cognitio 旧四行：
//   sentinel-recall / error-capture / turn-archive / action-guard
// 输出：每文件位置清单 + 双挂风险检查（旧四行残留 vs dsh-cognitio-core 新行并存）。
// 用法：node scripts/plan-switch.mjs [--presets <根目录>]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = process.argv.includes('--presets')
  ? process.argv[process.argv.indexOf('--presets') + 1]
  : path.join(process.env.HOME ?? os.homedir(), '.dsh', '.agent-presets');

const OLD_IDS = ['sentinel-recall', 'error-capture', 'turn-archive', 'action-guard'];
const NEW_ID = 'dsh-cognitio-core';

const files = fs.readdirSync(root).filter(d => {
  try { return fs.statSync(path.join(root, d)).isDirectory(); } catch { return false; }
}).map(d => path.join(root, d, 'agent.cordis.yml')).filter(f => fs.existsSync(f));

const plan = { root, presets: [], total_old_rows: 0, dual_mount_risk: [] };
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const found = [];
  for (const id of OLD_IDS) {
    lines.forEach((ln, i) => {
      if (ln.trim().startsWith(`- id: ${id}`)) found.push({ id, line: i + 1 });
    });
  }
  const hasNew = lines.some(ln => ln.trim().startsWith(`- id: ${NEW_ID}`));
  if (found.length > 0 || hasNew) {
    plan.presets.push({ file: f.replace(/\\/g, '/'), old_rows: found, new_row_present: hasNew });
    plan.total_old_rows += found.length;
    if (found.length > 0 && hasNew) plan.dual_mount_risk.push({ file: f.replace(/\\/g, '/'), note: '新旧并行 = 双挂风险（同键重复监听/重复注入）' });
  }
}
console.log(JSON.stringify(plan, null, 2));
console.log(`\n检查项：共 ${plan.presets.length} 个 preset 含 cognitio 行；旧四行总计 ${plan.total_old_rows} 处；双挂风险 ${plan.dual_mount_risk.length} 处。`);
console.log('切换步骤（用户确认后执行）：1) dsh plugin add dsh-cognitio-core → 2) 按上表逐文件删除旧四行 → 3) 重启验证。');
