#!/usr/bin/env bash
# ==============================================================================
# AgentAI Stack - Start Script
# Menjalankan 9Router, OpenClaw, Hermes Agent, dan NanoClaw
# ==============================================================================

set -euo pipefail

# ANSI Color codes
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}${BOLD}"
echo "======================================================================"
echo "          Starting AgentAI Stack (9Router + Hermes + OpenClaw + NanoClaw)"
echo "======================================================================"
echo -e "${RESET}"

# 1. Check prerequisites
echo -e "${BLUE}[1/5] Memeriksa dependensi sistem...${RESET}"
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Docker tidak ditemukan! Silakan install Docker terlebih dahulu.${RESET}"
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Docker Compose (v2) tidak ditemukan!${RESET}"
    exit 1
fi
echo -e "${GREEN}✓ Docker dan Docker Compose siap.${RESET}"

# 2. Check and initialize .env file
echo -e "${BLUE}[2/5] Memeriksa file konfigurasi environment (.env)...${RESET}"
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo -e "${YELLOW}! File .env tidak ditemukan. Menyalin template dari .env.example...${RESET}"
        cp .env.example .env
        echo -e "${GREEN}✓ File .env berhasil dibuat.${RESET}"
    else
        echo -e "${RED}[ERROR] File .env.example tidak ditemukan!${RESET}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ File .env ditemukan.${RESET}"
fi

# Load variables from .env for display
source .env 2>/dev/null || true

# 3. Prepare data directories with proper permissions
echo -e "${BLUE}[3/5] Menyiapkan direktori penyimpanan persistent data...${RESET}"
mkdir -p data/9router data/openclaw data/hermes data/nanoclaw
# OpenClaw node user is uid 1000, Hermes user is uid 1000
chmod -R 777 data
echo -e "${GREEN}✓ Direktori data siap.${RESET}"

# 4. Pull and build images
echo -e "${BLUE}[4/5] Mengunduh & membangun image terbaru...${RESET}"
echo -e "  - Pulling image prebuilt (9Router, OpenClaw, Hermes)..."
docker compose pull 9router openclaw hermes || true

echo -e "  - Building NanoClaw container..."
docker compose build nanoclaw

# 5. Start containers
echo -e "${BLUE}[5/5] Menjalankan seluruh kontainer dengan Docker Compose...${RESET}"
COMPOSE_ARGS=("-d")
if [ "${ENABLE_FRP:-false}" = "true" ] && [ -f "./frp/frpc.toml" ]; then
    echo -e "${BLUE}  - Profil FRP diaktifkan (fatedier/frpc)...${RESET}"
    COMPOSE_ARGS=("--profile" "frp" "-d")
fi
docker compose "${COMPOSE_ARGS[@]}" up

echo ""
echo -e "${GREEN}${BOLD}======================================================================${RESET}"
echo -e "${GREEN}${BOLD}           Semua Service AgentAI Berhasil Dijalankan!                 ${RESET}"
echo -e "${GREEN}${BOLD}======================================================================${RESET}"
echo ""

N9_PORT="${NINE_ROUTER_PORT:-20128}"
OC_PORT="${OPENCLAW_PORT:-18789}"
HM_PORT="${HERMES_PORT:-8088}"
NC_PORT="${NANOCLAW_PORT:-18790}"
HM_USER="${HERMES_AUTH_USER:-admin}"
HM_PASS="${HERMES_AUTH_PASS:-admin123456}"

echo -e "Daftar Service & Dashboard URL:"
echo -e "  ${BOLD}1. 9Router (AI Gateway)${RESET}"
echo -e "     URL Dashboard : ${CYAN}http://localhost:${N9_PORT}${RESET}"
echo -e "     Endpoint LLM  : ${CYAN}http://localhost:${N9_PORT}/v1${RESET}"
echo -e "     Docker Internal: ${CYAN}http://9router:20128/v1${RESET}"
echo ""
echo -e "  ${BOLD}2. OpenClaw (AI Assistant & Automation Gateway)${RESET}"
echo -e "     URL Control UI: ${CYAN}http://localhost:${OC_PORT}${RESET}"
echo -e "     CLI Command   : ${YELLOW}docker compose exec openclaw node openclaw.mjs --help${RESET}"
echo ""
echo -e "  ${BOLD}3. Hermes Agent (Nous Research Self-Improving Agent)${RESET}"
echo -e "     URL Dashboard : ${CYAN}http://localhost:${HM_PORT}${RESET}"
echo -e "     Login Auth    : Username = ${YELLOW}${HM_USER}${RESET} | Password = ${YELLOW}${HM_PASS}${RESET}"
echo -e "     CLI Command   : ${YELLOW}docker compose exec hermes hermes --help${RESET}"
echo ""
echo -e "  ${BOLD}4. NanoClaw (Lightweight Agent Container)${RESET}"
echo -e "     Port Service  : ${CYAN}http://localhost:${NC_PORT}${RESET}"
echo -e "     CLI Command   : ${YELLOW}docker compose exec nanoclaw ncl --help${RESET}"
echo ""
echo -e "  ${BOLD}5. M365 Copilot Agent CLI (Host CLI & AI Router)${RESET}"
echo -e "     CLI Command   : ${YELLOW}m365 --help${RESET} | Login: ${YELLOW}m365 login${RESET}"
echo -e "     AI Router     : ${CYAN}m365 router${RESET} (Port 5365 - OpenAI/Anthropic/Hermes API)"
echo -e "     Docker Access : ${CYAN}http://host.docker.internal:5365/v1${RESET}"
echo ""

# Periksa status FRP (Fast Reverse Proxy) jika aktif
FRP_RUNNING=false
FRP_TYPE=""
if systemctl is-active --quiet frpc 2>/dev/null; then
    FRP_RUNNING=true
    FRP_TYPE="systemd service (frpc.service)"
elif docker ps --format '{{.Names}}' | grep -q "agentai-frpc"; then
    FRP_RUNNING=true
    FRP_TYPE="docker container (agentai-frpc)"
fi

if [ "$FRP_RUNNING" = true ] || [ "${ENABLE_FRP:-false}" = "true" ]; then
    SERVER_IP="${FRP_SERVER_ADDR:-127.0.0.1}"
    echo -e "  ${BOLD}6. FRP (Fast Reverse Proxy - Remote Access)${RESET} [${GREEN}AKTIF${RESET}: ${FRP_TYPE:-configured}]"
    echo -e "     FRP Server VPS: ${CYAN}${SERVER_IP}:${FRP_SERVER_PORT:-7000}${RESET}"
    echo -e "     Remote 9Router: ${CYAN}http://${SERVER_IP}:${FRP_REMOTE_9ROUTER_PORT:-$N9_PORT}${RESET}"
    echo -e "     Remote OpenClaw: ${CYAN}http://${SERVER_IP}:${FRP_REMOTE_OPENCLAW_PORT:-$OC_PORT}${RESET}"
    echo -e "     Remote Hermes : ${CYAN}http://${SERVER_IP}:${FRP_REMOTE_HERMES_PORT:-$HM_PORT}${RESET}"
    echo -e "     Remote NanoClaw: ${CYAN}http://${SERVER_IP}:${FRP_REMOTE_NANOCLAW_PORT:-$NC_PORT}${RESET}"
    echo -e "     Remote M365   : ${CYAN}http://${SERVER_IP}:${FRP_REMOTE_M365_PORT:-5365}/v1${RESET}"
    echo ""
fi
echo -e "Perintah Berguna:"
echo -e "  - Cek status kontainer : ${YELLOW}./status.sh${RESET} atau ${YELLOW}docker compose ps${RESET}"
echo -e "  - Lihat log real-time  : ${YELLOW}docker compose logs -f${RESET}"
echo -e "  - Hentikan & hapus     : ${YELLOW}./destroy.sh${RESET}"
echo -e "${GREEN}======================================================================${RESET}"
