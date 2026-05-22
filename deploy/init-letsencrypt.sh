#!/usr/bin/env bash
# Initializes Let's Encrypt certificates and starts the stack
# Usage: bash deploy/init-letsencrypt.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Check for .env file
if [ ! -f deploy/.env.prod ]; then
  echo "❌ deploy/.env.prod not found!"
  echo "   cp deploy/.env.prod.example deploy/.env.prod"
  echo "   Then edit it with your domain, email, and API keys."
  exit 1
fi

# Source the env file
set -a
source deploy/.env.prod
set +a

if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "your-domain.com" ]; then
  echo "❌ Please set your DOMAIN in deploy/.env.prod"
  exit 1
fi

if [ -z "$EMAIL" ] || [ "$EMAIL" = "admin@your-domain.com" ]; then
  echo "❌ Please set your EMAIL in deploy/.env.prod"
  exit 1
fi

if [ -z "$PROXY_API_KEY" ] || [ "$PROXY_API_KEY" = "gk_change_this_to_a_random_key" ]; then
  echo "❌ Please set a strong PROXY_API_KEY in deploy/.env.prod"
  echo "   Run: openssl rand -hex 32"
  exit 1
fi

echo "🚀 Deploying groundkeeps to $DOMAIN..."
echo ""

# Start Caddy first to provision certificates
echo "📡 Starting Caddy to provision SSL certificates..."
docker compose -f docker-compose.prod.yml up -d caddy
sleep 5

# Start the rest of the stack
echo "🛡️  Starting groundkeeps..."
docker compose -f docker-compose.prod.yml up -d trust-proxy

echo ""
echo "✅ Deployment complete!"
echo "   Dashboard: https://$DOMAIN"
echo "   API:       https://$DOMAIN/v1/health"
echo "   Auth:      Authorization: Bearer $PROXY_API_KEY"
echo ""
echo "   Test it:"
echo "   curl https://$DOMAIN/v1/health"
echo ""
echo "   curl -H 'Authorization: Bearer $PROXY_API_KEY' \\"
echo "     https://$DOMAIN/v1/agents \\"
echo "     -d '{\"name\":\"my-agent\",\"scope\":\"read\"}'"
