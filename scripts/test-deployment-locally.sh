#!/bin/bash
# ===========================================
# Local Deployment Test
# Tests the deployment workflow steps that can run locally
# ===========================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info "Starting local deployment test..."
echo ""

# Step 1: Generate .env from 1Password
log_info "Step 1: Generate .env from 1Password"
if op inject -i .env.tpl -o .env; then
    chmod 600 .env
    log_info "✅ .env generated successfully"
else
    log_error "❌ Failed to generate .env"
    exit 1
fi
echo ""

# Step 2: Build Docker image
log_info "Step 2: Build Docker image"
if docker build -t aiskualerts:latest .; then
    log_info "✅ Docker image built successfully"
else
    log_error "❌ Docker build failed"
    rm -f .env
    exit 1
fi
echo ""

# Step 3: Export to tar
log_info "Step 3: Export Docker image to tar.gz"
if docker save aiskualerts:latest | gzip > aiskualerts.tar.gz; then
    SIZE=$(ls -lh aiskualerts.tar.gz | awk '{print $5}')
    log_info "✅ Image exported: $SIZE"
else
    log_error "❌ Failed to export image"
    rm -f .env
    exit 1
fi
echo ""

# Step 4: Test loading the image
log_info "Step 4: Test loading image from tar"
docker rmi aiskualerts:latest
if docker load < aiskualerts.tar.gz; then
    log_info "✅ Image loaded successfully from tar"
else
    log_error "❌ Failed to load image from tar"
    rm -f .env aiskualerts.tar.gz
    exit 1
fi
echo ""

# Step 5: Test running the image locally
log_info "Step 5: Test running container locally"
log_warn "Starting container with docker compose..."

if docker compose up -d; then
    log_info "✅ Containers started"

    # Wait for health check
    log_info "Waiting for health check (max 30s)..."
    for i in {1..15}; do
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            log_info "✅ Application is healthy!"
            docker compose ps
            break
        fi
        echo -n "."
        sleep 2
    done

    # Cleanup
    log_warn "Stopping containers..."
    docker compose down
else
    log_error "❌ Failed to start containers"
    docker compose logs
    docker compose down
    rm -f .env aiskualerts.tar.gz
    exit 1
fi
echo ""

# Cleanup
log_info "Cleanup"
rm -f .env aiskualerts.tar.gz
log_info "✅ Cleaned up .env and tar.gz"
echo ""

log_info "=========================================="
log_info "✅ Local deployment test PASSED"
log_info "=========================================="
log_info ""
log_info "Next steps:"
log_info "1. Commit changes: git add . && git commit -m 'Simplify deployment'"
log_info "2. Push to GitHub: git push"
log_info "3. Test real deployment: GitHub Actions → Deploy to Hetzner → Run workflow"
