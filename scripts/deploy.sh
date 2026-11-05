#!/usr/bin/env bash
# 部署脚本（票 07）：同步代码到 VPS → 远程构建 → pm2 平滑重启。
# 前提：服务器已完成 docs/deploy.md 的一次性准备（Node 22 / ffmpeg / pm2 / Caddy）。
#
# 用法: ./scripts/deploy.sh <user@host> <域名> [远程目录]
# 示例: ./scripts/deploy.sh root@1.2.3.4 english.example.com
#       ./scripts/deploy.sh root@1.2.3.4 english.example.com /srv/readalong
set -euo pipefail

HOST=${1:?用法: deploy.sh <user@host> <域名> [远程目录]}
DOMAIN=${2:?需要域名（iPad 麦克风要求 HTTPS，纯 IP 不可行）}
APP_DIR=${3:-/opt/english-readalong}

cd "$(dirname "$0")/.."

echo "==> 同步代码到 $HOST:$APP_DIR（.env 单独传；服务器上的 data/ 运行数据不会被删除）"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude .env \
  --exclude data \
  --exclude materials \
  --exclude .scratch \
  --exclude research \
  --exclude docs \
  --exclude .claude \
  --exclude scripts/reset-password.ts \
  ./ "$HOST:$APP_DIR/"

echo "==> 传输 .env（讯飞密钥，不进 git）"
scp -q .env "$HOST:$APP_DIR/.env"

echo "==> 远程安装依赖并构建（better-sqlite3 预编译包走 npmmirror，避免 VPS 拉 GitHub 超时）"
ssh "$HOST" "cd '$APP_DIR' && export npm_config_better_sqlite3_binary_host_mirror=https://registry.npmmirror.com/-/binary/better-sqlite3 && npm ci --silent && npm run build"

echo "==> 回填初始星星（幂等）"
ssh "$HOST" "cd '$APP_DIR' && npm run backfill:stars"

echo "==> pm2 平滑重启"
ssh "$HOST" "cd '$APP_DIR' && (pm2 reload english-readalong 2>/dev/null || pm2 start npm --name english-readalong -- start && pm2 save)"

echo ""
echo "✅ 部署完成: https://$DOMAIN"
echo "   查看日志: ssh $HOST \"pm2 logs english-readalong\""
