#!/usr/bin/env bash
# PandaMart PMS — 生产部署脚本（与现网一致）
#
# 现网拓扑（详见 docs / 团队记忆）：
#   - 代码目录 /opt/pandamart/server（owner www-data），后端监听 127.0.0.1:3001
#   - systemd 服务 pandamart.service（EnvironmentFile=/opt/pandamart/server/.env）
#   - nginx vhost /etc/nginx/sites-enabled/pandapms.conf 反代 -> 3001（复用 *.example.com 证书）
#   - MariaDB 库 pandamart_pms
#   - 生产 .env 留存在服务器上（chmod 600），部署不覆盖
#
# 用法（在仓库根目录执行）：
#   VPS_HOST=YOUR_VPS_HOST SSH_KEY=~/.ssh/id_ed25519 bash scripts/deploy.sh
#
# 流程：本地构建客户端 -> 打包 server（排除 node_modules/dist/uploads/logs/.env）
#       -> scp 到 VPS -> 远端备份 -> 解包 -> npm install -> build -> migrate -> 重启 -> 健康校验
#
# 注意 fail2ban：该 VPS 装了 fail2ban，部署时放慢连接节奏，避免短时大量连接被封。
set -euo pipefail

VPS_HOST="${VPS_HOST:-YOUR_VPS_HOST}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
APP_DIR="/opt/pandamart/server"
TARBALL="pandapms-deploy.tar.gz"
SSH="ssh -o ProxyJump=none -o ConnectTimeout=20 -i ${SSH_KEY} ${VPS_USER}@${VPS_HOST}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== [1/5] 本地构建客户端（输出到 server/public）==="
( cd client && npm run build )

echo "=== [2/5] 打包 server（排除 node_modules/dist/uploads/logs/.env）==="
rm -f "$TARBALL"
tar czf "$TARBALL" -C server \
  --exclude=node_modules --exclude=dist --exclude=uploads --exclude=logs \
  --exclude='.env' --exclude='.env.*' .
echo "tarball: $(du -h "$TARBALL" | cut -f1)"

echo "=== [3/5] 传输到 VPS:/tmp ==="
scp -o ProxyJump=none -o ConnectTimeout=20 -i "$SSH_KEY" "$TARBALL" "${VPS_USER}@${VPS_HOST}:/tmp/$TARBALL"

echo "=== [4/5] 远端部署（备份/解包/install/build/migrate/重启/校验）==="
$SSH "APP=$APP_DIR TARBALL=$TARBALL bash -s" <<'REMOTE'
set -eo pipefail
TS=$(date +%Y%m%d-%H%M%S)
echo "  [backup] -> /opt/pandamart/backup-app-$TS.tar.gz"
cd /opt/pandamart
tar czf backup-app-$TS.tar.gz --exclude='server/node_modules' --exclude='server/uploads' --exclude='server/logs' server
echo "  [extract] overlay -> $APP"
tar xzf /tmp/$TARBALL -C $APP
cd $APP
echo "  [install] npm install --include=dev"
NODE_ENV=development npm install --include=dev --no-audit --no-fund >/tmp/deploy-install.log 2>&1 || { tail -40 /tmp/deploy-install.log; exit 1; }
echo "  [build] tsc"
npm run build >/tmp/deploy-build.log 2>&1 || { tail -40 /tmp/deploy-build.log; exit 1; }
echo "  [migrate]"
npm run migrate >/tmp/deploy-migrate.log 2>&1 || { tail -40 /tmp/deploy-migrate.log; exit 1; }
grep -iE 'Batch|already|run:' /tmp/deploy-migrate.log | tail -2
echo "  [perms] chown www-data + chmod 600 .env"
chown -R www-data:www-data $APP
chmod 600 $APP/.env
echo "  [restart] systemctl restart pandamart"
systemctl restart pandamart
sleep 3
systemctl is-active pandamart
REMOTE

echo "=== [5/5] 健康校验（本机 3001 经远端 curl）==="
$SSH 'curl -sf -m 10 http://127.0.0.1:3001/api/v1/health && echo "" && curl -sf -m 10 http://127.0.0.1:3001/api/v1/ready && echo ""'

echo "=== 部署完成。回滚：解开 /opt/pandamart/backup-app-<ts>.tar.gz 覆盖 server 后 systemctl restart pandamart ==="
