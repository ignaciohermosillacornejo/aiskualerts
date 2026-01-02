#!/bin/bash
# ===========================================
# Add SSH public key to Hetzner server
# ===========================================
set -euo pipefail

SERVER_IP="46.62.158.249"
PUBLIC_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK1Wn5fMLVHAXJJ8PWgdxiMaP9qgyODCbeBPYUEVMXNi"

echo "This script will add the deployment SSH key to your Hetzner server."
echo "You need to be able to SSH into the server with your current credentials."
echo ""
echo "Server IP: $SERVER_IP"
echo ""

# Add key using ssh-copy-id (requires password or existing key)
echo "Attempting to add SSH key..."
echo "$PUBLIC_KEY" | ssh root@"$SERVER_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo 'SSH key added successfully!'"

echo ""
echo "✅ SSH key has been added to the server!"
echo ""
echo "Testing connection with the new key..."
bash scripts/test-ssh.sh "$SERVER_IP"
