#!/bin/bash

# ModeMorph Rollback Script
# Usage: ./scripts/rollback.sh [docker|pm2] [commit-hash]

set -e

DEPLOY_METHOD=${1:-docker}
COMMIT_HASH=${2:-HEAD~1}
APP_NAME="modemorph"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

function log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

function log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🔄 Rolling back $APP_NAME to $COMMIT_HASH..."

# Confirm rollback
read -p "Are you sure you want to rollback to $COMMIT_HASH? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log_info "Rollback cancelled"
    exit 0
fi

# Create backup branch
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"
log_info "Creating backup branch: $BACKUP_BRANCH"
git branch $BACKUP_BRANCH

# Checkout to the specified commit
log_info "Checking out to $COMMIT_HASH..."
git checkout $COMMIT_HASH

if [ "$DEPLOY_METHOD" = "docker" ]; then
    log_info "Rolling back with Docker..."

    # Stop current container
    if docker ps | grep -q $APP_NAME; then
        log_info "Stopping current container..."
        docker stop ${APP_NAME}-app || true
    fi

    # Rebuild and start with old code
    log_info "Rebuilding with previous version..."
    docker compose --profile prod build
    docker compose --profile prod up -d

    log_info "Waiting for application to start..."
    sleep 10

    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        log_info "✅ Rollback successful! Application is healthy."
    else
        log_error "❌ Rollback failed! Application is not responding."
        exit 1
    fi

elif [ "$DEPLOY_METHOD" = "pm2" ]; then
    log_info "Rolling back with PM2..."

    # Rebuild
    pnpm install --frozen-lockfile
    pnpm build

    # Restart PM2
    pm2 restart $APP_NAME || pm2 start pnpm --name $APP_NAME -- start

    sleep 5

    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        log_info "✅ Rollback successful!"
    else
        log_error "❌ Rollback failed!"
        exit 1
    fi

else
    log_error "Unknown deployment method: $DEPLOY_METHOD"
    exit 1
fi

cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Rollback completed successfully!

Current state:
  - Running version: $COMMIT_HASH
  - Backup created: $BACKUP_BRANCH

To restore to the latest version:
  git checkout main
  ./scripts/deploy.sh $DEPLOY_METHOD

To permanently keep this version:
  git checkout main
  git reset --hard $COMMIT_HASH
  git push --force
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
