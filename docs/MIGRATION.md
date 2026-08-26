# MIGRATION —— 跨机器移植手册（三步 + 边界）

> 目标：在新机器上把 cognitio 认知架构装起来，从"git 克隆"到"哨兵在跑"。
> 前置：DSH 已装（node >=22）、pnpm 可用。

## 三步

### 第 1 步：克隆 + 安装包

```sh
git clone <cognitio 仓库> cognitio
cd cognitio/cognitio-plugin
pnpm install                       # 拉 @modelcontextprotocol/sdk + zod（pnpm-lock 锁定）
# 若从 npm 安装则无需此步：dsh plugin --profile <p> add dsh-cognitio-core
```

### 第 2 步：挂载（事件插件 + MCP 井）

```sh
# 生成 MCP 井行（memory/vault）——粘贴到 agent.cordis.yml
node scripts/gen-mcp-rows.mjs --data <数据目录> --pkgs <profile>/node_modules/dsh-cognitio-core
```

- 事件插件：把 `cordis.patch.yml` 的 insert 行（id: dsh-cognitio-core）加入 preset（或用 dsh plugin add 自动 reconcile）
- **切换注意**：替换旧四行（sentinel-recall/error-capture/turn-archive/action-guard）时原子操作，禁止新旧同挂
- MCP 井行：`dsh-mcp-client` 行如生成器输出（官方形态 patch 无法相对解析 command/args，此为已知边界——井行留在 preset 层）

### 第 3 步：数据 init

```sh
node scripts/init.mjs --dir <数据目录>            # 建库（SQLite + notes/）
node scripts/init.mjs --seed                      # 可选：种子导入（须跳过后人工跑 seed-import.mjs）
cp -r <旧机>/.memory/notes <数据目录>/            # 可选：带旧记忆迁移（SQLite 与 notes 一起拷）
```

## 边界与红线（诚实声明）

1. **MCP 井行不进 bundle patch**：command/args 无法从包内相对解析（官方形态限制）；用生成器输出到 preset。
2. **技能随包但需 preset 声明**：`skills/` 随包安装后，在 preset 的 `skill-filesystem.customSkillDirs` 加 `<profile>/node_modules/dsh-cognitio-core/skills`。
3. **数据不随包**：记忆是个人资产，不 vendor；迁移靠 `--data` 参数与 notes 拷贝。
4. **种子导入不进包**：seed-import.mjs 留在工作区（含敏感历史数据语义，尊重工作区仓库）。
5. **默认路径兼容**：代码默认仍指 `D:/deepseek/.memory`（生产库），跨机器请显式传 `MEMORY_DIR`/`--data`。
6. 真机生效需重启（哨兵/井行为变更），回滚 = 删行 + 恢复旧四行。

## 验证清单（装完跑）

```sh
node --test ../.mcp-servers/memory-server.test.mjs ../.mcp-servers/sentinel-plugin.test.mjs ../.mcp-servers/p2-plugins.test.mjs   # 4/4 绿
# 重启后：injection_log 出现 pre-step-* 行；负结果纸条带显式指令；vault_search 可应答
# 打包完整性自检（跨机器模拟，2026-08-27 实测 PASS）：
pnpm pack && mkdir /tmp/pc && tar -xzf dsh-cognitio-core-*.tgz -C /tmp/pc && cd /tmp/pc/package && pnpm install && node -e "import('node:url').then(async u => { const base = u.pathToFileURL(process.cwd()).href; const m = await import(base + '/lib/index.mjs'); const reg=[]; m.default.apply({on:(e,f)=>reg.push(e)}); console.log('events:', reg.length); })"
```
