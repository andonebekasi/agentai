#!/usr/bin/env bash
# ==============================================================================
# AgentAI Stack - Universal Linux Installer
# Repository: https://github.com/andonebekasi/agentai
#
# Mendukung instalasi via curl:
#   curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash
#
# Memeriksa & menginstall secara modular / interaktif:
#   1. Full AgentAI Stack (Docker + Compose + AgentAI Stack + M365 CLI)
#   2. Docker Engine + Docker Compose (v2) saja
#   3. AgentAI Stack (9Router + Hermes + OpenClaw + NanoClaw)
#   4. Andi Pangeran M365 Copilot Agent CLI (m365) + Playwright & Cloudflared
#   5. FRP Client (frpc) untuk NAT Traversal ke VPS
#   6. FRP Server (frps) untuk VPS ber-IP publik
# ==============================================================================

set -euo pipefail

# Hubungkan kembali input terminal jika dijalankan melalui pipe (curl ... | bash)
if [ ! -t 0 ] && [ -e /dev/tty ]; then
    exec < /dev/tty
fi

# ANSI Color codes
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

REPO_URL="https://github.com/andonebekasi/agentai.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "$PWD")"

ACTION=""
FRP_SERVER_ADDR=""
FRP_AUTH_TOKEN=""
FRP_SERVER_PORT="7000"
START_ARGS=()

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "======================================================================"
    echo "    AgentAI & M365 Agent CLI Universal Installer (All Linux Distros) "
    echo "             https://github.com/andonebekasi/agentai"
    echo "======================================================================"
    echo -e "${RESET}"
}

usage() {
    echo "Penggunaan: ./install.sh [opsi]"
    echo ""
    echo "Pilihan Komponen Langsung:"
    echo "  --all, -a                    Install Semua (Auto-Install Docker + OpenClaw/Hermes/NanoClaw/9Router + M365 CLI)"
    echo "  --stack, -s                  Jalankan AgentAI Stack (OpenClaw, Hermes, NanoClaw, 9Router) + Auto M365 CLI"
    echo "  --docker, -d                 Auto-Check & Install Docker Engine & Docker Compose (v2) saja"
    echo "  --m365, -m                   Install Andi Pangeran M365 Copilot Agent CLI saja (Tinggal Login Email M365)"
    echo "  --ai-clis                    Install Gemini/AGY, Claude Code, dan GitHub Copilot CLI"
    echo "  --frp-client                 Install & Konfigurasi FRP Client (frpc) untuk AgentAI lokal"
    echo "  --frp-server                 Install & Konfigurasi FRP Server (frps) untuk VPS publik"
    echo "  --frp-both                   Install FRP Client & Server sekaligus"
    echo "  --uninstall-frp              Copot instalasi FRP dari sistem"
    echo ""
    echo "Pilihan Update Komponen (OpenClaw, Hermes, NanoClaw, 9Router):"
    echo "  --update-all                 Tarik/bangun ulang seluruh image (OpenClaw, Hermes, NanoClaw, 9Router)"
    echo "  --skip-update, --no-update   Lewati update image lokal (hanya download/build jika belum ada)"
    echo "  --update-openclaw            Update image OpenClaw saja"
    echo "  --update-hermes              Update image Hermes Agent saja"
    echo "  --update-nanoclaw            Update & build ulang NanoClaw saja"
    echo "  --update-9router             Update image 9Router saja"
    echo ""
    echo "Opsi Tambahan untuk FRP:"
    echo "  --server-addr <ip/domain>    Alamat IP publik VPS (untuk FRP client)"
    echo "  --token <secret_token>       Token autentikasi rahasia FRP"
    echo "  --server-port <port>         Port FRP server (default: 7000)"
    echo "  -h, --help                   Tampilkan panduan ini"
    echo ""
    echo "Contoh Penggunaan via curl:"
    echo "  # Mode Interaktif (Pilih paket yang ingin diinstall):"
    echo "  curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash"
    echo ""
    echo "  # Pasang Full AgentAI Stack otomatis:"
    echo "  curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --all"
    echo ""
    echo "  # Pasang Semua AI CLIs (Gemini/AGY + Claude + Copilot):"
    echo "  curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --ai-clis"
    exit 0
}

# ------------------------------------------------------------------------------
# 1. Parsing Arguments
# ------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --all|-a|all)
            ACTION="all"
            shift
            ;;
        --docker|-d|docker)
            ACTION="docker"
            shift
            ;;
        --stack|-s|stack)
            ACTION="stack"
            shift
            ;;
        --m365|-m|m365)
            ACTION="m365"
            shift
            ;;
        --ai-clis|ai-clis)
            ACTION="ai-clis"
            shift
            ;;
        --frp-client|frp-client)
            ACTION="frp-client"
            shift
            ;;
        --frp-server|frp-server)
            ACTION="frp-server"
            shift
            ;;
        --frp-both|frp-both)
            ACTION="frp-both"
            shift
            ;;
        --uninstall-frp)
            ACTION="uninstall-frp"
            shift
            ;;
        --update-all)
            START_ARGS+=("--update-all")
            shift
            ;;
        --skip-update|--no-update)
            START_ARGS+=("--skip-update")
            shift
            ;;
        --update-openclaw)
            START_ARGS+=("--update-openclaw")
            shift
            ;;
        --update-hermes)
            START_ARGS+=("--update-hermes")
            shift
            ;;
        --update-nanoclaw)
            START_ARGS+=("--update-nanoclaw")
            shift
            ;;
        --update-9router)
            START_ARGS+=("--update-9router")
            shift
            ;;
        --server-addr)
            FRP_SERVER_ADDR="$2"
            shift 2
            ;;
        --token)
            FRP_AUTH_TOKEN="$2"
            shift 2
            ;;
        --server-port)
            FRP_SERVER_PORT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}[ERROR] Opsi tidak dikenal: $1${RESET}"
            usage
            ;;
    esac
done

# ------------------------------------------------------------------------------
# 2. Deteksi Hak Akses (Root / Sudo)
# ------------------------------------------------------------------------------
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo -e "${RED}[ERROR] Script ini memerlukan akses root atau sudo untuk menginstall dependensi sistem.${RESET}"
        exit 1
    fi
fi

REAL_USER="${SUDO_USER:-$USER}"

# ------------------------------------------------------------------------------
# 3. Deteksi Distro Linux
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
# 4. Memastikan Git Terpasang & Menyiapkan Repository Jika Run via curl
# ------------------------------------------------------------------------------
ensure_git_installed() {
    if ! command -v git >/dev/null 2>&1; then
        echo -e "${BLUE}[INFO] Menginstall git...${RESET}"
        if command -v apt-get >/dev/null 2>&1; then
            $SUDO apt-get update -qq && $SUDO apt-get install -y -qq git
        elif command -v dnf >/dev/null 2>&1; then
            $SUDO dnf install -y git
        elif command -v yum >/dev/null 2>&1; then
            $SUDO yum install -y git
        elif command -v pacman >/dev/null 2>&1; then
            $SUDO pacman -Sy --noconfirm git
        elif command -v zypper >/dev/null 2>&1; then
            $SUDO zypper install -y git
        elif command -v apk >/dev/null 2>&1; then
            $SUDO apk add --no-cache git
        fi
    fi
}

ensure_repo_present() {
    if [ -f "${SCRIPT_DIR}/docker-compose.yml" ] && [ -d "${SCRIPT_DIR}/m365-agent-cli" ]; then
        cd "${SCRIPT_DIR}"
        return 0
    fi

    # Jika script dijalankan dari curl dan belum berada di dalam direktori repository
    echo -e "${YELLOW}[SETUP] Script dijalankan di luar folder repository AgentAI.${RESET}"
    TARGET_DIR="${PWD}/agentai"
    if [ ! -d "$TARGET_DIR" ]; then
        ensure_git_installed
        echo -e "${BLUE}[INFO] Meng-clone repository dari ${REPO_URL} ke ${TARGET_DIR}...${RESET}"
        git clone "$REPO_URL" "$TARGET_DIR"
    fi
    cd "$TARGET_DIR"
    SCRIPT_DIR="$TARGET_DIR"
    echo -e "${GREEN}✓ Menggunakan direktori repository: ${SCRIPT_DIR}${RESET}"
}

# ------------------------------------------------------------------------------
# 5. Instalasi Docker Engine & Compose
# ------------------------------------------------------------------------------
install_docker() {
    detect_distro
    echo -e "${YELLOW}[SETUP] Memeriksa & menginstall Docker untuk distro '${DISTRO_ID}'...${RESET}"

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
            echo -e "${BLUE}[INFO] Menjalankan script instalasi resmi Docker (get.docker.com)...${RESET}"
            if curl -fsSL https://get.docker.com -o /tmp/get-docker.sh; then
                $SUDO sh /tmp/get-docker.sh
                rm -f /tmp/get-docker.sh
            else
                echo -e "${YELLOW}[WARN] Gagal mengunduh get.docker.com. Mencoba metode package manager...${RESET}"
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

    if [ -n "${REAL_USER}" ] && [ "${REAL_USER}" != "root" ]; then
        echo -e "${BLUE}[INFO] Menambahkan user '${REAL_USER}' ke grup 'docker'...${RESET}"
        $SUDO usermod -aG docker "${REAL_USER}" || true
    fi
}

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

ensure_docker_and_compose() {
    if [ -f "${SCRIPT_DIR}/check-docker.sh" ]; then
        chmod +x "${SCRIPT_DIR}/check-docker.sh"
        "${SCRIPT_DIR}/check-docker.sh"
        return 0
    fi

    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${YELLOW}! Docker Engine belum terpasang.${RESET}"
        install_docker
    else
        echo -e "${GREEN}✓ Docker Engine sudah terpasang: $(docker --version)${RESET}"
        if ! docker info >/dev/null 2>&1; then
            echo -e "${YELLOW}! Service Docker belum berjalan. Menyalakan service...${RESET}"
            if command -v systemctl >/dev/null 2>&1; then
                $SUDO systemctl enable --now docker || true
            elif command -v service >/dev/null 2>&1; then
                $SUDO service docker start || true
            fi
        fi
    fi

    if docker compose version >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Docker Compose (v2) sudah siap: $(docker compose version)${RESET}"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Docker Compose standalone terdeteksi: $(docker-compose --version)${RESET}"
    else
        echo -e "${YELLOW}! Docker Compose (v2) belum terpasang.${RESET}"
        install_docker_compose_standalone
    fi
}

# ------------------------------------------------------------------------------
# 6. Instalasi M365 Copilot Agent CLI (m365)
# ------------------------------------------------------------------------------
install_m365_agent_cli() {
    ensure_repo_present
    echo ""
    echo -e "${CYAN}${BOLD}[M365 AGENT CLI] Memeriksa instalasi Andi Pangeran M365 Copilot Agent CLI...${RESET}"
    
    if command -v m365 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ M365 Copilot Agent CLI sudah terpasang: $(m365 --version 2>/dev/null || echo 'terpasang')${RESET}"
    else
        if [ -d "${SCRIPT_DIR}/m365-agent-cli" ] && [ -f "${SCRIPT_DIR}/m365-agent-cli/install.sh" ]; then
            echo -e "${YELLOW}[SETUP] Memasang Andi Pangeran M365 Copilot Agent CLI...${RESET}"
            chmod +x "${SCRIPT_DIR}/m365-agent-cli/install.sh"
            chmod +x "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js"
            
            (cd "${SCRIPT_DIR}/m365-agent-cli" && ./install.sh --global --in-place 2>/dev/null || ./install.sh --in-place)
            
            mkdir -p "${HOME}/.local/bin"
            ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" "${HOME}/.local/bin/m365"
            ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" "${HOME}/.local/bin/m365-copilot"
            if [ -n "$SUDO" ]; then
                $SUDO ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" /usr/local/bin/m365 2>/dev/null || true
                $SUDO ln -sf "${SCRIPT_DIR}/m365-agent-cli/bin/m365.js" /usr/local/bin/m365-copilot 2>/dev/null || true
            fi
            echo -e "${GREEN}✓ M365 Copilot Agent CLI berhasil dipasang.${RESET}"
        else
            echo -e "${YELLOW}[WARN] Direktori m365-agent-cli tidak ditemukan.${RESET}"
        fi
    fi

    # Buat direktori konfigurasi m365
    mkdir -p "${HOME}/.config/m365-copilot-cli"

    # Periksa status login
    M365_CONFIG="${HOME}/.config/m365-copilot-cli/storage-state.json"
    if [ ! -f "$M365_CONFIG" ] || ! grep -q "microsoft" "$M365_CONFIG" 2>/dev/null; then
        echo ""
        echo -e "${YELLOW}----------------------------------------------------------------------${RESET}"
        echo -e "${YELLOW}${BOLD}[LANGKAH SELANJUTNYA - LOGIN EMAIL M365]${RESET}"
        echo -e "M365 CLI (Andi Pangeran) telah siap. Anda tinggal login dengan email M365:"
        echo -e "    ${CYAN}${BOLD}m365 login${RESET}"
        echo -e "(Setelah login, Copilot otomatis dapat digunakan oleh 9Router, Hermes & OpenClaw!)"
        echo -e "${YELLOW}----------------------------------------------------------------------${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 7. Eksekusi FRP Installer
# ------------------------------------------------------------------------------
run_frp_installer() {
    local frp_role="$1"
    shift || true

    local frp_cmd=()
    if [ -f "${SCRIPT_DIR}/install-frp.sh" ]; then
        chmod +x "${SCRIPT_DIR}/install-frp.sh"
        frp_cmd=("${SCRIPT_DIR}/install-frp.sh")
    else
        ensure_git_installed
        echo -e "${BLUE}[INFO] Mengunduh script install-frp.sh dari repository...${RESET}"
        curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh -o /tmp/install-frp.sh
        chmod +x /tmp/install-frp.sh
        frp_cmd=("/tmp/install-frp.sh")
    fi

    if [ -n "$frp_role" ]; then
        frp_cmd+=("$frp_role")
    fi

    if [ -n "$FRP_SERVER_ADDR" ]; then
        frp_cmd+=(--server-addr "$FRP_SERVER_ADDR")
    fi
    if [ -n "$FRP_AUTH_TOKEN" ]; then
        frp_cmd+=(--token "$FRP_AUTH_TOKEN")
    fi
    if [ -n "$FRP_SERVER_PORT" ]; then
        frp_cmd+=(--server-port "$FRP_SERVER_PORT")
    fi

    "${frp_cmd[@]}" "$@"
}

# ------------------------------------------------------------------------------
# 8. Menjalankan AgentAI Stack
# ------------------------------------------------------------------------------
choose_component_updates() {
    if [ -t 0 ] && [ ${#START_ARGS[@]} -eq 0 ]; then
        echo ""
        echo -e "${CYAN}${BOLD}[UPDATE KOMPONEN AGENTAI]${RESET}"
        echo -e "Anda dapat memilih apakah ingin mengupdate image/service OpenClaw, Hermes & NanoClaw:"
        echo -e "  ${CYAN}1) Update Semua${RESET} (Tarik OpenClaw, Hermes, 9Router & Rebuild NanoClaw)"
        echo -e "  ${CYAN}2) Pilih Komponen${RESET} (Boleh pilih sendiri: OpenClaw, Hermes, dan/atau NanoClaw)"
        echo -e "  ${CYAN}3) Lewati Update${RESET} (Gunakan versi yang ada di mesin / hemat bandwidth & waktu) [Default]"
        echo ""
        read -r -p "Pilihan update [1-3] (default: 3): " update_menu_choice
        case "${update_menu_choice:-3}" in
            1)
                START_ARGS+=("--update-all")
                ;;
            2)
                echo -e "${BLUE}Pilih komponen yang ingin Anda update [y/N]:${RESET}"
                read -r -p "  - Update OpenClaw (ghcr.io/openclaw/openclaw:latest)? [y/N]: " uc_oc
                case "$uc_oc" in [yY][eE][sS]|[yY]) START_ARGS+=("--update-openclaw") ;; esac
                read -r -p "  - Update Hermes Agent (nousresearch/hermes-agent:latest)? [y/N]: " uc_hm
                case "$uc_hm" in [yY][eE][sS]|[yY]) START_ARGS+=("--update-hermes") ;; esac
                read -r -p "  - Update & Rebuild NanoClaw? [y/N]: " uc_nc
                case "$uc_nc" in [yY][eE][sS]|[yY]) START_ARGS+=("--update-nanoclaw") ;; esac
                read -r -p "  - Update 9Router (decolua/9router:latest)? [y/N]: " uc_nr
                case "$uc_nr" in [yY][eE][sS]|[yY]) START_ARGS+=("--update-9router") ;; esac
                if [ ${#START_ARGS[@]} -eq 0 ]; then
                    START_ARGS+=("--skip-update")
                fi
                ;;
            *)
                START_ARGS+=("--skip-update")
                ;;
        esac
    fi
}

start_agentai_stack() {
    ensure_repo_present
    ensure_docker_and_compose
    install_m365_agent_cli

    echo ""
    echo -e "${BLUE}[STEP] Menyiapkan hak akses script start.sh, destroy.sh, status.sh, check-docker.sh...${RESET}"
    chmod +x start.sh destroy.sh status.sh check-docker.sh docker/nanoclaw/entrypoint.sh 2>/dev/null || true
    if [ -f "${SCRIPT_DIR}/install-frp.sh" ]; then
        chmod +x "${SCRIPT_DIR}/install-frp.sh"
    fi

    echo -e "${CYAN}[LAUNCH] Memulai AgentAI stack melalui ./start.sh...${RESET}"
    ./start.sh "${START_ARGS[@]}"
}

# ------------------------------------------------------------------------------
# 9. Menu Interaktif (Bisa Pilih Mau Apa)
# ------------------------------------------------------------------------------
print_banner

if [ -z "$ACTION" ]; then
    if [ -t 0 ]; then
        echo -e "${BOLD}Silakan pilih paket instalasi yang Anda inginkan:${RESET}"
        echo -e "  ${CYAN}1) [All-in-One Lengkap] OpenClaw + Hermes + NanoClaw + 9Router${RESET}  ${GREEN}[Rekomendasi]${RESET}"
        echo -e "     ${YELLOW}• Auto-Check & Auto-Install Docker Engine + Compose (jika belum ada)${RESET}"
        echo -e "     ${YELLOW}• Auto-Install Andi Pangeran M365 Copilot Agent CLI (Tinggal Login Email M365)${RESET}"
        echo -e "     ${YELLOW}• Opsi konfigurasi FRP Reverse Proxy Client ke VPS${RESET}"
        echo -e "     ${YELLOW}• Bebas pilih update komponen: OpenClaw, Hermes, NanoClaw${RESET}"
        echo ""
        echo -e "  ${CYAN}2) [AgentAI Stack Saja] OpenClaw + Hermes + NanoClaw + 9Router${RESET}"
        echo -e "     ${YELLOW}• Auto-Check/Install Docker + Auto-Install M365 CLI (Tinggal Login Email M365)${RESET}"
        echo -e "     ${YELLOW}• Bebas pilih update komponen: OpenClaw, Hermes, NanoClaw${RESET}"
        echo ""
        echo -e "  ${CYAN}3) [Docker Saja] Auto-Check & Install Docker Engine & Compose (v2)${RESET}"
        echo -e "     ${YELLOW}• Menjalankan check-docker.sh untuk semua distro Linux${RESET}"
        echo ""
        echo -e "  ${CYAN}4) [M365 CLI Saja] Andi Pangeran M365 Copilot Agent CLI${RESET}"
        echo -e "     ${YELLOW}• CLI Agent Linux + AI Router Port 5365 (Tinggal Login Email M365: m365 login)${RESET}"
        echo ""
        echo -e "  ${CYAN}5) [FRP Client] Fast Reverse Proxy Client (frpc)${RESET}"
        echo -e "     ${YELLOW}• Ekspos 9Router, OpenClaw, Hermes, NanoClaw, M365 dari balik NAT/WiFi ke VPS${RESET}"
        echo ""
        echo -e "  ${CYAN}6) [FRP Server] Fast Reverse Proxy Server (frps)${RESET}"
        echo -e "     ${YELLOW}• Pasang di VPS Publik untuk Tunnel & Web Dashboard Monitoring Port 7500${RESET}"
        echo ""
        echo -e "  ${CYAN}7) [FRP Keduanya] Pasang FRP Client & Server sekaligus di mesin ini${RESET}"
        echo ""
        echo -e "  ${YELLOW}8) [Uninstall FRP] Copot service & binary FRP dari sistem${RESET}"
        echo ""
        echo -e "  ${CYAN}9) [AI CLIs] Install Gemini/AGY + Claude Code + GitHub Copilot CLI${RESET}"
        echo -e "     ${YELLOW}• Google Antigravity/Gemini (agy), Anthropic Claude (claude), GitHub Copilot (copilot)${RESET}"
        echo ""
        echo -e "  ${RED}10) Keluar / Exit${RESET}"
        echo ""
        read -r -p "Masukkan nomor pilihan [1-10] (default: 1): " user_choice
        case "${user_choice:-1}" in
            1) ACTION="all" ;;
            2) ACTION="stack" ;;
            3) ACTION="docker" ;;
            4) ACTION="m365" ;;
            5) ACTION="frp-client" ;;
            6) ACTION="frp-server" ;;
            7) ACTION="frp-both" ;;
            8) ACTION="uninstall-frp" ;;
            9) ACTION="ai-clis" ;;
            *) echo "Instalasi dibatalkan."; exit 0 ;;
        esac
    else
        ACTION="all"
    fi
fi

# ------------------------------------------------------------------------------
# 10. Eksekusi Berdasarkan Pilihan
# ------------------------------------------------------------------------------
case "$ACTION" in
    docker)
        ensure_docker_and_compose
        echo -e "${GREEN}✓ Instalasi Docker & Compose selesai!${RESET}"
        ;;

    m365)
        install_m365_agent_cli
        echo -e "${GREEN}✓ Instalasi M365 Copilot Agent CLI selesai! Ketik: ${BOLD}m365 --help${RESET}"
        ;;

    stack)
        choose_component_updates
        start_agentai_stack
        ;;

    frp-client)
        run_frp_installer "client"
        ;;

    frp-server)
        run_frp_installer "server"
        ;;

    frp-both)
        run_frp_installer "both"
        ;;

    ai-clis)
        if [ -f "${SCRIPT_DIR}/install-ai-clis.sh" ]; then
            chmod +x "${SCRIPT_DIR}/install-ai-clis.sh"
            "${SCRIPT_DIR}/install-ai-clis.sh" --all
        else
            curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --all
        fi
        ;;

    uninstall-frp)
        run_frp_installer "" --uninstall
        ;;

    all)
        ensure_repo_present
        ensure_docker_and_compose
        install_m365_agent_cli

        # Pertanyaan instalasi FRP opsional jika interaktif
        INSTALL_FRP=false
        if [ -t 0 ]; then
            echo ""
            echo -e "${CYAN}${BOLD}[FRP REVERSE PROXY] Pengecekan Fast Reverse Proxy (frp)...${RESET}"
            if ! command -v frpc >/dev/null 2>&1; then
                echo -e "${YELLOW}FRP memungkinkan Anda mengakses 9Router, Hermes, OpenClaw, dan M365 Router${RESET}"
                echo -e "${YELLOW}dari internet via VPS publik ketika server Anda di balik WiFi / NAT.${RESET}"
                read -r -p "Apakah Anda ingin menginstall & konfigurasi FRP Client sekarang? [y/N]: " frp_choice
                case "$frp_choice" in
                    [yY][eE][sS]|[yY])
                        INSTALL_FRP=true
                        ;;
                    *)
                        INSTALL_FRP=false
                        ;;
                esac
            fi
        fi

        if [ "$INSTALL_FRP" = true ]; then
            run_frp_installer "client"
        fi

        echo ""
        echo -e "${GREEN}✓ Seluruh dependensi host (Docker + Compose + M365 Agent CLI) telah siap!${RESET}"

        # Tanya apakah langsung jalankan stack
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
            choose_component_updates
            start_agentai_stack
        else
            echo -e "${GREEN}Instalasi selesai!${RESET}"
            echo -e "Untuk menjalankan AgentAI stack kapan saja, ketik:"
            echo -e "    ${BOLD}./start.sh${RESET}"
            echo -e "Untuk menggunakan M365 Copilot CLI, ketik:"
            echo -e "    ${BOLD}m365 --help${RESET}"
        fi
        ;;
esac
