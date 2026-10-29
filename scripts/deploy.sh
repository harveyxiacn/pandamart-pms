#!/usr/bin/env bash
# PandaMart PMS — production deployment script
#
# Everything host-specific is supplied by the environment; there are no
# defaults pointing at a real machine. Set:
#   VPS_HOST   remote host (IP or DNS name)                       [required]
#   VPS_USER   remote user for the deploy connection              (default: deploy)
#   SSH_KEY    path to the private key for that connection        (default: ~/.ssh/id_ed25519)
#   APP_DIR    absolute path of the server directory on the host   (default: /srv/pandamart/server)
#   APP_NAME   systemd unit to restart                            (default: pandamart)
#   APP_OWNER  user that owns the deployed files                  (default: www-data)
#
# Usage (from the repository root):
#   VPS_HOST=203.0.113.10 SSH_KEY=~/.ssh/id_ed25519 bash scripts/deploy.sh
#
# Flow: build the client locally -> tar the server (minus node_modules/dist/
#       uploads/logs/.env) -> scp to the host -> back up the previous release ->
#       extract -> npm install -> build -> migrate -> restart -> health check
#
# The remote .env is never overwritten by a deploy: it lives on the server,
# owned by the service account, mode 600.
set -euo pipefail

VPS_HOST="${VPS_HOST:?set VPS_HOST to the deployment target}"
VPS_USER="${VPS_USER:-deploy}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
APP_DIR="${APP_DIR:-/srv/pandamart/server}"
APP_NAME="${APP_NAME:-pandamart}"
APP_OWNER="${APP_OWNER:-www-data}"
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
$SSH "APP=$APP_DIR TARBALL=$TARBALL APP_NAME=$APP_NAME APP_OWNER=$APP_OWNER bash -s" <<'REMOTE'
set -eo pipefail
TS=$(date +%Y%m%d-%H%M%S)
ROOT_DIR="$(dirname "$APP")"
echo "  [backup] -> $ROOT_DIR/backup-app-$TS.tar.gz"
cd "$ROOT_DIR"
tar czf backup-app-$TS.tar.gz --exclude='server/node_modules' --exclude='server/uploads' --exclude='server/logs' server
echo "  [extract] clean sources then overlay -> $APP"
# The tarball is an overlay: files deleted from the repo would otherwise stay
# behind and break tsc (e.g. a removed model still importing a removed type).
# uploads/logs/.env/node_modules are never touched.
rm -rf "$APP/src" "$APP/public" "$APP/dist"
tar xzf /tmp/$TARBALL -C $APP
cd $APP
echo "  [install] npm install --include=dev"
NODE_ENV=development npm install --include=dev --no-audit --no-fund >/tmp/deploy-install.log 2>&1 || { tail -40 /tmp/deploy-install.log; exit 1; }
echo "  [build] tsc"
npm run build >/tmp/deploy-build.log 2>&1 || { tail -40 /tmp/deploy-build.log; exit 1; }
echo "  [migrate]"
npm run migrate >/tmp/deploy-migrate.log 2>&1 || { tail -40 /tmp/deploy-migrate.log; exit 1; }
grep -iE 'Batch|already|run:' /tmp/deploy-migrate.log | tail -2
echo "  [perms] chown $APP_OWNER + chmod 600 .env"
chown -R "$APP_OWNER:$APP_OWNER" $APP
chmod 600 $APP/.env
echo "  [restart] systemctl restart $APP_NAME"
systemctl restart "$APP_NAME"
sleep 3
systemctl is-active "$APP_NAME"
REMOTE

echo "=== [5/5] 健康校验（远端本机 127.0.0.1:3001）==="
$SSH 'curl -sf -m 10 http://127.0.0.1:3001/api/v1/health && echo "" && curl -sf -m 10 http://127.0.0.1:3001/api/v1/ready && echo ""'

echo "=== 部署完成。回滚：解开 $APP_DIR/../backup-app-<ts>.tar.gz 覆盖 server 后 systemctl restart $APP_NAME ==="
