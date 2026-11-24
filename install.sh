#!/usr/bin/env bash
# ==============================================================================
# AgentAI Stack - Universal Linux Installer
# Memeriksa & menginstall:
#   1. Docker Engine + Docker Compose (v2) di semua distro Linux
#   2. Andi Pangeran M365 Copilot Agent CLI (m365) + Playwright & Cloudflared
#   3. FRP (Fast Reverse Proxy) Client / Server untuk NAT Traversal & Remote Access
#   4. AgentAI Stack (9Router + Hermes + OpenClaw + NanoClaw)
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
echo "    AgentAI & M365 Agent CLI Universal Installer (All Linux Distros) "
echo "======================================================================"
echo -e "${RESET}"

# ------------------------------------------------------------------------------
# 1. Deteksi Hak Akses (Root / Sudo)
# ------------------------------------------------------------------------------
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
        echo -e "${BLUE}[INFO] Script dijalankan sebagai non-root. Menggunakan sudo untuk instalasi sistem.${RESET}"
    else
        echo -e "${RED}[ERROR] Script ini memerlukan akses root atau sudo untuk menginstall dependensi sistem.${RESET}"
        exit 1
    fi
fi

REAL_USER="${SUDO_USER:-$USER}"

# ------------------------------------------------------------------------------
# 2. Deteksi Distro Linux
# ------------------------------------------------------------------------------
detect_distro() {
    if [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        DISTRO_ID="${ID:-unknown}"
        DISTRO_LIKE="${ID_LIKE:-}"
    else
        DISTRO_ID="unknown"
        DISTRO_LIKE=""
    fi
    echo -e "${BLUE}[INFO] Distribusi Linux terdeteksi: ${BOLD}${DISTRO_ID}${RESET} (family: ${DISTRO_LIKE:-none})"
}

# ------------------------------------------------------------------------------
# 3. Instalasi Docker Engine & Compose
# ------------------------------------------------------------------------------
install_docker() {
    echo -e "${YELLOW}[SETUP] Memulai proses instalasi Docker untuk distro '${DISTRO_ID}'...${RESET}"

    # Pastikan curl/ca-certificates tersedia
    if ! command -v curl >/dev/null 2>&1; then
        echo -e "${BLUE}[INFO] Menginstall curl...${RESET}"
        if command -v apt-get >/dev/null 2>&1; then
            $SUDO apt-get update && $SUDO apt-get install -y curl ca-certificates
        elif command -v dnf >/dev/null 2>&1; then
            $SUDO dnf install -y curl ca-certificates
        elif command -v yum >/dev/null 2>&1; then
            $SUDO yum install -y curl ca-certificates
        elif command -v pacman >/dev/null 2>&1; then
            $SUDO pacman -Sy --noconfirm curl ca-certificates
        elif command -v zypper >/dev/null 2>&1; then
            $SUDO zypper install -y curl ca-certificates
        elif command -v apk >/dev/null 2>&1; then
            $SUDO apk add --no-cache curl ca-certificates
        fi
    fi

    # Distro-specific installation logic
    case "${DISTRO_ID}" in
        arch|manjaro|endeavouros)
            echo -e "${BLUE}[INFO] Menginstall Docker via pacman...${RESET}"
            $SUDO pacman -Syu --noconfirm docker docker-compose
            ;;

        alpine)
            echo -e "${BLUE}[INFO] Menginstall Docker via apk...${RESET}"
            $SUDO apk add --no-cache docker docker-cli-compose
            ;;

        *)
            # Untuk Debian, Ubuntu, Linux Mint, Pop!_OS, CentOS, RHEL, Fedora, Rocky, AlmaLinux, SLES, openSUSE:
            echo -e "${BLUE}[INFO] Menjalankan script instalasi resmi Docker (get.docker.com)...${RESET}"
            if curl -fsSL https://get.docker.com -o /tmp/get-docker.sh; then
                $SUDO sh /tmp/get-docker.sh
                rm -f /tmp/get-docker.sh
            else
                echo -e "${YELLOW}[WARN] Gagal mengunduh get.docker.com. Mencoba metode package manager lokal...${RESET}"
                if command -v apt-get >/dev/null 2>&1; then
                    $SUDO apt-get update
                    $SUDO apt-get install -y docker.io docker-compose-plugin || $SUDO apt-get install -y docker.io docker-compose
                elif command -v dnf >/dev/null 2>&1; then
                    $SUDO dnf install -y docker docker-compose-plugin || $SUDO dnf install -y docker
                elif command -v zypper >/dev/null 2>&1; then
                    $SUDO zypper install -y docker docker-compose
                fi
            fi
            ;;
    esac

    # Memastikan service Docker berjalan dan aktif saat boot
    echo -e "${BLUE}[INFO] Mengaktifkan service Docker daemon...${RESET}"
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl daemon-reload || true
        $SUDO systemctl enable docker || true
        $SUDO systemctl start docker || true
    elif command -v rc-service >/dev/null 2>&1; then
        $SUDO rc-update add docker default || true
        $SUDO rc-service docker start || true
    elif command -v service >/dev/null 2>&1; then
        $SUDO service docker start || true
    fi

    # Menambahkan user ke group docker agar tidak selalu butuh sudo
    if [ -n "${REAL_USER}" ] && [ "${REAL_USER}" != "root" ]; then
        echo -e "${BLUE}[INFO] Menambahkan user '${REAL_USER}' ke grup 'docker'...${RESET}"
        $SUDO usermod -aG docker "${REAL_USER}" || true
    fi
}

# ------------------------------------------------------------------------------
# 4. Instalasi Docker Compose Plugin (Jika belum ada)
# ------------------------------------------------------------------------------
install_docker_compose_standalone() {
    echo -e "${YELLOW}[SETUP] Menginstall Docker Compose v2 standalone plugin...${RESET}"
    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64)  COMPOSE_ARCH="x86_64" ;;
        aarch64|arm64) COMPOSE_ARCH="aarch64" ;;
        armv7l)  COMPOSE_ARCH="armv7" ;;
        *)       COMPOSE_ARCH="$ARCH" ;;
    esac

    CLI_PLUGINS_DIR="/usr/local/lib/docker/cli-plugins"
    $SUDO mkdir -p "$CLI_PLUGINS_DIR"
    
    echo -e "${BLUE}[INFO] Mengunduh binary Docker Compose untuk arsitektur ${COMPOSE_ARCH}...${RESET}"
    if curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" -o /tmp/docker-compose; then
        $SUDO mv /tmp/docker-compose "${CLI_PLUGINS_DIR}/docker-compose"
        $SUDO chmod +x "${CLI_PLUGINS_DIR}/docker-compose"
        $SUDO ln -sf "${CLI_PLUGINS_DIR}/docker-compose" /usr/local/bin/docker-compose
        echo -e "${GREEN}✓ Docker Compose v2 berhasil diinstall.${RESET}"
    else
        echo -e "${RED}[ERROR] Gagal mengunduh Docker Compose dari GitHub Releases.${RESET}"
        exit 1
    fi
}

# ------------------------------------------------------------------------------
# 5. Instalasi M365 Copilot Agent CLI (m365)
# ------------------------------------------------------------------------------
install_m365_agent_cli() {
    echo ""
    echo -e "${CYAN}${BOLD}[M365 AGENT CLI] Memeriksa instalasi Andi Pangeran M365 Copilot Agent CLI...${RESET}"
    
    if command -v m365 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ M365 Copilot Agent CLI sudah terpasang: $(m365 --version 2>/dev/null || echo 'terpasang')${RESET}"
        return 0
    fi

    if [ -d "${SCRIPT_DIR}/m365-agent-cli" ] && [ -f "${SCRIPT_DIR}/m365-agent-cli/install.sh" ]; then
        echo -e "${YELLOW}[SETUP] Memasang M365 Copilot Agent CLI dari direktori lokal...${RESET}"
        chmod +x "${SCRIPT_DIR}/m365-agent-cli/install.sh"
        chmod +x "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js"
        
        # Jalankan installer m365-agent-cli
        (cd "${SCRIPT_DIR}/m365-agent-cli" && ./install.sh --global --in-place || ./install.sh --in-place)
        
        # Buat symlink fallback jika belum ada
        if ! command -v m365 >/dev/null 2>&1; then
            mkdir -p "${HOME}/.local/bin"
            ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" "${HOME}/.local/bin/m365"
            ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" "${HOME}/.local/bin/m365-copilot"
            if [ -n "$SUDO" ]; then
                $SUDO ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" /usr/local/bin/m365 || true
                $SUDO ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" /usr/local/bin/m365-copilot || true
            fi
        fi
        echo -e "${GREEN}✓ M365 Copilot Agent CLI berhasil dipasang.${RESET}"
    else
        echo -e "${YELLOW}[WARN] Direktori m365-agent-cli tidak ditemukan. Melewati langkah ini.${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 5b. Instalasi FRP (Fast Reverse Proxy) - Opsional / Remote Access
# ------------------------------------------------------------------------------
install_frp_interactive() {
    echo ""
    echo -e "${CYAN}${BOLD}[FRP REVERSE PROXY] Pengecekan Fast Reverse Proxy (frp)...${RESET}"
    if command -v frpc >/dev/null 2>&1 || command -v frps >/dev/null 2>&1; then
        echo -e "${GREEN}✓ FRP binary sudah terpasang: $(frpc -v 2>/dev/null || frps -v 2>/dev/null || echo 'terpasang')${RESET}"
        return 0
    fi

    if [ -f "${SCRIPT_DIR}/install-frp.sh" ]; then
        chmod +x "${SCRIPT_DIR}/install-frp.sh"
        INSTALL_FRP=false
        if [ -t 0 ]; then
            echo -e "${YELLOW}FRP (Fast Reverse Proxy) memungkinkan Anda mengekspos AgentAI (9Router, OpenClaw, Hermes, dll.)${RESET}"
            echo -e "${YELLOW}dari server lokal/PC di balik NAT/WiFi ke Internet melalui VPS publik.${RESET}"
            read -r -p "Apakah Anda ingin menginstall & konfigurasi FRP sekarang? [y/N]: " frp_choice
            case "$frp_choice" in
                [yY][eE][sS]|[yY])
                    INSTALL_FRP=true
                    ;;
                *)
                    INSTALL_FRP=false
                    ;;
            esac
        fi

        if [ "$INSTALL_FRP" = true ]; then
            "${SCRIPT_DIR}/install-frp.sh"
        else
            echo -e "${BLUE}[INFO] Melewati instalasi FRP. Anda dapat menginstallnya kapan saja dengan: ${BOLD}./install-frp.sh${RESET}"
        fi
    fi
}
detect_distro

# Cek Docker
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${YELLOW}! Docker Engine belum terpasang.${RESET}"
    install_docker
else
    echo -e "${GREEN}✓ Docker Engine sudah terpasang: $(docker --version)${RESET}"
    if ! docker info >/dev/null 2>&1; then
        echo -e "${YELLOW}! Service Docker belum berjalan. Mencoba menyalakan service...${RESET}"
        if command -v systemctl >/dev/null 2>&1; then
            $SUDO systemctl enable --now docker || true
        elif command -v service >/dev/null 2>&1; then
            $SUDO service docker start || true
        fi
    fi
fi

# Cek Docker Compose
if docker compose version >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker Compose (v2) sudah siap: $(docker compose version)${RESET}"
elif command -v docker-compose >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker Compose standalone terdeteksi: $(docker-compose --version)${RESET}"
else
    echo -e "${YELLOW}! Docker Compose (v2) belum terpasang.${RESET}"
    install_docker_compose_standalone
fi

# Cek dan pasang M365 Copilot Agent CLI
install_m365_agent_cli

# Cek dan pasang FRP (Fast Reverse Proxy)
install_frp_interactive

# Pastikan permission socket docker dapat diakses
if ! docker ps >/dev/null 2>&1; then
    if $SUDO docker ps >/dev/null 2>&1; then
        echo -e "${YELLOW}[NOTICE] User '${REAL_USER}' telah ditambahkan ke grup docker.${RESET}"
        echo -e "${YELLOW}Untuk menerapkan izin grup tanpa logout, jalankan: ${BOLD}newgrp docker${RESET}"
    fi
fi

# ------------------------------------------------------------------------------
# 7. Menyiapkan Permissions & Memulai Stack
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}[STEP] Menyiapkan hak akses script start.sh, destroy.sh, status.sh, dan install-frp.sh...${RESET}"
chmod +x start.sh destroy.sh status.sh install-frp.sh docker/nanoclaw/entrypoint.sh

echo -e "${GREEN}✓ Seluruh dependensi host (Docker + Compose + M365 Agent CLI) telah siap!${RESET}"
echo ""

# Tanya apakah ingin langsung menjalankan stack sekarang
START_NOW=true
if [ -t 0 ]; then
    read -r -p "Jalankan AgentAI stack (9Router + Hermes + OpenClaw + NanoClaw) sekarang? [Y/n]: " run_now
    case "$run_now" in
        [nN][oO]|[nN])
            START_NOW=false
            ;;
        *)
            START_NOW=true
            ;;
    esac
fi

if [ "$START_NOW" = true ]; then
    echo -e "${CYAN}[LAUNCH] Memulai stack melalui ./start.sh...${RESET}"
    ./start.sh
else
    echo -e "${GREEN}Instalasi host selesai!${RESET}"
    echo -e "Untuk menjalankan AgentAI stack kapan saja, ketik:"
    echo -e "    ${BOLD}./start.sh${RESET}"
    echo -e "Untuk menggunakan M365 Copilot CLI, ketik:"
    echo -e "    ${BOLD}m365 --help${RESET}"
fi
