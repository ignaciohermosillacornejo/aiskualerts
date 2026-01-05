#!/bin/bash
# ===========================================
# One-time server provisioning script
# Run this ONCE on a new Hetzner server
# ===========================================
set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[PROVISION]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root"
    exit 1
fi

log_info "Starting one-time server provisioning..."

# 1. Install Docker if not present
if ! command -v docker &> /dev/null; then
    log_info "Installing Docker from Ubuntu repository..."
    apt-get update
    apt-get install -y docker.io docker-compose-v2

    log_info "✅ Docker installed"
else
    log_info "✅ Docker already installed"
fi

# 2. Create deploy user if not exists
if ! id deploy &> /dev/null; then
    log_info "Creating deploy user..."
    useradd -m -s /bin/bash deploy
    log_info "✅ Created deploy user"
else
    log_info "✅ Deploy user already exists"
fi

# 3. Add deploy user to docker group
if ! groups deploy | grep -q docker; then
    log_info "Adding deploy user to docker group..."
    usermod -aG docker deploy
    log_info "✅ Deploy user added to docker group"
else
    log_info "✅ Deploy user already in docker group"
fi

# 4. Create application directory
log_info "Creating application directory..."
mkdir -p /opt/aiskualerts
chown -R deploy:deploy /opt/aiskualerts
log_info "✅ Application directory ready at /opt/aiskualerts"

# 5. Setup SSH for deploy user (for GitHub Actions)
log_info "Setting up SSH access for deploy user..."
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown deploy:deploy /home/deploy/.ssh

# Create authorized_keys if it doesn't exist
touch /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys

log_info "✅ SSH directory ready"
log_warn "Next step: Add your GitHub Actions SSH public key to /home/deploy/.ssh/authorized_keys"

# 6. Enable Docker service
systemctl enable docker
systemctl start docker
log_info "✅ Docker service enabled and started"

# 7. Configure firewall (if UFW is available)
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall..."
    ufw allow 22/tcp   # SSH
    ufw allow 80/tcp   # HTTP
    ufw allow 443/tcp  # HTTPS
    log_info "✅ Firewall rules configured"
else
    log_warn "UFW not installed, skipping firewall configuration"
fi

log_info ""
log_info "=========================================="
log_info "✅ Server provisioning complete!"
log_info "=========================================="
log_info ""
log_info "Next steps:"
log_info "1. Generate SSH key for GitHub Actions deployment"
log_info "2. Add public key to /home/deploy/.ssh/authorized_keys"
log_info "3. Store private key in 1Password as HETZNER_DEPLOY_SSH_KEY"
log_info "4. Test: ssh -i <key> deploy@<server-ip>"
log_info ""
log_info "Server is ready for deployments!"
