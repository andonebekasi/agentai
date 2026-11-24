#!/usr/bin/env bash
# ==============================================================================
# AgentAI Stack - Status Script
# Memeriksa status dan kesehatan seluruh service
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}${BOLD}"
echo "======================================================================"
echo "                    AgentAI Stack Status"
echo "======================================================================"
echo -e "${RESET}"

docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# Cek status FRP (Fast Reverse Proxy)
echo ""
echo -e "${BOLD}FRP (Fast Reverse Proxy) Status:${RESET}"
FRP_FOUND=false
if command -v systemctl >/dev/null 2>&1; then
    if systemctl is-active --quiet frpc 2>/dev/null; then
        echo -e "  - frpc (systemd)  : ${GREEN}Active / Running${RESET} (Client -> Server)"
        FRP_FOUND=true
    elif systemctl list-unit-files frpc.service >/dev/null 2>&1; then
        echo -e "  - frpc (systemd)  : ${YELLOW}Installed but Stopped${RESET} (start: sudo systemctl start frpc)"
        FRP_FOUND=true
    fi

    if systemctl is-active --quiet frps 2>/dev/null; then
        echo -e "  - frps (systemd)  : ${GREEN}Active / Running${RESET} (FRP Server Dashboard port 7500)"
        FRP_FOUND=true
    elif systemctl list-unit-files frps.service >/dev/null 2>&1; then
        echo -e "  - frps (systemd)  : ${YELLOW}Installed but Stopped${RESET} (start: sudo systemctl start frps)"
        FRP_FOUND=true
    fi
fi

if docker ps --format '{{.Names}}' | grep -q "agentai-frpc"; then
    echo -e "  - frpc (Docker)   : ${GREEN}Container Active / Running${RESET}"
    FRP_FOUND=true
fi

if [ "$FRP_FOUND" = false ]; then
    echo -e "  - FRP Status      : ${YELLOW}Belum aktif / belum diinstall${RESET} (Jalankan: ${BOLD}./install-frp.sh${RESET})"
fi

echo ""
echo -e "${BOLD}Resource Usage:${RESET}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 9router openclaw hermes-agent nanoclaw 2>/dev/null || true

echo ""
echo -e "${YELLOW}Untuk melihat log realtime:${RESET} docker compose logs -f [service_name]"
