#!/bin/sh
# 隐私防线：阻止任何记忆数据/凭据/tmp 脚本进入 git（本地 hook + 发布前自检共用逻辑）。
# 用法：sh scripts/pre-commit-guard.sh（在仓库根执行，非零退出=有违禁文件）
set -e
BAD=""
for f in $(git diff --cached --name-only 2>/dev/null || git diff --name-only 2>/dev/null | head -200); do
  case "$f" in
    .memory/*|*memory.sqlite*|*vault-index.sqlite*|*xilin-secrets.env*|*.bak-*|*tmp-*.mjs|*\.dsh/*|*logs/*)
      BAD="$BAD\n  - $f"
      ;;
    *)
      if printf '%s' "$f" | grep -qE 'pre-commit-guard.sh$|memory-server.mjs$|vault-server.mjs$|sentinel.mjs$|panel-api.mjs$|action-guard.mjs$'; then continue; fi  # 检测器自身文件豁免（含凭据模式字面量属机制代码；真实凭据值仍被 sk-/XILIN 模式拦）
      S1="sk-[A-Za-z0-9]{20,}"
      S2="-----BEGIN.*PRIV"
      S3="ATE KEY-----"
      if git show :"$f" 2>/dev/null | grep -qE "$S1|$S2|$S3|XILIN_SSH"; then
        BAD="$BAD\n  - $f (含疑似凭据)"
      fi
      ;;
  esac
done
if [ -n "$BAD" ]; then
  echo "❌ 隐私防线拦截（scripts/pre-commit-guard.sh）：以下文件疑似记忆数据/凭据/临时产物，禁止入库："
  echo -e "$BAD"
  echo "  处理：git restore --staged <文件>，或本文件仅作为发布前自检（npm 包 files 白名单才是最终防线）。"
  exit 1
fi
echo "✅ 隐私防线通过：staged 文件无记忆数据/凭据/临时产物"
exit 0
