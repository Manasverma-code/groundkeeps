#!/usr/bin/env bash
# Ground-Keeps Production Deploy — One-command setup
# Usage: bash scripts/deploy.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Ground-Keeps Production Deploy     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Check prerequisites ────────────────────────────
if ! command -v docker &>/dev/null; then
  echo -e "${RED}❌ Docker is not installed.${NC}"
  echo "   Install it first: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker info &>/dev/null; then
  echo -e "${RED}❌ Docker daemon is not running.${NC}"
  exit 1
fi

# ── Collect configuration ──────────────────────────
echo -e "${YELLOW}We'll need a few things to set up your production server.${NC}"
echo ""

read -p "Enter your domain (e.g., api.ground-keeps.com): " DOMAIN
read -p "Enter your email (for Let's Encrypt): " EMAIL

# Generate a strong API key
PROXY_API_KEY="gk_$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)"

echo ""
echo -e "${GREEN}Generated PROXY_API_KEY: ${PROXY_API_KEY}${NC}"
echo -e "${YELLOW}Save this key — you'll need it to authenticate API calls.${NC}"
echo ""

read -p "Enter your LLM provider (groq/openai/anthropic/etc.): " LLM_PROVIDER
read -p "Enter your LLM API key: " LLM_API_KEY
read -p "Enter your LLM model: " LLM_MODEL
read -p "Enter your verifier provider (or same as above): " VERIFIER_PROVIDER
read -p "Enter your verifier API key: " VERIFIER_API_KEY
read -p "Enter your verifier model: " VERIFIER_MODEL

# ── Create .env.prod ───────────────────────────────
cat > deploy/.env.prod << EOF
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
PROXY_API_KEY=${PROXY_API_KEY}
TARGET_LLM_PROVIDER=${LLM_PROVIDER}
TARGET_LLM_API_KEY=${LLM_API_KEY}
TARGET_LLM_MODEL=${LLM_MODEL}
VERIFIER_LLM_PROVIDER=${VERIFIER_PROVIDER}
VERIFIER_LLM_API_KEY=${VERIFIER_API_KEY}
VERIFIER_LLM_MODEL=${VERIFIER_MODEL}
EOF

echo ""
echo -e "${GREEN}✅ Configuration saved to deploy/.env.prod${NC}"

# ── Build and deploy ───────────────────────────────
echo ""
echo -e "${YELLOW}Building Docker images...${NC}"
docker compose -f docker-compose.prod.yml build

echo ""
echo -e "${YELLOW}Starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Deployment Complete!           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Dashboard:${NC}  https://${DOMAIN}"
echo -e "  ${CYAN}API:${NC}        https://${DOMAIN}/v1/health"
echo -e "  ${CYAN}Auth:${NC}       Authorization: Bearer ${PROXY_API_KEY}"
echo ""
echo "  Test it:"
echo "  curl https://${DOMAIN}/v1/health"
echo ""

# ── Show logs ──────────────────────────────────────
echo -e "${YELLOW}Tailing logs (Ctrl+C to stop)...${NC}"
docker compose -f docker-compose.prod.yml logs -f
