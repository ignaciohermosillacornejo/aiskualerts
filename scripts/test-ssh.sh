#!/bin/bash
# ===========================================
# Test SSH connection to Hetzner server
# ===========================================
set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if server IP is provided
if [ -z "${1:-}" ]; then
    log_error "Usage: $0 <server-ip>"
    log_info "Example: $0 195.201.123.45"
    exit 1
fi

SERVER_IP="$1"

log_info "Testing SSH connection to Hetzner server: $SERVER_IP"

# Check if 1Password CLI is installed
if ! command -v op &> /dev/null; then
    log_error "1Password CLI is not installed"
    log_info "Install it with: brew install --cask 1password-cli"
    exit 1
fi

# Create temporary SSH key file
TMP_KEY="/tmp/hetzner_test_key_$$"
trap "rm -f $TMP_KEY" EXIT

log_info "Retrieving SSH private key from 1Password..."
if ! op read "op://Dev/HETZNER_SSH_KEY/private key" > "$TMP_KEY" 2>/dev/null; then
    log_error "Failed to retrieve SSH key from 1Password"
    log_info "Make sure you're signed in: op signin"
    exit 1
fi

chmod 600 "$TMP_KEY"
log_info "SSH key retrieved successfully"

# Test SSH connection
log_info "Testing SSH connection..."
if ssh -i "$TMP_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@$SERVER_IP" "echo 'SSH connection successful'" 2>/dev/null; then
    log_info "✅ SSH connection successful!"

    # Get server info
    log_info "Fetching server information..."
    echo ""
    echo "═══════════════════════════════════════"
    echo "Server Information"
    echo "═══════════════════════════════════════"

    ssh -i "$TMP_KEY" -o StrictHostKeyChecking=no "root@$SERVER_IP" << 'ENDSSH'
echo "Hostname: $(hostname)"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Uptime: $(uptime -p)"
echo "CPU: $(nproc) cores"
echo "Memory: $(free -h | awk '/^Mem:/ {print $2}')"
echo "Disk: $(df -h / | awk 'NR==2 {print $2 " total, " $4 " available"}')"
echo ""
echo "Docker installed: $(command -v docker &>/dev/null && echo 'Yes' || echo 'No')"
if command -v docker &>/dev/null; then
    echo "Docker version: $(docker --version | awk '{print $3}' | tr -d ',')"
fi
echo ""
echo "1Password CLI installed: $(command -v op &>/dev/null && echo 'Yes' || echo 'No')"
if command -v op &>/dev/null; then
    echo "1Password version: $(op --version)"
fi
ENDSSH

    echo "═══════════════════════════════════════"
    echo ""

    # Check if app is deployed
    if ssh -i "$TMP_KEY" -o StrictHostKeyChecking=no "root@$SERVER_IP" "[ -d /opt/aiskualerts ]" 2>/dev/null; then
        log_info "Application is deployed at /opt/aiskualerts"

        echo "═══════════════════════════════════════"
        echo "Application Status"
        echo "═══════════════════════════════════════"

        ssh -i "$TMP_KEY" -o StrictHostKeyChecking=no "root@$SERVER_IP" << 'ENDSSH'
cd /opt/aiskualerts 2>/dev/null || exit 0

if command -v docker &>/dev/null && [ -f docker-compose.yml ]; then
    echo "Docker Compose Status:"
    docker compose ps 2>/dev/null || echo "  No containers running"
    echo ""

    # Check health endpoint
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo "Health Check: ✅ Healthy"
    else
        echo "Health Check: ❌ Failed"
    fi
fi
ENDSSH

        echo "═══════════════════════════════════════"
    else
        log_warn "Application not yet deployed"
    fi

    echo ""
    log_info "Connection test complete!"
    log_info "To SSH into the server, run:"
    echo "  op read 'op://Dev/HETZNER_SSH_KEY/private key' | ssh -i /dev/stdin root@$SERVER_IP"

else
    log_error "❌ SSH connection failed!"
    log_info "Troubleshooting steps:"
    echo "  1. Verify server IP is correct: $SERVER_IP"
    echo "  2. Check if SSH key is in server's authorized_keys"
    echo "  3. Verify firewall allows SSH (port 22)"
    echo "  4. Check server status in Hetzner Cloud Console"
    exit 1
fi
