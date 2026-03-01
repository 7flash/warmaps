#!/bin/bash
# deploy.sh — Deploy WARMAPS to production server
# Usage: ./deploy.sh [password]
# Or: SSH_PASS=xxx ./deploy.sh

set -e

SERVER="root@202.155.132.139"
REMOTE_DIR="/opt/warmaps"
PORT=4444

echo "⚔ WARMAPS Deployment"
echo "═══════════════════════════════════"

# 1. Create remote directory
echo "📁 Setting up remote directory..."
ssh $SERVER "mkdir -p $REMOTE_DIR"

# 2. Sync files (exclude node_modules, .git)
echo "📦 Syncing files..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'bun.lockb' \
    ./ $SERVER:$REMOTE_DIR/

# 3. Install dependencies on server
echo "📥 Installing dependencies..."
ssh $SERVER "cd $REMOTE_DIR && bun install"

# 4. Set up systemd service
echo "🔧 Configuring systemd service..."
ssh $SERVER "cat > /etc/systemd/system/warmaps.service << 'EOF'
[Unit]
Description=WARMAPS Global Conflict Monitor
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/warmaps
ExecStart=/root/.bun/bin/bun run server.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=BUN_PORT=4444

[Install]
WantedBy=multi-user.target
EOF"

# 5. Reload and restart
echo "🚀 Starting service..."
ssh $SERVER "systemctl daemon-reload && systemctl enable warmaps && systemctl restart warmaps"

# 6. Check status
echo ""
echo "📊 Service status:"
ssh $SERVER "systemctl status warmaps --no-pager -l" || true

echo ""
echo "═══════════════════════════════════"
echo "⚔ WARMAPS deployed to http://202.155.132.139:$PORT"
echo "═══════════════════════════════════"
