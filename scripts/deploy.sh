#!/bin/bash

# ModeMorph Deployment Script
# Usage: ./scripts/deploy.sh [docker|pm2]

set -e  # Exit on error

DEPLOY_METHOD=${1:-docker}
APP_NAME="modemorph"

echo "🚀 Starting deployment of $APP_NAME using $DEPLOY_METHOD method..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

function log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f .env ]; then
    log_error ".env file not found! Please create it first."
    exit 1
fi

if [ "$DEPLOY_METHOD" = "docker" ]; then
    log_info "Deploying with Docker + Caddy..."

    # Check if .env has DOMAIN configured
    if [ ! -f .env ] || ! grep -q "DOMAIN=" .env; then
        log_warn "DOMAIN not found in .env file. Using localhost."
        echo "DOMAIN=localhost" >> .env
    fi

    # Stop and remove old containers
    log_info "Stopping existing containers..."
    docker compose --profile prod down || true

    # Build new image
    log_info "Building Docker image..."
    docker compose --profile prod build

    # Start new containers (app + caddy)
    log_info "Starting new containers..."
    docker compose --profile prod up -d

    # Wait for health check
    log_info "Waiting for application to be healthy..."
    sleep 15

    # Check if containers are running
    if docker ps | grep -q "${APP_NAME}-app" && docker ps | grep -q "${APP_NAME}-caddy"; then
        log_info "✅ Containers are running"

        # Check health endpoint through Caddy
        DOMAIN=$(grep DOMAIN .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
        if [ "$DOMAIN" = "localhost" ]; then
            HEALTH_URL="http://localhost/api/health"
        else
            HEALTH_URL="https://${DOMAIN}/api/health"
        fi

        log_info "Checking health endpoint: $HEALTH_URL"
        sleep 5  # Give Caddy time to start

        if curl -f -k "$HEALTH_URL" > /dev/null 2>&1; then
            log_info "✅ Health check passed through Caddy"
        else
            log_warn "⚠️  Health check through Caddy failed, checking direct connection..."
            if docker exec ${APP_NAME}-app wget -q -O- http://localhost:3000/api/health > /dev/null 2>&1; then
                log_info "✅ App is healthy (direct check), Caddy might need time to get SSL cert"
            else
                log_error "❌ App health check failed"
            fi
        fi

        # Show logs
        log_info "Recent app logs:"
        docker logs --tail 20 ${APP_NAME}-app

        log_info "Recent Caddy logs:"
        docker logs --tail 10 ${APP_NAME}-caddy
    else
        log_error "❌ Containers failed to start"
        docker logs ${APP_NAME}-app --tail 30
        docker logs ${APP_NAME}-caddy --tail 30
        exit 1
    fi

    # Clean up old images
    log_info "Cleaning up old images..."
    docker image prune -f

    log_info "🎉 Deployment completed successfully!"
    log_info "Your site is available at: $HEALTH_URL"

elif [ "$DEPLOY_METHOD" = "pm2" ]; then
    log_info "Deploying with PM2..."

    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 is not installed. Install it with: npm install -g pm2"
        exit 1
    fi

    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile

    # Build application
    log_info "Building application..."
    pnpm build

    # Stop existing application
    if pm2 list | grep -q $APP_NAME; then
        log_info "Stopping existing application..."
        pm2 stop $APP_NAME
        pm2 delete $APP_NAME
    fi

    # Start application
    log_info "Starting application with PM2..."
    pm2 start pnpm --name $APP_NAME -- start

    # Save PM2 process list
    pm2 save

    # Wait for startup
    sleep 5

    # Check health
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        log_info "✅ Health check passed"
    else
        log_warn "⚠️  Health check failed"
    fi

    # Show status
    pm2 status

    log_info "🎉 Deployment completed successfully!"

else
    log_error "Unknown deployment method: $DEPLOY_METHOD"
    echo "Usage: $0 [docker|pm2]"
    exit 1
fi

echo ""
log_info "Application is available at: http://localhost:3000"
log_info "Health endpoint: http://localhost:3000/api/health"
