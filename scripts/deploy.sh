#!/usr/bin/env bash
# 部署脚本（git pull 方式）：VPS 从 origin/main 拉取代码 → 只单独传敏感文件 → 远程构建 → pm2 重启。
# 前提：VPS 已按 docs/deploy.md 完成 git clone 首次部署（Node 22 / ffmpeg / pm2 / Caddy）。
# 保证服务器代码 = 远端已验证代码：工作区未提交 / 未 push 的改动永远不会被部署。
#
# 用法: ./scripts/deploy.sh <host> [远程目录]
# 示例: ./scripts/deploy.sh english-vps
#       ./scripts/deploy.sh root@1.2.3.4 /srv/readalong
set -euo pipefail

HOST=${1:?用法: deploy.sh <host> [远程目录]}
APP_DIR=${2:-/opt/english-readalong}

cd "$(dirname "$0")/.."

# 0. 更新远端引用（本地 origin/main 可能过时，先 fetch 保证领先/落后判断准确）
echo "==> 拉取远端引用"
git fetch origin

# 1. 工作区脏检查：未提交的改动不在 git 里，VPS 拉不到，仅警告确认
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠ 工作区有未提交的改动（这些改动不会被部署）："
  git status --short
  read -p "仍要继续吗？[y/N]: " yn
  [[ "$yn" == "y" || "$yn" == "Y" ]] || { echo "已取消"; exit 1; }
fi

# 2. 未 push 提交检测：列出并让用户选择 push 部署最新，还是只部署远端已有版本
UNPUSHED=$(git log origin/main..HEAD --oneline)
if [ -n "$UNPUSHED" ]; then
  echo "本地领先 origin/main，未 push 的提交："
  echo "$UNPUSHED"
  echo
  echo "  1) 先 git push，部署本地最新"
  echo "  2) 不 push，只部署 origin/main 当前版本（本地领先提交保留在本地）"
  read -p "选择 [1/2]: " choice
  case "$choice" in
    1) git push origin main ;;
    2) echo "按 origin/main 部署（本地领先提交保留在本地）" ;;
    *) echo "已取消"; exit 1 ;;
  esac
fi

# 3. VPS 从 git 拉取代码（只动 git 追踪的文件，data/、.env 等 untracked 文件不受影响）
echo "==> $HOST 从 origin/main 拉取代码"
ssh "$HOST" "cd '$APP_DIR' && git fetch origin && git reset --hard origin/main"

# 4. 敏感文件单独传（不进 git，只存在本机与服务器）
echo "==> 传输 .env 与 reset-password.ts（敏感文件，不进 git）"
rsync -q .env "$HOST:$APP_DIR/.env"
if [ -f scripts/reset-password.ts ]; then
  rsync -q scripts/reset-password.ts "$HOST:$APP_DIR/scripts/reset-password.ts"
else
  echo "⚠ 本地没有 scripts/reset-password.ts，跳过（服务器上已有的不会被删）"
fi

# 5. 远程安装依赖并构建（better-sqlite3 预编译包走 npmmirror，避免 VPS 拉 GitHub 超时）
echo "==> 远程安装依赖并构建"
ssh "$HOST" "cd '$APP_DIR' && export npm_config_better_sqlite3_binary_host_mirror=https://registry.npmmirror.com/-/binary/better-sqlite3 && npm ci --silent && npm run build"

# 6. 回填初始星星（幂等）
echo "==> 回填初始星星（幂等）"
ssh "$HOST" "cd '$APP_DIR' && npm run backfill:stars" || echo "backfill failed; continuing; rerun manually"

# 7. pm2 平滑重启
echo "==> pm2 平滑重启"
ssh "$HOST" "cd '$APP_DIR' && (pm2 reload english-readalong 2>/dev/null || pm2 start npm --name english-readalong -- start && pm2 save)"

echo ""
echo "✅ 部署完成"
echo "   查看日志: ssh $HOST \"pm2 logs english-readalong\""
