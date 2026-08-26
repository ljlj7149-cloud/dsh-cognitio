#!/usr/bin/env node
// apply-switch.mjs —— 4/5 preset 挂载切换执行器（原子：备份→删旧行→提示安装顺序；默认 dry-run）
//
// 背景（2026-08-27 核实）：dsh plugin 是 pnpm 转发器——`add file:D:/deepseek/cognitio-plugin`
// 可直接装本地包；但安装后 bundle patch 在下次启动自动挂载（host 层），与 preset 旧行并存=双挂
// （同事件双监听=重复注入，会话退化）。故切换必须原子：先删旧行（本脚本），再安装，再重启。
//
// 用法：
//   node scripts/apply-switch.mjs            # dry-run：只显示将执行的动作，不改任何文件
//   node scripts/apply-switch.mjs --apply    # 执行：备份 5 preset → 删除旧的 17 行
//   node scripts/apply-switch.mjs --rollback # 回滚：还原备份
//
// 切换后的完整序列（用户确认后执行）：
//   1) node scripts/apply-switch.mjs --apply        （删旧行，本脚本）
//   2) dsh plugin --profile web add file:D:/deepseek/cognitio-plugin   （装本地包）
//   3) dsh --profile web --dump-config 确认组合树含 cognitio-core 一行（canary 前只读检查）
//   4) 用户重启 → 观察：注入行为一致、无重复注入；injection_log 出现新 hook（fallback/recall-hit）
// 回滚：apply-switch --rollback + dsh plugin --profile web remove dsh-cognitio-core + 重启
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.join(process.env.HOME ?? os.homedir(), '.dsh', '.agent-presets');
const BACKUP_DIR = path.join(process.env.HOME ?? os.homedir(), '.dsh', '.agent-presets', '.switch-backups');
const OLD_IDS = ['sentinel-recall', 'error-capture', 'turn-archive', 'action-guard'];

const files = fs.readdirSync(root).filter(d => {
  try { return fs.statSync(path.join(root, d)).isDirectory(); } catch { return false; }
}).map(d => path.join(root, d, 'agent.cordis.yml')).filter(f => fs.existsSync(f));

const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--rollback') ? 'rollback' : 'dry';

if (mode === 'rollback') {
  if (!fs.existsSync(BACKUP_DIR)) { console.log('无备份可回滚（' + BACKUP_DIR + '）'); process.exit(0); }
  for (const f of files) {
    const bak = path.join(BACKUP_DIR, path.basename(path.dirname(f)) + '.cordis.yml.bak');
    if (fs.existsSync(bak)) {
      fs.copyFileSync(bak, f);
      console.log('回滚:', path.dirname(f));
    }
  }
  console.log('回滚完成（提示：还需 dsh plugin remove 与重启）');
  process.exit(0);
}

let total = 0;
console.log(`模式: ${mode === 'dry' ? 'dry-run（不修改）' : 'EXECUTE（修改文件）'}\n`);
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const delLines = [];
  for (const id of OLD_IDS) {
    lines.forEach((ln, i) => {
      if (ln.trim().startsWith(`- id: ${id}`)) delLines.push(i);
    });
  }
  if (delLines.length === 0) continue;
  const delSet = new Set(delLines);
  // 删除该行及其上方紧邻的注释块（注释块 = 该行之前连续的 # 注释行）
  const finalDel = new Set(delSet);
  for (const i of delSet) {
    let j = i - 1;
    while (j >= 0 && lines[j].trimStart().startsWith('#')) { finalDel.add(j); j--; }
  }
  const keep = lines.filter((_, i) => !finalDel.has(i));
  console.log(`${path.basename(path.dirname(f))}: ${[...delSet].sort((a,b)=>a-b).map(x => x + 1).join(',')} 行（含注释 ${finalDel.size - delSet.size} 行）`);
  total += delSet.size;
  if (mode === 'apply') {
    const bakDir = BACKUP_DIR;
    fs.mkdirSync(bakDir, { recursive: true });
    const bak = path.join(bakDir, path.basename(path.dirname(f)) + '.cordis.yml.bak');
    fs.copyFileSync(f, bak);
    fs.writeFileSync(f, keep.join('\n'));
    console.log(`  已备份 → ${bak}`);
  }
}
console.log(`\n待删除旧行总计: ${total}`);
if (mode === 'dry') console.log('dry-run 完成。确认无误后执行: node scripts/apply-switch.mjs --apply');
else console.log('执行完成。下一步: dsh plugin --profile web add file:D:/deepseek/cognitio-plugin → dump-config 检查 → 用户重启验收');
