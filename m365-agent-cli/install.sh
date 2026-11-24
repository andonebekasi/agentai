#!/usr/bin/env bash
# ==============================================================================
# Microsoft 365 Copilot Linux CLI (m365) - Universal Multi-Distro Installer
# Mendukung:
#   - Ubuntu / Debian / Linux Mint / Pop!_OS / Kali (apt)
#   - RHEL / AlmaLinux / Rocky Linux / CentOS / Fedora (dnf / yum)
#   - Arch Linux / Manjaro / EndeavourOS (pacman)
#   - openSUSE Leap / Tumbleweed (zypper)
#   - Alpine Linux (apk)
# ==============================================================================

set -euo pipefail

# Warna output terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${M365_INSTALL_DIR:-$HOME/.local/share/m365-copilot-cli}"
BIN_DIR="${M365_BIN_DIR:-$HOME/.local/bin}"

SKIP_CLOUDFLARED=0
GLOBAL_SYMLINK=0
IN_PLACE=0

usage() {
  cat <<EOF
Penggunaan: ./install.sh [OPSI]

Opsi:
  --in-place          Gunakan langsung direktori saat ini ($SCRIPT_DIR) tanpa menyalin ke ~/.local/share
  --global            Pasang juga symlink di /usr/local/bin/m365 (membutuhkan sudo)
  --skip-cloudflared  Jangan menginstal binary cloudflared (Quick Tunnel)
  --dir <path>        Tentukan direktori instalasi kustom (default: ~/.local/share/m365-copilot-cli)
  -h, --help          Tampilkan bantuan ini
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --in-place)
      IN_PLACE=1
      shift
      ;;
    --global)
      GLOBAL_SYMLINK=1
      shift
      ;;
    --skip-cloudflared)
      SKIP_CLOUDFLARED=1
      shift
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      warn "Opsi tidak dikenal: $1"
      usage
      exit 1
      ;;
  esac
done

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
      .---.           ___    _   ______  ____   ____  ___    _   ______________  ___    ___    _   __
     /     \         /   |  / | / / __ \/  _/  / __ \/   |  / | / / ____/ ____/ / __ \/   |  / | / /
     \.@_@./        / /| | /  |/ / / / // /   / /_/ / /| | /  |/ / / __/ __/   / /_/ / /| | /  |/ / 
     /`\_/`\       / ___ |/ /|  / /_/ // /   / ____/ ___ |/ /|  / /_/ / /___  / _, _/ ___ |/ /|  /  
    //  _  \\      /_/  |_/_/ |_/_____/___/  /_/   /_/  |_/_/ |_/\____/_____/ /_/ |_/_/  |_/_/ |_/   
   | \     )|_     ⚡ A N D I   P A N G E R A N   M 3 6 5   C L I  •  Universal Linux Installer
  /`\_`>  <_/ \    ──────────────────────────────────────────────────────────────────────────────────
  \__/'---'\__/    🐧 Microsoft 365 Copilot Linux Agent (m365.cloud.microsoft)
EOF
echo -e "${NC}"

# Cek apakah butuh sudo
SUDO=""
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    warn "Perintah 'sudo' tidak ditemukan dan Anda bukan root. Instalasi paket sistem mungkin dilewati."
  fi
fi

# 1. Deteksi Distro Linux & Arsitektur
OS_ID="unknown"
OS_LIKE=""
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_LIKE="${ID_LIKE:-}"
fi

ARCH="$(uname -m)"
info "Terdeteksi OS: ${BOLD}${OS_ID}${NC} (like: ${OS_LIKE:-none}) | Arsitektur: ${BOLD}${ARCH}${NC}"

detect_pkg_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  elif command -v pacman >/dev/null 2>&1; then
    echo "pacman"
  elif command -v zypper >/dev/null 2>&1; then
    echo "zypper"
  elif command -v apk >/dev/null 2>&1; then
    echo "apk"
  else
    echo "unknown"
  fi
}

PKG_MGR="$(detect_pkg_manager)"
info "Package Manager: ${BOLD}${PKG_MGR}${NC}"

# 2. Instalasi Paket Dasar & Dependensi Library Headless Browser (Chromium/Playwright)
install_system_deps() {
  info "Memeriksa dan menginstal dependensi sistem untuk Headless Browser & CLI..."
  case "$PKG_MGR" in
    apt)
      $SUDO apt-get update -y
      $SUDO apt-get install -y \
        curl wget ca-certificates git tar gzip \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
        libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
        fonts-liberation libasound2t64 2>/dev/null || \
      $SUDO apt-get install -y \
        curl wget ca-certificates git tar gzip \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
        libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
        fonts-liberation libasound2
      ;;
    dnf)
      $SUDO dnf install -y \
        curl wget ca-certificates git tar gzip \
        nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon \
        libXcomposite libXdamage libXrandr mesa-libgbm pango cairo \
        alsa-lib liberation-fonts
      ;;
    yum)
      $SUDO yum install -y \
        curl wget ca-certificates git tar gzip \
        nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon \
        libXcomposite libXdamage libXrandr mesa-libgbm pango cairo \
        alsa-lib liberation-fonts
      ;;
    pacman)
      $SUDO pacman -Sy --noconfirm --needed \
        curl wget ca-certificates git tar gzip \
        nss nspr at-spi2-core libcups libdrm libxkbcommon \
        libxcomposite libxdamage libxrandr mesa pango cairo \
        alsa-lib ttf-liberation
      ;;
    zypper)
      $SUDO zypper --non-interactive install \
        curl wget ca-certificates git tar gzip \
        mozilla-nss libatk-1_0-0 libatk-bridge-2_0-0 libcups2 \
        libdrm2 libxkbcommon0 libXcomposite1 libXdamage1 libXrandr2 \
        libgbm1 libpango-1_0-0 libcairo2 libasound2 liberation-fonts
      ;;
    apk)
      $SUDO apk add --no-cache \
        bash curl wget ca-certificates git tar gzip \
        nss freetype harfbuzz ttf-freefont chromium
      ;;
    *)
      warn "Package manager tidak dikenali secara otomatis. Pastikan library Chromium & curl sudah terpasang."
      ;;
  esac
  success "Dependensi sistem selesai diperiksa."
}

install_system_deps

# 3. Cek & Instal Node.js >= 18
install_nodejs() {
  local need_node=1
  if command -v node >/dev/null 2>&1; then
    local node_ver
    node_ver="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "$node_ver" -ge 18 ]]; then
      success "Node.js sudah terpasang: $(node -v) (npm: $(npm -v 2>/dev/null || echo 'N/A'))"
      need_node=0
    else
      warn "Versi Node.js saat ini ($(node -v)) terlalu lama (butuh >= v18). Mengupgrade Node.js..."
    fi
  else
    info "Node.js belum terpasang. Menginstal Node.js LTS..."
  fi

  if [[ "$need_node" -eq 1 ]]; then
    case "$PKG_MGR" in
      apt)
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
        $SUDO apt-get install -y nodejs
        ;;
      dnf)
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO dnf install -y nodejs
        ;;
      yum)
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO yum install -y nodejs
        ;;
      pacman)
        $SUDO pacman -Sy --noconfirm --needed nodejs npm
        ;;
      zypper)
        $SUDO zypper --non-interactive install nodejs20 npm20 || \
        $SUDO zypper --non-interactive install nodejs npm
        ;;
      apk)
        $SUDO apk add --no-cache nodejs npm
        ;;
      *)
        info "Menginstal Node.js menggunakan fnm / nvm lokal..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        # shellcheck disable=SC1091
        [[ -s "$NVM_DIR/nvm.sh" ]] && \. "$NVM_DIR/nvm.sh"
        nvm install 20
        ;;
    esac
    success "Node.js berhasil dipasang: $(node -v)"
  fi
}

install_nodejs

# 4. Cek & Instal cloudflared (Untuk Login SSH/PuTTY via URL Dinamis trycloudflare.com)
install_cloudflared() {
  if [[ "$SKIP_CLOUDFLARED" -eq 1 ]]; then
    info "Melewati instalasi cloudflared (--skip-cloudflared)."
    return 0
  fi

  if command -v cloudflared >/dev/null 2>&1; then
    success "cloudflared sudah terpasang: $(cloudflared --version | head -n1)"
    return 0
  fi

  info "Menginstal cloudflared untuk fitur Login SSH/PuTTY URL Dinamis (trycloudflare.com)..."
  local cf_arch=""
  case "$ARCH" in
    x86_64|amd64) cf_arch="amd64" ;;
    aarch64|arm64) cf_arch="arm64" ;;
    armv7l|armhf) cf_arch="arm" ;;
    *)
      warn "Arsitektur $ARCH belum didukung otomatis untuk cloudflared. Melewati cloudflared."
      return 0
      ;;
  esac

  local cf_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cf_arch}"
  local target_cf="/usr/local/bin/cloudflared"

  if [[ -z "$SUDO" && "${EUID:-$(id -u)}" -ne 0 ]]; then
    mkdir -p "$BIN_DIR"
    target_cf="$BIN_DIR/cloudflared"
  fi

  if curl -fsSL "$cf_url" -o "/tmp/cloudflared.bin"; then
    chmod +x "/tmp/cloudflared.bin"
    if [[ "$target_cf" == "/usr/local/bin/cloudflared" ]]; then
      $SUDO mv "/tmp/cloudflared.bin" "$target_cf"
    else
      mv "/tmp/cloudflared.bin" "$target_cf"
    fi
    success "cloudflared berhasil dipasang di $target_cf"
  else
    warn "Gagal mengunduh cloudflared. Anda tetap bisa login menggunakan IP LAN atau --import-cookies."
  fi
}

install_cloudflared

# 5. Siapkan Direktori Aplikasi m365-copilot-cli
if [[ ! -f "$SCRIPT_DIR/package.json" || ! -f "$SCRIPT_DIR/bin/m365.js" ]]; then
  error "File proyek m365-copilot-cli (package.json / bin/m365.js) tidak ditemukan di $SCRIPT_DIR"
  error "Pastikan Anda menjalankan ./install.sh dari dalam folder proyek m365-copilot-cli."
  exit 1
fi

if [[ "$IN_PLACE" -eq 1 || "$SCRIPT_DIR" == "$INSTALL_DIR" ]]; then
  INSTALL_DIR="$SCRIPT_DIR"
  info "Menggunakan direktori proyek secara langsung (in-place): $INSTALL_DIR"
else
  info "Menyalin file aplikasi ke: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  cp -r "$SCRIPT_DIR/package.json" "$SCRIPT_DIR/bin" "$SCRIPT_DIR/src" "$INSTALL_DIR/"
  [[ -f "$SCRIPT_DIR/package-lock.json" ]] && cp "$SCRIPT_DIR/package-lock.json" "$INSTALL_DIR/"
  [[ -f "$SCRIPT_DIR/README.md" ]] && cp "$SCRIPT_DIR/README.md" "$INSTALL_DIR/"
  [[ -f "$SCRIPT_DIR/panduan-m365-cli.txt" ]] && cp "$SCRIPT_DIR/panduan-m365-cli.txt" "$INSTALL_DIR/"
fi

# 6. Instal Dependensi NPM & Browser Chromium Playwright
cd "$INSTALL_DIR"
info "Menginstal dependensi Node.js (npm install)..."
npm install --no-fund --no-audit

info "Mengunduh dan memasang browser Chromium Playwright..."
npx playwright install chromium

# Coba install-deps playwright jika di distro berbasis Debian/Ubuntu
if [[ "$PKG_MGR" == "apt" && ( -n "$SUDO" || "${EUID:-$(id -u)}" -eq 0 ) ]]; then
  npx playwright install-deps chromium || true
fi

# 7. Buat Executable & Symlink Global / User
chmod +x "$INSTALL_DIR/bin/m365.js"
mkdir -p "$BIN_DIR"

ln -sf "$INSTALL_DIR/bin/m365.js" "$BIN_DIR/m365"
ln -sf "$INSTALL_DIR/bin/m365.js" "$BIN_DIR/m365-copilot"
success "Symlink CLI dibuat di: $BIN_DIR/m365 dan $BIN_DIR/m365-copilot"

if [[ "$GLOBAL_SYMLINK" -eq 1 ]]; then
  $SUDO ln -sf "$INSTALL_DIR/bin/m365.js" /usr/local/bin/m365
  $SUDO ln -sf "$INSTALL_DIR/bin/m365.js" /usr/local/bin/m365-copilot
  success "Symlink sistem global dibuat di: /usr/local/bin/m365"
fi

# 8. Pastikan ~/.local/bin ada di PATH shell pengguna
ensure_path_in_rc() {
  local rc_file="$1"
  local path_line='export PATH="$HOME/.local/bin:$PATH"'
  if [[ -f "$rc_file" ]]; then
    if ! grep -q '\.local/bin' "$rc_file" 2>/dev/null; then
      echo "" >> "$rc_file"
      echo "# Added by m365-copilot-cli installer" >> "$rc_file"
      echo "$path_line" >> "$rc_file"
      info "Menambahkan ~/.local/bin ke PATH di $rc_file"
    fi
  fi
}

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  ensure_path_in_rc "$HOME/.bashrc"
  ensure_path_in_rc "$HOME/.zshrc"
  ensure_path_in_rc "$HOME/.profile"
  export PATH="$BIN_DIR:$PATH"
fi

# Buat direktori konfigurasi ~/.config/m365-copilot-cli dengan permission aman (700)
mkdir -p "$HOME/.config/m365-copilot-cli"
chmod 700 "$HOME/.config/m365-copilot-cli"

echo ""
echo -e "${BOLD}${GREEN}======================================================================${NC}"
echo -e "${BOLD}${GREEN}✔ INSTALASI M365 COPILOT CLI BERHASIL!${NC}"
echo -e "${BOLD}${GREEN}======================================================================${NC}"
echo -e "Lokasi Aplikasi  : ${CYAN}${INSTALL_DIR}${NC}"
echo -e "Lokasi Binary    : ${CYAN}${BIN_DIR}/m365${NC}"
echo -e "Lokasi Konfigurasi: ${CYAN}$HOME/.config/m365-copilot-cli${NC}"
echo ""
echo -e "${BOLD}Langkah Selanjutnya:${NC}"
echo -e "  1. Jika perintah 'm365' belum dikenali, muat ulang shell Anda:"
echo -e "     ${YELLOW}source ~/.bashrc${NC}   (atau buka terminal baru)"
echo -e "  2. Login ke akun Microsoft 365 Anda (mendukung GUI & SSH/PuTTY):"
echo -e "     ${YELLOW}m365 login${NC}"
echo -e "  3. Mulai chat interaktif:"
echo -e "     ${YELLOW}m365${NC}"
echo -e "  4. Atau kirim perintah langsung (one-shot):"
echo -e "     ${YELLOW}m365 -p \"Halo, jelaskan fitur Microsoft 365 Copilot\"${NC}"
echo ""
