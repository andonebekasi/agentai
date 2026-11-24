#!/usr/bin/env bash
# ==============================================================================
# AgentAI Stack - Start Script
# Menjalankan 9Router, OpenClaw, Hermes Agent, NanoClaw & M365 Agent CLI
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
echo "    Starting AgentAI Stack (9Router + Hermes + OpenClaw + NanoClaw)   "
echo "        + Auto-Check Docker & Auto-Install Andi Pangeran M365 CLI      "
echo "======================================================================"
echo -e "${RESET}"

# ------------------------------------------------------------------------------
# 1. Pengecekan & Auto-Install Docker / Docker Compose
# ------------------------------------------------------------------------------
echo -e "${BLUE}[1/6] Memeriksa dependensi Docker & Docker Compose...${RESET}"
if [ -f "${SCRIPT_DIR}/check-docker.sh" ]; then
    chmod +x "${SCRIPT_DIR}/check-docker.sh"
    "${SCRIPT_DIR}/check-docker.sh"
else
    if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
        echo -e "${YELLOW}! Docker/Docker Compose belum siap. Menjalankan installer...${RESET}"
        if [ -f "${SCRIPT_DIR}/install.sh" ]; then
            chmod +x "${SCRIPT_DIR}/install.sh"
            "${SCRIPT_DIR}/install.sh" --docker
        else
            echo -e "${RED}[ERROR] Docker tidak ditemukan! Silakan install Docker terlebih dahulu.${RESET}"
            exit 1
        fi
    fi
fi
echo -e "${GREEN}✓ Docker dan Docker Compose siap digunakan.${RESET}"

# ------------------------------------------------------------------------------
# 2. Pengecekan & Auto-Install M365 Copilot Agent CLI (Andi Pangeran)
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}[2/6] Memeriksa & menginstall Andi Pangeran M365 Copilot Agent CLI...${RESET}"
M365_INSTALLED=false

if command -v m365 >/dev/null 2>&1; then
    M365_INSTALLED=true
    echo -e "${GREEN}✓ M365 Copilot Agent CLI sudah terpasang: $(m365 --version 2>/dev/null || echo 'terpasang')${RESET}"
else
    if [ -d "${SCRIPT_DIR}/m365-agent-cli" ] && [ -f "${SCRIPT_DIR}/m365-agent-cli/install.sh" ]; then
        echo -e "${YELLOW}[SETUP] Menginstall otomatis Andi Pangeran M365 Copilot Agent CLI...${RESET}"
        chmod +x "${SCRIPT_DIR}/m365-agent-cli/install.sh" "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js"
        
        # Jalankan installer m365-agent-cli
        (cd "${SCRIPT_DIR}/m365-agent-cli" && ./install.sh --in-place --global 2>/dev/null || ./install.sh --in-place)
        
        # Fallback symlink jika belum ada di PATH
        mkdir -p "${HOME}/.local/bin"
        ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" "${HOME}/.local/bin/m365"
        ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" "${HOME}/.local/bin/m365-copilot"
        if command -v sudo >/dev/null 2>&1 && [ -w /usr/local/bin ]; then
            sudo ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" /usr/local/bin/m365 2>/dev/null || true
            sudo ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" /usr/local/bin/m365-copilot 2>/dev/null || true
        fi
        
        # Pastikan PATH menyertakan ~/.local/bin
        export PATH="${HOME}/.local/bin:${PATH}"
        M365_INSTALLED=true
        echo -e "${GREEN}✓ M365 Copilot Agent CLI berhasil dipasang.${RESET}"
    fi
fi

# Cek status login M365
M365_CONFIG_DIR="${M365_CLI_CONFIG_DIR:-$HOME/.config/m365-copilot-cli}"
mkdir -p "$M365_CONFIG_DIR"

M365_LOGGED_IN=false
if [ -f "${M365_CONFIG_DIR}/storage-state.json" ] || [ -d "${M365_CONFIG_DIR}/browser-profile" ]; then
    if grep -q "microsoft" "${M365_CONFIG_DIR}/storage-state.json" 2>/dev/null; then
        M365_LOGGED_IN=true
    fi
fi

if [ "$M365_LOGGED_IN" = true ]; then
    echo -e "${GREEN}✓ Sesi Microsoft 365 Copilot aktif!${RESET}"
    # Nyalakan M365 router di background jika port 5365 belum aktif
    if ! curl -s --max-time 1 http://127.0.0.1:5365/v1/models >/dev/null 2>&1; then
        echo -e "${BLUE}[INFO] Menyalakan M365 AI Router server (port 5365) di background...${RESET}"
        nohup node "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" router >/tmp/m365-router.log 2>&1 &
        sleep 2
    fi
else
    echo -e "${YELLOW}----------------------------------------------------------------------${RESET}"
    echo -e "${YELLOW}${BOLD}[PENTING - LOGIN M365 COPILOT]${RESET}"
    echo -e "Andi Pangeran M365 CLI telah siap. Anda tinggal login menggunakan email M365:"
    echo -e "    ${CYAN}${BOLD}m365 login${RESET}"
    echo -e "(Setelah login, Copilot otomatis dapat digunakan oleh 9Router, Hermes & OpenClaw!)"
    echo -e "${YELLOW}----------------------------------------------------------------------${RESET}"
fi

# ------------------------------------------------------------------------------
# 3. Memeriksa file konfigurasi environment (.env)
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}[3/6] Memeriksa file konfigurasi environment (.env)...${RESET}"
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

# Load variables from .env
# shellcheck disable=SC1091
source .env 2>/dev/null || true

# ------------------------------------------------------------------------------
# 4. Menyiapkan direktori persistent data
# ------------------------------------------------------------------------------
echo -e "${BLUE}[4/6] Menyiapkan direktori penyimpanan persistent data...${RESET}"
mkdir -p data/9router data/openclaw data/hermes data/nanoclaw data/m365 "$M365_CONFIG_DIR"
chmod -R 777 data 2>/dev/null || true
echo -e "${GREEN}✓ Direktori data siap.${RESET}"

# ------------------------------------------------------------------------------
# 5. Pull and build images
# ------------------------------------------------------------------------------
echo -e "${BLUE}[5/6] Mengunduh & membangun image terbaru...${RESET}"
echo -e "  - Pulling image prebuilt (9Router, OpenClaw, Hermes)..."
docker compose pull 9router openclaw hermes 2>/dev/null || true

echo -e "  - Building NanoClaw container..."
docker compose build nanoclaw

# ------------------------------------------------------------------------------
# 6. Menjalankan seluruh kontainer dengan Docker Compose
# ------------------------------------------------------------------------------
echo -e "${BLUE}[6/6] Menjalankan seluruh kontainer dengan Docker Compose...${RESET}"
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
echo -e "  ${BOLD}1. 9Router (AI Gateway & Router)${RESET}"
echo -e "     URL Dashboard : ${CYAN}http://localhost:${N9_PORT}${RESET}"
echo -e "     Endpoint LLM  : ${CYAN}http://localhost:${N9_PORT}/v1${RESET}"
echo -e "     Docker Internal: ${CYAN}http://9router:20128/v1${RESET}"
echo ""
echo -e "  ${BOLD}2. OpenClaw (Autonomous AI Assistant & Automation)${RESET}"
echo -e "     URL Control UI: ${CYAN}http://localhost:${OC_PORT}${RESET}"
echo -e "     CLI Command   : ${YELLOW}docker compose exec openclaw node openclaw.mjs --help${RESET}"
echo ""
echo -e "  ${BOLD}3. Hermes Agent (Nous Research Autonomous Agent)${RESET}"
echo -e "     URL Dashboard : ${CYAN}http://localhost:${HM_PORT}${RESET}"
echo -e "     Login Auth    : Username = ${YELLOW}${HM_USER}${RESET} | Password = ${YELLOW}${HM_PASS}${RESET}"
echo -e "     CLI Command   : ${YELLOW}docker compose exec hermes hermes --help${RESET}"
echo ""
echo -e "  ${BOLD}4. NanoClaw (Sandboxed Agent Service)${RESET}"
echo -e "     Port Service  : ${CYAN}http://localhost:${NC_PORT}${RESET}"
echo -e "     CLI Command   : ${YELLOW}docker compose exec nanoclaw ncl --help${RESET}"
echo ""
echo -e "  ${BOLD}5. M365 Copilot Agent CLI (Andi Pangeran)${RESET}"
echo -e "     Status        : $([ "$M365_LOGGED_IN" = true ] && echo -e "${GREEN}Login Aktif${RESET}" || echo -e "${YELLOW}Tinggal Login (m365 login)${RESET}")"
echo -e "     Login Command : ${YELLOW}${BOLD}m365 login${RESET} (cukup masukkan email M365)"
echo -e "     CLI Command   : ${YELLOW}m365 --help${RESET} | Status: ${YELLOW}m365 status${RESET}"
echo -e "     AI Router API : ${CYAN}http://localhost:5365/v1${RESET} (Model: m365, m365-agent, m365-plan)"
echo -e "     Docker Access : ${CYAN}http://host.docker.internal:5365/v1${RESET}"
echo ""

# Periksa status FRP jika aktif
FRP_RUNNING=false
FRP_TYPE=""
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet frpc 2>/dev/null; then
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
echo -e "  - Login M365 Copilot   : ${YELLOW}${BOLD}m365 login${RESET}"
echo -e "  - Cek status kontainer : ${YELLOW}./status.sh${RESET} atau ${YELLOW}docker compose ps${RESET}"
echo -e "  - Lihat log real-time  : ${YELLOW}docker compose logs -f${RESET}"
echo -e "  - Hentikan seluruhnya  : ${YELLOW}./destroy.sh${RESET}"
echo -e "${GREEN}======================================================================${RESET}"
