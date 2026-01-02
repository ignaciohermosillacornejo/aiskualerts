#!/bin/bash
# ===========================================
# Deployment script for Hetzner Cloud
# ===========================================
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="aiskualerts"
APP_DIR="/opt/${APP_NAME}"
DEPLOY_USER="deploy"
GITHUB_REPO="${GITHUB_REPOSITORY:-nach/aiskualerts}"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root or with sudo"
    exit 1
fi

log_info "Starting deployment for ${APP_NAME}..."

# Install required packages if not present
log_info "Checking for required packages..."
if ! command -v docker &> /dev/null; then
    log_info "Installing Docker..."
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release

    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Set up the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    log_info "Docker installed successfully"
else
    log_info "Docker already installed"
fi

# Install 1Password CLI if not present
if ! command -v op &> /dev/null; then
    log_info "Installing 1Password CLI..."
    curl -sSfLo /tmp/op.zip https://cache.agilebits.com/dist/1P/op2/pkg/v2.34.0/op_linux_amd64_v2.34.0.zip
    unzip -o /tmp/op.zip -d /usr/local/bin
    rm /tmp/op.zip
    chmod +x /usr/local/bin/op
    log_info "1Password CLI installed successfully"
else
    log_info "1Password CLI already installed"
fi

# Create deploy user if it doesn't exist
if ! id "$DEPLOY_USER" &> /dev/null; then
    log_info "Creating ${DEPLOY_USER} user..."
    useradd -m -s /bin/bash "$DEPLOY_USER"
    usermod -aG docker "$DEPLOY_USER"
else
    log_info "User ${DEPLOY_USER} already exists"
fi

# Create application directory
log_info "Setting up application directory..."
mkdir -p "$APP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

# Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
    log_info "Updating existing repository..."
    cd "$APP_DIR"
    sudo -u "$DEPLOY_USER" git fetch --all
    sudo -u "$DEPLOY_USER" git reset --hard "origin/${GIT_BRANCH:-main}"
else
    log_info "Cloning repository..."
    sudo -u "$DEPLOY_USER" git clone "https://github.com/${GITHUB_REPO}.git" "$APP_DIR"
    cd "$APP_DIR"
    sudo -u "$DEPLOY_USER" git checkout "${GIT_BRANCH:-main}"
fi

# Inject secrets from 1Password directly on the server
if [ ! -f "$APP_DIR/.env.tpl" ]; then
    log_error ".env.tpl file not found in $APP_DIR"
    log_error "Make sure .env.tpl is committed to the repository"
    exit 1
fi

log_info "Injecting secrets from 1Password using op inject..."

# Check if OP_SERVICE_ACCOUNT_TOKEN is set
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    log_error "OP_SERVICE_ACCOUNT_TOKEN environment variable is required"
    log_error "This should be passed from the CI/CD workflow"
    exit 1
fi

# Run op inject as deploy user to generate .env file
cd "$APP_DIR"
if sudo -u "$DEPLOY_USER" OP_SERVICE_ACCOUNT_TOKEN="$OP_SERVICE_ACCOUNT_TOKEN" op inject -i .env.tpl -o .env; then
    chmod 600 .env
    chown "$DEPLOY_USER:$DEPLOY_USER" .env
    log_info "✅ Secrets injected successfully from 1Password"
    log_info "   Deployment will fail loudly if any op://... reference is unresolved"
else
    log_error "❌ Failed to inject secrets from 1Password"
    log_error "   Check that all secrets exist in 1Password Dev vault"
    exit 1
fi

# Stop existing containers
log_info "Stopping existing containers..."
cd "$APP_DIR"
sudo -u "$DEPLOY_USER" docker compose down || true

# Pull latest images
log_info "Pulling latest images..."
sudo -u "$DEPLOY_USER" docker compose pull postgres nginx || true

# Build and start containers
log_info "Building and starting containers..."
sudo -u "$DEPLOY_USER" docker compose up -d --build

# Wait for services to be healthy
log_info "Waiting for services to start..."
sleep 10

# Check health
if sudo -u "$DEPLOY_USER" docker compose ps | grep -q "unhealthy"; then
    log_error "Some services are unhealthy!"
    sudo -u "$DEPLOY_USER" docker compose ps
    sudo -u "$DEPLOY_USER" docker compose logs --tail=50
    exit 1
fi

# Cleanup old images
log_info "Cleaning up old Docker images..."
docker image prune -f

log_info "Deployment completed successfully!"
log_info "Application is running at http://localhost:3000"
log_info "Nginx is running at http://localhost:80"

# Show status
log_info "Container status:"
sudo -u "$DEPLOY_USER" docker compose ps
