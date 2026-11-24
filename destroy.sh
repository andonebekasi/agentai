#!/usr/bin/env bash
# ==============================================================================
# AgentAI Stack - Destroy Script
# Menghentikan dan membersihkan stack AgentAI
# ==============================================================================

set -euo pipefail

# ANSI Color codes
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${RED}${BOLD}"
echo "======================================================================"
echo "          Destroying AgentAI Stack (9Router + Hermes + OpenClaw + NanoClaw)"
echo "======================================================================"
echo -e "${RESET}"

REMOVE_DATA=false

# Check command line flags
for arg in "$@"; do
    case "$arg" in
        --volumes|-v|--clean)
            REMOVE_DATA=true
            ;;
        --help|-h)
            echo "Usage: ./destroy.sh [options]"
            echo ""
            echo "Options:"
            echo "  --volumes, -v, --clean   Hapus juga seluruh direktori persistent data (./data/*)"
            echo "  --help, -h               Tampilkan bantuan ini"
            exit 0
            ;;
    esac
done

# If no flag provided, ask confirmation interactively if a terminal is attached
if [ "$REMOVE_DATA" = false ] && [ -t 0 ]; then
    echo -e "${YELLOW}Apakah Anda ingin menghapus direktori data persistent (data/9router, data/openclaw, data/hermes, data/nanoclaw)?${RESET}"
    read -r -p "Hapus semua data? [y/N]: " confirm_data
    case "$confirm_data" in
        [yY][eE][sS]|[yY])
            REMOVE_DATA=true
            ;;
        *)
            REMOVE_DATA=false
            ;;
    esac
fi

echo -e "${YELLOW}[1/2] Menghentikan kontainer dan menghapus network...${RESET}"
docker compose --profile frp down --remove-orphans 2>/dev/null || docker compose down --remove-orphans
echo -e "${GREEN}✓ Kontainer berhasil dihentikan.${RESET}"

# Hentikan service frpc jika sedang berjalan via systemd
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet frpc 2>/dev/null; then
    echo -e "${YELLOW}[INFO] Menemukan service frpc (systemd) yang sedang berjalan.${RESET}"
    if [ "$REMOVE_DATA" = true ]; then
        if [ "$(id -u)" -eq 0 ]; then
            systemctl stop frpc || true
            echo -e "${GREEN}✓ Service frpc (systemd) dihentikan.${RESET}"
        elif command -v sudo >/dev/null 2>&1; then
            sudo systemctl stop frpc || true
            echo -e "${GREEN}✓ Service frpc (systemd) dihentikan.${RESET}"
        fi
    fi
fi

if [ "$REMOVE_DATA" = true ]; then
    echo -e "${RED}[2/2] Menghapus data direktori (./data)...${RESET}"
    rm -rf data/9router data/openclaw data/hermes data/nanoclaw
    echo -e "${GREEN}✓ Data direktori persistent berhasil dibersihkan.${RESET}"
else
    echo -e "${CYAN}[2/2] Direktori ./data dipertahankan.${RESET} (Gunakan ./destroy.sh --volumes jika ingin menghapus semua data)"
fi

echo ""
echo -e "${GREEN}${BOLD}AgentAI Stack telah berhasil di-destroy.${RESET}"
