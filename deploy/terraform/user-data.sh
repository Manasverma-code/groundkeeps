#!/bin/bash
set -e

# Install Docker
apt-get update -qq
apt-get install -y -qq ca-certificates curl git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker
systemctl start docker

# Clone and configure
cd /opt
git clone https://github.com/Manasverma-code/Ground-Keeps.git groundkeeps
cd groundkeeps

# Create .env file
cat > .env << EOF
PROXY_API_KEY=${proxy_api_key}
TARGET_LLM_PROVIDER=${target_llm_provider}
TARGET_LLM_API_KEY=${target_llm_api_key}
TARGET_LLM_MODEL=${target_llm_model}
VERIFIER_LLM_PROVIDER=${verifier_llm_provider}
VERIFIER_LLM_API_KEY=${verifier_llm_api_key}
VERIFIER_LLM_MODEL=${verifier_llm_model}
DOMAIN=${domain}
EMAIL=${email}
AUDIT_DB_PATH=/data/audit.db
GUARD_DB_PATH=/data/guard.json
EOF

# Start the proxy
docker compose -f docker-compose.prod.yml up -d

# Setup auto-restart
echo "0 3 * * * cd /opt/groundkeeps && docker compose pull && docker compose up -d" | crontab -
