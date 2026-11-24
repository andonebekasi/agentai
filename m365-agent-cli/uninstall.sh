#!/usr/bin/env bash
# ==============================================================================
# Microsoft 365 Copilot Linux CLI (m365) - Uninstaller
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="${M365_INSTALL_DIR:-$HOME/.local/share/m365-copilot-cli}"
BIN_DIR="${M365_BIN_DIR:-$HOME/.local/bin}"
CONFIG_DIR="${M365_CLI_CONFIG_DIR:-$HOME/.config/m365-copilot-cli}"
PURGE_CONFIG=0

if [[ "${1:-}" == "--purge" ]]; then
  PURGE_CONFIG=1
fi

echo -e "${BOLD}${CYAN}Menghapus instalasi Microsoft 365 Copilot CLI (m365)...${NC}"

rm -f "$BIN_DIR/m365" "$BIN_DIR/m365-copilot"
echo -e "${GREEN}[OK]${NC} Symlink di $BIN_DIR dihapus."

if [[ -L /usr/local/bin/m365 || -L /usr/local/bin/m365-copilot ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo rm -f /usr/local/bin/m365 /usr/local/bin/m365-copilot
    echo -e "${GREEN}[OK]${NC} Symlink global di /usr/local/bin dihapus."
  fi
fi

if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  echo -e "${GREEN}[OK]${NC} Direktori aplikasi $INSTALL_DIR dihapus."
fi

if [[ "$PURGE_CONFIG" -eq 1 ]]; then
  if [[ -d "$CONFIG_DIR" ]]; then
    rm -rf "$CONFIG_DIR"
    echo -e "${GREEN}[OK]${NC} Direktori sesi & cookies $CONFIG_DIR dihapus (--purge)."
  fi
else
  echo -e "${YELLOW}[INFO]${NC} Sesi & cookies di $CONFIG_DIR tetap disimpan."
  echo -e "       Gunakan '${BOLD}./uninstall.sh --purge${NC}' jika ingin menghapus sesi login juga."
fi

echo -e "${BOLD}${GREEN}✔ Uninstall selesai.${NC}"
