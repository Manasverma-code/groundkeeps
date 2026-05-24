#!/usr/bin/env bash
# groundkeeps License Server Deploy — One-command setup
# Usage: bash scripts/deploy-license-server.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   groundkeeps License Server Deploy     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Check prerequisites ────────────────────────────
if ! command -v docker &>/dev/null; then
  echo -e "${RED}Docker is not installed.${NC}"
  exit 1
fi

if ! docker info &>/dev/null; then
  echo -e "${RED}Docker daemon is not running.${NC}"
  exit 1
fi

# ── Collect configuration ──────────────────────────
echo -e "${YELLOW}Enter your license server domain (e.g., license.groundkeeps.in):${NC}"
read -p "> " LICENSE_DOMAIN

echo -e "${YELLOW}Enter your email (for Let's Encrypt):${NC}"
read -p "> " EMAIL

ADMIN_KEY="ls_$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)"

echo ""
echo -e "${GREEN}Generated ADMIN_KEY: ${ADMIN_KEY}${NC}"
echo -e "${YELLOW}Save this — you'll use it to issue licenses via API.${NC}"
echo ""

read -p "Enter Razorpay webhook secret (optional, leave blank to skip): " RAZORPAY_SECRET
read -p "Enter Stripe webhook secret (optional, leave blank to skip): " STRIPE_SECRET

# ── Generate license key pair ──────────────────────
echo -e "${YELLOW}Generating license key pair...${NC}"
node scripts/generate-license.mjs --tier pro --days 365 > /dev/null 2>&1 || true

# ── Create .env ────────────────────────────────────
mkdir -p deploy/license-server
cat > deploy/license-server/.env << EOF
ADMIN_KEY=${ADMIN_KEY}
PORT=3001
RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_SECRET}
STRIPE_WEBHOOK_SECRET=${STRIPE_SECRET}
EOF

echo -e "${GREEN}Configuration saved to deploy/license-server/.env${NC}"

# ── Build & start ─────────────────────────────────
echo -e "${YELLOW}Building license server Docker image...${NC}"
docker compose -f deploy/license-server/docker-compose.yml build

echo -e "${YELLOW}Starting license server...${NC}"
docker compose -f deploy/license-server/docker-compose.yml up -d

echo ""
echo -e "${GREEN}License server deployed!${NC}"
echo ""
echo -e "  ${CYAN}URL:${NC}         https://${LICENSE_DOMAIN}"
echo -e "  ${CYAN}Health:${NC}      https://${LICENSE_DOMAIN}/v1/health"
echo -e "  ${CYAN}Admin Key:${NC}   ${ADMIN_KEY}"
echo ""
echo "  Set Razorpay webhook to:"
echo "  https://${LICENSE_DOMAIN}/v1/webhook/razorpay"
echo ""
echo "  Issue a license:"
echo "  curl -X POST https://${LICENSE_DOMAIN}/v1/issue \\"
echo '    -H "Authorization: Bearer '"${ADMIN_KEY}"'" \'
echo '    -H "Content-Type: application/json" \'
echo '    -d "{\"tier\":\"pro\",\"days\":365,\"customerEmail\":\"buyer@email.com\"}"'
echo ""

echo -e "${YELLOW}Tailing logs (Ctrl+C to stop)...${NC}"
docker compose -f deploy/license-server/docker-compose.yml logs -f
