#!/usr/bin/env bash
# Provision a fresh Ubuntu server with Docker and deploy groundkeeps
# Usage: Run this on a new Ubuntu 22.04+ VPS as root
#   curl -fsSL https://raw.githubusercontent.com/Manasverma-code/Ground-Keeps/main/scripts/provision-server.sh | bash
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}Provisioning server for groundkeeps...${NC}"

# Update system
apt-get update -qq
apt-get upgrade -y -qq

# Install Docker
if ! command -v docker &>/dev/null; then
  echo -e "${GREEN}Installing Docker...${NC}"
  curl -fsSL https://get.docker.com | bash
  usermod -aG docker "$SUDO_USER" 2>/dev/null || true
fi

# Install Docker Compose plugin
apt-get install -y -qq docker-compose-plugin

# Install other useful tools
apt-get install -y -qq git curl openssl jq

# Clone the repo
if [ ! -d /opt/groundkeeps ]; then
  echo -e "${GREEN}Cloning groundkeeps...${NC}"
  git clone https://github.com/Manasverma-code/Ground-Keeps.git /opt/groundkeeps
fi

cd /opt/groundkeeps

echo ""
echo -e "${GREEN}✅ Server provisioned!${NC}"
echo ""
echo "Next steps:"
echo "  1. cd /opt/groundkeeps"
echo "  2. bash scripts/deploy.sh"
echo ""
echo "The deploy script will ask you for your domain and API keys."
