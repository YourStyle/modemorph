#!/bin/bash

# GitHub Actions Self-Hosted Runner Setup Script for ModeMorph
# This script helps set up a GitHub Actions runner on your VPS

set -e

echo "🔧 Setting up GitHub Actions Self-Hosted Runner"

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

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run this script as root"
    exit 1
fi

# Check OS
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    log_error "This script is designed for Linux. Please install manually for other OS."
    exit 1
fi

# Install dependencies
log_info "Installing dependencies..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    log_warn "Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    log_info "Docker installed. You may need to log out and back in for group changes to take effect."
else
    log_info "✅ Docker is already installed"
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    log_warn "Docker Compose is not installed. Installing..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
else
    log_info "✅ Docker Compose is already installed"
fi

# Install Node.js using nvm (if not already installed)
if ! command -v node &> /dev/null; then
    log_warn "Node.js is not installed. Installing via nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20.18.1
    nvm use 20.18.1
else
    log_info "✅ Node.js is already installed ($(node -v))"
fi

# Install pnpm
if ! command -v pnpm &> /dev/null; then
    log_info "Installing pnpm..."
    npm install -g pnpm@9.15.0
else
    log_info "✅ pnpm is already installed ($(pnpm -v))"
fi

# Install PM2 (optional, for non-Docker deployments)
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
    pm2 startup
else
    log_info "✅ PM2 is already installed"
fi

echo ""
log_info "📋 Prerequisites installed!"
echo ""

# GitHub Actions Runner Setup Instructions
cat << 'EOF'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 GitHub Actions Self-Hosted Runner Setup Instructions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to your GitHub repository:
   https://github.com/YourStyle/modemorph/settings/actions/runners/new

2. Select "Linux" as the operating system

3. Follow the commands provided by GitHub to:
   - Download the runner
   - Configure it
   - Run it as a service

4. Example commands (replace TOKEN with your actual token):

   mkdir actions-runner && cd actions-runner
   curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
   tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
   ./config.sh --url https://github.com/YourStyle/modemorph --token YOUR_TOKEN
   sudo ./svc.sh install
   sudo ./svc.sh start

5. Verify the runner is online in:
   https://github.com/YourStyle/modemorph/settings/actions/runners

6. Set up GitHub Secrets for your repository:
   - Go to: https://github.com/YourStyle/modemorph/settings/secrets/actions
   - Add the following secrets:
     • NEXT_PUBLIC_SUPABASE_URL
     • NEXT_PUBLIC_SUPABASE_ANON_KEY
     • SUPABASE_SERVICE_ROLE_KEY
     • NEXT_PUBLIC_AI_API_URL
     • YANDEX_S3_ACCESS_KEY_ID
     • YANDEX_S3_SECRET_ACCESS_KEY
     • YANDEX_S3_BUCKET_NAME
     • YANDEX_S3_REGION
     • YANDEX_S3_ENDPOINT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Setup complete! Your server is ready for CI/CD deployments.

Next steps:
  1. Configure the GitHub Actions runner using the commands above
  2. Push code to the 'main' branch to trigger automatic deployment
  3. Monitor deployments at: https://github.com/YourStyle/modemorph/actions

EOF
