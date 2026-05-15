#!/usr/bin/env bash
# Trust Layer — One-command launch and demo
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Trust Layer — Launch Kit      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# Check for Docker
USE_DOCKER=false
if command -v docker &>/dev/null; then
  if docker info &>/dev/null; then
    USE_DOCKER=true
  fi
fi

cleanup() {
  if [ -n "$PROXY_PID" ]; then
    kill "$PROXY_PID" 2>/dev/null || true
  fi
  if [ "$USE_DOCKER" = true ]; then
    docker compose down 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ "$USE_DOCKER" = true ]; then
  echo -e "${GREEN}>> Using Docker...${NC}"
  cd "$ROOT"
  docker compose up --build -d
  echo -e "${YELLOW}>> Waiting for proxy...${NC}"
  until curl -s http://localhost:3000/health >/dev/null 2>&1; do
    sleep 2
  done
else
  echo -e "${YELLOW}>> Docker not available, using Node.js...${NC}"
  echo -e "${YELLOW}>> Building packages...${NC}"
  cd "$ROOT"
  npm install --silent
  npm run build >/dev/null 2>&1

  # Start proxy in background
  node -e "
    const m = require('$ROOT/packages/trust-proxy/dist/start.js');
    m.startProxy().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
  " &
  PROXY_PID=$!
  echo -e "${YELLOW}>> Proxy starting (PID: $PROXY_PID)...${NC}"

  # Wait for proxy
  until curl -s http://localhost:3000/health >/dev/null 2>&1; do
    sleep 2
  done
fi

echo -e "${GREEN}>> Proxy is running on http://localhost:3000${NC}"

# Seed demo data
echo -e "${YELLOW}>> Seeding demo data...${NC}"
node "$ROOT/scripts/seed-demo.mjs" || echo -e "${RED}>> Seed failed${NC}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Ready for Demo!             ║${NC}"
echo -e "${GREEN}║                                      ║${NC}"
echo -e "${GREEN}║  API:      http://localhost:3000     ║${NC}"
echo -e "${GREEN}║  Dashboard: http://localhost:5173    ║${NC}"
echo -e "${GREEN}║                                      ║${NC}"
echo -e "${GREEN}║  Try:  curl localhost:3000/health    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# Wait for Ctrl+C
if [ "$USE_DOCKER" = false ]; then
  echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
  wait $PROXY_PID
fi
