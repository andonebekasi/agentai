#!/usr/bin/env bash
# ==============================================================================
# FRP (Fast Reverse Proxy) Universal Installer & Configurator
# https://github.com/fatedier/frp
#
# Mendukung instalasi pada:
#   1. FRP Client (frpc) -> Host lokal / server di balik NAT (AgentAI machine)
#   2. FRP Server (frps) -> Host VPS publik dengan IP Publik
#   3. Keduanya (Client & Server)
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
DEFAULT_VERSION="v0.72.0"

# Defaults
ROLE=""
SERVER_ADDR=""
SERVER_PORT="7000"
AUTH_TOKEN=""
DASHBOARD_PORT="7500"
FRP_VERSION=""
DO_UNINSTALL=false

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "======================================================================"
    echo "       FRP (Fast Reverse Proxy) Universal Installer & Setup"
    echo "               https://github.com/fatedier/frp"
    echo "======================================================================"
    echo -e "${RESET}"
}

usage() {
    echo "Usage: ./install-frp.sh [role] [options]"
    echo ""
    echo "Role:"
    echo "  client                     Install frpc (Client) untuk mesin AgentAI lokal"
    echo "  server                     Install frps (Server) untuk VPS ber-IP publik"
    echo "  both                       Install frpc dan frps sekaligus"
    echo ""
    echo "Options:"
    echo "  --role <client|server|both>  Tentukan peran instalasi"
    echo "  --server-addr <ip/domain>    Alamat IP publik atau domain VPS (khusus client)"
    echo "  --server-port <port>         Port FRP server (default: 7000)"
    echo "  --token <secret_token>       Token autentikasi rahasia FRP"
    echo "  --dashboard-port <port>      Port Dashboard Web UI FRP Server (default: 7500)"
    echo "  --version <vX.Y.Z>           Versi rilis FRP (default: deteksi otomatis / latest)"
    echo "  --uninstall                  Hentikan dan copot instalasi FRP dari sistem"
    echo "  -h, --help                   Tampilkan bantuan ini"
    echo ""
    echo "Contoh Penggunaan:"
    echo "  # Install di VPS Publik:"
    echo "  ./install-frp.sh server --token \"MySecretToken123\""
    echo ""
    echo "  # Install di Host AgentAI Lokal:"
    echo "  ./install-frp.sh client --server-addr \"203.0.113.10\" --token \"MySecretToken123\""
    echo ""
    echo "  # Mode Interaktif:"
    echo "  ./install-frp.sh"
    exit 0
}

# ------------------------------------------------------------------------------
# 1. Parsing Arguments
# ------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        client|server|both)
            ROLE="$1"
            shift
            ;;
        --role)
            ROLE="$2"
            shift 2
            ;;
        --server-addr)
            SERVER_ADDR="$2"
            shift 2
            ;;
        --server-port)
            SERVER_PORT="$2"
            shift 2
            ;;
        --token)
            AUTH_TOKEN="$2"
            shift 2
            ;;
        --dashboard-port)
            DASHBOARD_PORT="$2"
            shift 2
            ;;
        --version)
            FRP_VERSION="$2"
            shift 2
            ;;
        --uninstall)
            DO_UNINSTALL=true
            shift
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
        echo -e "${RED}[ERROR] Script ini memerlukan akses root atau sudo untuk menginstall system service.${RESET}"
        exit 1
    fi
fi

# ------------------------------------------------------------------------------
# 3. Proses Uninstall jika diminta
# ------------------------------------------------------------------------------
uninstall_frp() {
    echo -e "${YELLOW}[UNINSTALL] Menghentikan dan mencopot service FRP...${RESET}"
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl stop frpc frps 2>/dev/null || true
        $SUDO systemctl disable frpc frps 2>/dev/null || true
    fi
    $SUDO rm -f /etc/systemd/system/frpc.service /etc/systemd/system/frps.service
    $SUDO rm -f /usr/local/bin/frpc /usr/local/bin/frps
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl daemon-reload || true
    fi
    echo -e "${GREEN}✓ FRP berhasil dicopot dari sistem.${RESET}"
    exit 0
}

if [ "$DO_UNINSTALL" = true ]; then
    uninstall_frp
fi

print_banner

# ------------------------------------------------------------------------------
# 4. Mode Interaktif jika argumen belum lengkap
# ------------------------------------------------------------------------------
if [ -z "$ROLE" ]; then
    if [ -t 0 ]; then
        echo -e "${BOLD}Pilih peran instalasi FRP untuk server/komputer ini:${RESET}"
        echo -e "  ${CYAN}1) FRP Client (frpc)${RESET}  -> Untuk mesin AgentAI lokal (di balik NAT / WiFi rumah / intranet)"
        echo -e "  ${CYAN}2) FRP Server (frps)${RESET}  -> Untuk VPS publik (misal AWS EC2, DigitalOcean, Linode)"
        echo -e "  ${CYAN}3) Keduanya (Client & Server)${RESET}"
        echo ""
        read -r -p "Masukkan pilihan [1-3] (default: 1): " role_choice
        case "${role_choice:-1}" in
            2) ROLE="server" ;;
            3) ROLE="both" ;;
            *) ROLE="client" ;;
        esac
    else
        ROLE="client"
    fi
fi

if [[ "$ROLE" == "client" || "$ROLE" == "both" ]] && [ -z "$SERVER_ADDR" ]; then
    if [ -t 0 ]; then
        echo ""
        read -r -p "Masukkan IP Publik atau Domain dari FRP Server VPS (cth: 203.0.113.50): " SERVER_ADDR
    fi
    SERVER_ADDR="${SERVER_ADDR:-127.0.0.1}"
fi

if [ -z "$AUTH_TOKEN" ]; then
    if [ -t 0 ]; then
        read -r -p "Masukkan secret token autentikasi FRP (enter untuk default): " user_tok
        AUTH_TOKEN="${user_tok:-agentai_secret_$(openssl rand -hex 6 2>/dev/null || echo 'frp123456')}"
    else
        AUTH_TOKEN="agentai_secret_token_default"
    fi
fi

# ------------------------------------------------------------------------------
# 5. Deteksi Arsitektur CPU
# ------------------------------------------------------------------------------
detect_arch() {
    ARCH_RAW="$(uname -m)"
    case "$ARCH_RAW" in
        x86_64|amd64)
            FRP_ARCH="amd64"
            ;;
        aarch64|arm64)
            FRP_ARCH="arm64"
            ;;
        armv7*|armhf)
            FRP_ARCH="arm"
            ;;
        i386|i686)
            FRP_ARCH="386"
            ;;
        riscv64)
            FRP_ARCH="riscv64"
            ;;
        *)
            echo -e "${RED}[ERROR] Arsitektur tidak didukung: $ARCH_RAW${RESET}"
            exit 1
            ;;
    esac
    echo -e "${BLUE}[INFO] Arsitektur CPU terdeteksi: ${BOLD}${ARCH_RAW}${RESET} -> mapped ke binary: ${BOLD}linux_${FRP_ARCH}${RESET}"
}

# ------------------------------------------------------------------------------
# 6. Menentukan Versi & Download Binary
# ------------------------------------------------------------------------------
download_and_install_binaries() {
    detect_arch

    if [ -z "$FRP_VERSION" ]; then
        echo -e "${BLUE}[INFO] Memeriksa versi rilis FRP terbaru dari GitHub...${RESET}"
        LATEST_TAG=$(curl -s --max-time 6 https://api.github.com/repos/fatedier/frp/releases/latest 2>/dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || true)
        if [[ -n "$LATEST_TAG" && "$LATEST_TAG" =~ ^v[0-9] ]]; then
            FRP_VERSION="$LATEST_TAG"
            echo -e "${GREEN}✓ Versi terbaru terdeteksi: ${BOLD}${FRP_VERSION}${RESET}"
        else
            FRP_VERSION="$DEFAULT_VERSION"
            echo -e "${YELLOW}[WARN] Gagal mendapatkan tag via GitHub API. Menggunakan versi default: ${BOLD}${FRP_VERSION}${RESET}"
        fi
    fi

    VER_CLEAN="${FRP_VERSION#v}"
    TAR_NAME="frp_${VER_CLEAN}_linux_${FRP_ARCH}.tar.gz"
    DOWNLOAD_URL="https://github.com/fatedier/frp/releases/download/${FRP_VERSION}/${TAR_NAME}"

    TEMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TEMP_DIR"' EXIT

    echo -e "${YELLOW}[DOWNLOAD] Mengunduh ${TAR_NAME} dari GitHub Releases...${RESET}"
    if ! curl -fSL --progress-bar "$DOWNLOAD_URL" -o "${TEMP_DIR}/${TAR_NAME}"; then
        echo -e "${RED}[ERROR] Gagal mengunduh FRP dari: ${DOWNLOAD_URL}${RESET}"
        exit 1
    fi

    echo -e "${BLUE}[SETUP] Mengekstrak binary FRP...${RESET}"
    tar -xzf "${TEMP_DIR}/${TAR_NAME}" -C "${TEMP_DIR}"
    EXTRACT_DIR="${TEMP_DIR}/frp_${VER_CLEAN}_linux_${FRP_ARCH}"

    $SUDO install -m 755 "${EXTRACT_DIR}/frpc" /usr/local/bin/frpc
    $SUDO install -m 755 "${EXTRACT_DIR}/frps" /usr/local/bin/frps
    $SUDO mkdir -p /etc/frp
    mkdir -p "${SCRIPT_DIR}/frp"

    echo -e "${GREEN}✓ Binary /usr/local/bin/frpc dan /usr/local/bin/frps berhasil dipasang.${RESET}"
    echo -e "  Versi: $(/usr/local/bin/frpc -v 2>/dev/null || echo "$FRP_VERSION")"
}

# ------------------------------------------------------------------------------
# 7. Konfigurasi FRP Client (frpc)
# ------------------------------------------------------------------------------
setup_frp_client() {
    echo ""
    echo -e "${CYAN}${BOLD}[CONFIG] Mengonfigurasi FRP Client (frpc)...${RESET}"
    
    # Ambil port dari .env jika ada
    if [ -f "${SCRIPT_DIR}/.env" ]; then
        # shellcheck disable=SC1091
        source "${SCRIPT_DIR}/.env" 2>/dev/null || true
    fi

    N9_PORT="${NINE_ROUTER_PORT:-20128}"
    OC_PORT="${OPENCLAW_PORT:-18789}"
    HM_PORT="${HERMES_PORT:-8088}"
    NC_PORT="${NANOCLAW_PORT:-18790}"
    M3_PORT="${M365_ROUTER_PORT:-5365}"

    REMOTE_N9_PORT="${FRP_REMOTE_9ROUTER_PORT:-$N9_PORT}"
    REMOTE_OC_PORT="${FRP_REMOTE_OPENCLAW_PORT:-$OC_PORT}"
    REMOTE_HM_PORT="${FRP_REMOTE_HERMES_PORT:-$HM_PORT}"
    REMOTE_NC_PORT="${FRP_REMOTE_NANOCLAW_PORT:-$NC_PORT}"
    REMOTE_M3_PORT="${FRP_REMOTE_M365_PORT:-$M3_PORT}"

    CONFIG_FILE="/etc/frp/frpc.toml"
    LOCAL_CONFIG="${SCRIPT_DIR}/frp/frpc.toml"

    # Buat file konfigurasi frpc.toml
    cat <<EOF | $SUDO tee "$CONFIG_FILE" >/dev/null
# ==============================================================================
# FRP Client Configuration (frpc.toml) - Auto-generated by install-frp.sh
# ==============================================================================

serverAddr = "${SERVER_ADDR}"
serverPort = ${SERVER_PORT}

auth.method = "token"
auth.token = "${AUTH_TOKEN}"

transport.tcpMux = true
transport.poolCount = 5

# 1. 9Router AI Gateway Web UI & LLM Proxy
[[proxies]]
name = "agentai-9router"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${N9_PORT}
remotePort = ${REMOTE_N9_PORT}

# 2. OpenClaw Autonomous AI Control UI
[[proxies]]
name = "agentai-openclaw"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${OC_PORT}
remotePort = ${REMOTE_OC_PORT}

# 3. Hermes Agent Dashboard
[[proxies]]
name = "agentai-hermes"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${HM_PORT}
remotePort = ${REMOTE_HM_PORT}

# 4. NanoClaw Agent Service
[[proxies]]
name = "agentai-nanoclaw"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${NC_PORT}
remotePort = ${REMOTE_NC_PORT}

# 5. M365 Copilot Agent Router
[[proxies]]
name = "agentai-m365-router"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${M3_PORT}
remotePort = ${REMOTE_M3_PORT}
EOF

    # Sinkronkan juga ke direktori project frp/frpc.toml
    cp "$CONFIG_FILE" "$LOCAL_CONFIG" 2>/dev/null || $SUDO cp "$CONFIG_FILE" "$LOCAL_CONFIG"

    echo -e "${GREEN}✓ File konfigurasi frpc.toml berhasil dibuat di /etc/frp/frpc.toml dan ./frp/frpc.toml.${RESET}"

    # Buat systemd service frpc
    echo -e "${BLUE}[SYSTEMD] Memasang systemd service untuk frpc...${RESET}"
    cat <<EOF | $SUDO tee /etc/systemd/system/frpc.service >/dev/null
[Unit]
Description=FRP Client Service (AgentAI Reverse Proxy)
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Restart=always
RestartSec=5s
ExecStart=/usr/local/bin/frpc -c /etc/frp/frpc.toml
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl daemon-reload
        $SUDO systemctl enable frpc
        echo -e "${BLUE}[INFO] Menjalankan service frpc...${RESET}"
        $SUDO systemctl restart frpc || true
        echo -e "${GREEN}✓ Service frpc aktif dan enabled saat boot.${RESET}"
    fi

    # Update .env jika ada
    if [ -f "${SCRIPT_DIR}/.env" ]; then
        if grep -q "ENABLE_FRP=" "${SCRIPT_DIR}/.env"; then
            sed -i "s/^ENABLE_FRP=.*/ENABLE_FRP=true/" "${SCRIPT_DIR}/.env"
            sed -i "s/^FRP_SERVER_ADDR=.*/FRP_SERVER_ADDR=${SERVER_ADDR}/" "${SCRIPT_DIR}/.env"
            sed -i "s/^FRP_AUTH_TOKEN=.*/FRP_AUTH_TOKEN=${AUTH_TOKEN}/" "${SCRIPT_DIR}/.env"
        fi
    fi
}

# ------------------------------------------------------------------------------
# 8. Konfigurasi FRP Server (frps)
# ------------------------------------------------------------------------------
setup_frp_server() {
    echo ""
    echo -e "${CYAN}${BOLD}[CONFIG] Mengonfigurasi FRP Server (frps)...${RESET}"
    
    CONFIG_FILE="/etc/frp/frps.toml"
    LOCAL_CONFIG="${SCRIPT_DIR}/frp/frps.toml"

    cat <<EOF | $SUDO tee "$CONFIG_FILE" >/dev/null
# ==============================================================================
# FRP Server Configuration (frps.toml) - Auto-generated by install-frp.sh
# ==============================================================================

bindPort = ${SERVER_PORT}

auth.method = "token"
auth.token = "${AUTH_TOKEN}"

webServer.addr = "0.0.0.0"
webServer.port = ${DASHBOARD_PORT}
webServer.user = "admin"
webServer.password = "admin123456"

log.to = "/var/log/frps.log"
log.level = "info"
log.maxDays = 7

transport.tcpMux = true
transport.maxPoolCount = 50
EOF

    cp "$CONFIG_FILE" "$LOCAL_CONFIG" 2>/dev/null || $SUDO cp "$CONFIG_FILE" "$LOCAL_CONFIG"

    echo -e "${GREEN}✓ File konfigurasi frps.toml berhasil dibuat di /etc/frp/frps.toml dan ./frp/frps.toml.${RESET}"

    # Buat systemd service frps
    echo -e "${BLUE}[SYSTEMD] Memasang systemd service untuk frps...${RESET}"
    cat <<EOF | $SUDO tee /etc/systemd/system/frps.service >/dev/null
[Unit]
Description=FRP Server Service (Fast Reverse Proxy Server)
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Restart=always
RestartSec=5s
ExecStart=/usr/local/bin/frps -c /etc/frp/frps.toml
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl daemon-reload
        $SUDO systemctl enable frps
        echo -e "${BLUE}[INFO] Menjalankan service frps...${RESET}"
        $SUDO systemctl restart frps || true
        echo -e "${GREEN}✓ Service frps aktif dan enabled saat boot.${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 9. Main Flow
# ------------------------------------------------------------------------------
download_and_install_binaries

case "$ROLE" in
    client)
        setup_frp_client
        ;;
    server)
        setup_frp_server
        ;;
    both)
        setup_frp_server
        setup_frp_client
        ;;
esac

echo ""
echo -e "${GREEN}${BOLD}======================================================================${RESET}"
echo -e "${GREEN}${BOLD}             Instalasi FRP Berhasil Diselesaikan!                     ${RESET}"
echo -e "${GREEN}${BOLD}======================================================================${RESET}"
echo ""

if [[ "$ROLE" == "server" || "$ROLE" == "both" ]]; then
    echo -e "${BOLD}Informasi FRP Server (VPS):${RESET}"
    echo -e "  - Bind Port       : ${CYAN}${SERVER_PORT}${RESET}"
    echo -e "  - Auth Token      : ${YELLOW}${AUTH_TOKEN}${RESET}"
    echo -e "  - Web Dashboard   : ${CYAN}http://IP-VPS:${DASHBOARD_PORT}${RESET} (User: ${YELLOW}admin${RESET} / Pass: ${YELLOW}admin123456${RESET})"
    echo -e "  - Systemd Command : ${YELLOW}sudo systemctl status frps${RESET}"
    echo ""
fi

if [[ "$ROLE" == "client" || "$ROLE" == "both" ]]; then
    echo -e "${BOLD}Informasi FRP Client (Local Host):${RESET}"
    echo -e "  - Terhubung ke    : ${CYAN}${SERVER_ADDR}:${SERVER_PORT}${RESET}"
    echo -e "  - Auth Token      : ${YELLOW}${AUTH_TOKEN}${RESET}"
    echo -e "  - Systemd Command : ${YELLOW}sudo systemctl status frpc${RESET}"
    echo ""
    echo -e "${BOLD}Daftar Akses Remote (via VPS IP ${SERVER_ADDR}):${RESET}"
    echo -e "  - 9Router AI Gateway : ${CYAN}http://${SERVER_ADDR}:20128${RESET}"
    echo -e "  - OpenClaw UI        : ${CYAN}http://${SERVER_ADDR}:18789${RESET}"
    echo -e "  - Hermes Dashboard   : ${CYAN}http://${SERVER_ADDR}:8088${RESET}"
    echo -e "  - NanoClaw Service   : ${CYAN}http://${SERVER_ADDR}:18790${RESET}"
    echo -e "  - M365 AI Router     : ${CYAN}http://${SERVER_ADDR}:5365/v1${RESET}"
    echo ""
    echo -e "${YELLOW}Catatan Keamanan:${RESET} Pastikan firewall / Security Group VPS Anda telah membuka port-port di atas."
fi
echo -e "${GREEN}======================================================================${RESET}"
