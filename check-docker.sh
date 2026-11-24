#!/usr/bin/env bash
# ==============================================================================
# Script: check-docker.sh
# Memeriksa apakah Docker Engine dan Docker Compose (v2) sudah terpasang.
# Jika belum terpasang atau service mati, script ini akan OTOMATIS
# menginstall dan mengaktifkannya di berbagai distribusi Linux:
#   - Debian / Ubuntu / Linux Mint / Pop!_OS / Kali
#   - RHEL / CentOS / Fedora / Rocky Linux / AlmaLinux
#   - Arch Linux / Manjaro / EndeavourOS
#   - openSUSE Leap / Tumbleweed
#   - Alpine Linux
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

echo -e "${CYAN}${BOLD}[DOCKER CHECK] Memeriksa status Docker Engine & Docker Compose...${RESET}"

# 1. Deteksi Root / Sudo
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo -e "${RED}[ERROR] Script membutuhkan akses root atau sudo untuk menginstall Docker.${RESET}"
        exit 1
    fi
fi

REAL_USER="${SUDO_USER:-$USER}"

# 2. Deteksi Distro Linux
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
    echo -e "${BLUE}[INFO] Distro terdeteksi: ${BOLD}${DISTRO_ID}${RESET} (family: ${DISTRO_LIKE:-none})"
}

# 3. Instalasi Docker Engine
install_docker() {
    detect_distro
    echo -e "${YELLOW}[SETUP] Menginstall Docker Engine untuk distro '${DISTRO_ID}'...${RESET}"

    # Pastikan curl & ca-certificates tersedia
    if ! command -v curl >/dev/null 2>&1; then
        echo -e "${BLUE}[INFO] Menginstall curl & ca-certificates...${RESET}"
        if command -v apt-get >/dev/null 2>&1; then
            $SUDO apt-get update -qq && $SUDO apt-get install -y -qq curl ca-certificates
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
            echo -e "${BLUE}[INFO] Menjalankan installer resmi Docker (https://get.docker.com)...${RESET}"
            if curl -fsSL https://get.docker.com -o /tmp/get-docker.sh; then
                $SUDO sh /tmp/get-docker.sh
                rm -f /tmp/get-docker.sh
            else
                echo -e "${YELLOW}[WARN] get.docker.com gagal. Menggunakan package manager distro...${RESET}"
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

    # Aktifkan service docker daemon
    echo -e "${BLUE}[INFO] Menyalakan dan mengaktifkan service Docker...${RESET}"
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl daemon-reload || true
        $SUDO systemctl enable --now docker || true
    elif command -v rc-service >/dev/null 2>&1; then
        $SUDO rc-update add docker default || true
        $SUDO rc-service docker start || true
    elif command -v service >/dev/null 2>&1; then
        $SUDO service docker start || true
    fi

    # Masukkan user ke grup docker
    if [ -n "${REAL_USER}" ] && [ "${REAL_USER}" != "root" ]; then
        echo -e "${BLUE}[INFO] Menambahkan user '${REAL_USER}' ke grup docker...${RESET}"
        $SUDO usermod -aG docker "${REAL_USER}" 2>/dev/null || true
    fi
}

# 4. Instalasi Docker Compose Standalone jika v2 belum ada
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
    
    echo -e "${BLUE}[INFO] Mengunduh binary Docker Compose (${COMPOSE_ARCH})...${RESET}"
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
# 5. Pengecekan Utama
# ------------------------------------------------------------------------------
# Cek Docker Engine
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${YELLOW}! Docker Engine belum terpasang. Memulai auto-install...${RESET}"
    install_docker
else
    echo -e "${GREEN}✓ Docker Engine terdeteksi: $(docker --version)${RESET}"
fi

# Cek apakah daemon docker berjalan
if ! docker info >/dev/null 2>&1; then
    echo -e "${YELLOW}! Daemon Docker belum aktif. Mencoba menyalakan service...${RESET}"
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl enable --now docker 2>/dev/null || $SUDO systemctl start docker || true
    elif command -v rc-service >/dev/null 2>&1; then
        $SUDO rc-service docker start || true
    elif command -v service >/dev/null 2>&1; then
        $SUDO service docker start || true
    fi

    # Cek ulang setelah start
    if ! docker info >/dev/null 2>&1 && ! $SUDO docker info >/dev/null 2>&1; then
        echo -e "${RED}[ERROR] Gagal menyalakan Docker daemon. Pastikan service docker aktif.${RESET}"
        exit 1
    fi
fi

# Cek Docker Compose
if docker compose version >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker Compose (v2) siap: $(docker compose version)${RESET}"
elif command -v docker-compose >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker Compose standalone terdeteksi: $(docker-compose --version)${RESET}"
else
    echo -e "${YELLOW}! Docker Compose (v2) belum terpasang. Memulai auto-install...${RESET}"
    install_docker_compose_standalone
fi

# Notifikasi hak akses user jika socket membutuhkan sudo
if ! docker ps >/dev/null 2>&1; then
    if $SUDO docker ps >/dev/null 2>&1; then
        echo -e "${YELLOW}[NOTICE] User '${REAL_USER}' perlu menerapkan grup docker.${RESET}"
        echo -e "${YELLOW}Jalankan perintah: ${BOLD}newgrp docker${RESET} atau relogin session.${RESET}"
    fi
fi

echo -e "${GREEN}✓ Docker & Docker Compose siap digunakan!${RESET}"
exit 0
