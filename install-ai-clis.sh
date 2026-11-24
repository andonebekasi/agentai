#!/usr/bin/env bash
# ==============================================================================
# Universal AI CLI Installer for Linux
# Memasang:
#   1. Google Gemini / Antigravity CLI (agy & gemini)
#   2. Anthropic Claude Code CLI (claude)
#   3. GitHub Copilot CLI (copilot)
#
# Mendukung semua distro Linux:
#   Debian, Ubuntu, CentOS, RHEL, Fedora, Rocky, AlmaLinux, Arch, Alpine, openSUSE
#
# Penggunaan via curl:
#   curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash
# ==============================================================================

set -euo pipefail

# Hubungkan kembali input terminal jika dijalankan melalui pipe (curl ... | bash)
if [ ! -t 0 ] && [ -e /dev/tty ]; then
    exec < /dev/tty
fi

# ANSI Colors
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

ACTION=""
REAL_USER="${SUDO_USER:-$USER}"
USER_HOME="${HOME:-$(getent passwd "$REAL_USER" | cut -d: -f6)}"
BIN_DIR="${USER_HOME}/.local/bin"

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "======================================================================"
    echo "       Universal AI CLI Installer (Gemini/AGY, Claude, Copilot)       "
    echo "             https://github.com/andonebekasi/agentai"
    echo "======================================================================"
    echo -e "${RESET}"
}

usage() {
    echo "Penggunaan: ./install-ai-clis.sh [opsi]"
    echo ""
    echo "Opsi:"
    echo "  --all, -a            Install semua CLI (Gemini/AGY + Claude + Copilot)"
    echo "  --gemini, --agy      Install Google Gemini / Antigravity CLI (agy) saja"
    echo "  --claude             Install Anthropic Claude Code CLI (claude) saja"
    echo "  --copilot            Install GitHub Copilot CLI (copilot) saja"
    echo "  -h, --help           Tampilkan bantuan ini"
    echo ""
    echo "Contoh via curl:"
    echo "  # Mode Interaktif (Pilih di layar):"
    echo "  curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash"
    echo ""
    echo "  # Pasang Semua Otomatis:"
    echo "  curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --all"
    echo ""
    echo "  # Pasang Claude CLI saja:"
    echo "  curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --claude"
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
        --gemini|--agy|gemini|agy)
            ACTION="gemini"
            shift
            ;;
        --claude|claude)
            ACTION="claude"
            shift
            ;;
        --copilot|copilot)
            ACTION="copilot"
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
# 2. Deteksi Sudo / Root
# ------------------------------------------------------------------------------
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    fi
fi

# ------------------------------------------------------------------------------
# 3. Pastikan Dependensi Dasar Sistem Tersedia
# ------------------------------------------------------------------------------
ensure_system_deps() {
    local missing=()
    for cmd in curl tar gzip; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing+=("$cmd")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${BLUE}[INFO] Menginstall paket pendukung sistem: ${missing[*]}...${RESET}"
        if [ -n "$SUDO" ] || [ "$(id -u)" -eq 0 ]; then
            if command -v apt-get >/dev/null 2>&1; then
                $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "${missing[@]}" ca-certificates
            elif command -v dnf >/dev/null 2>&1; then
                $SUDO dnf install -y "${missing[@]}" ca-certificates
            elif command -v yum >/dev/null 2>&1; then
                $SUDO yum install -y "${missing[@]}" ca-certificates
            elif command -v pacman >/dev/null 2>&1; then
                $SUDO pacman -Sy --noconfirm "${missing[@]}" ca-certificates
            elif command -v zypper >/dev/null 2>&1; then
                $SUDO zypper install -y "${missing[@]}" ca-certificates
            elif command -v apk >/dev/null 2>&1; then
                $SUDO apk add --no-cache "${missing[@]}" ca-certificates
            fi
        fi
    fi

    mkdir -p "$BIN_DIR"
    export PATH="${BIN_DIR}:/usr/local/bin:${PATH}"
}

# ------------------------------------------------------------------------------
# 4. Pastikan PATH Tersimpan di Shell Profile
# ------------------------------------------------------------------------------
ensure_path_configured() {
    local path_line='export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"'
    
    for rc in "${USER_HOME}/.bashrc" "${USER_HOME}/.zshrc" "${USER_HOME}/.profile"; do
        if [ -f "$rc" ]; then
            if ! grep -q '\.local/bin' "$rc"; then
                echo "" >> "$rc"
                echo "# Added by Universal AI CLI Installer" >> "$rc"
                echo "$path_line" >> "$rc"
            fi
        fi
    done
}

# ------------------------------------------------------------------------------
# 5. Instalasi Google Gemini / Antigravity CLI (agy & gemini)
# ------------------------------------------------------------------------------
install_gemini_agy() {
    echo ""
    echo -e "${CYAN}${BOLD}[1/3] Memeriksa & Menginstall Google Gemini / Antigravity CLI (agy)...${RESET}"
    
    if command -v agy >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Antigravity CLI (agy) sudah terpasang: $(agy --version 2>/dev/null || echo 'terpasang')${RESET}"
    else
        echo -e "${YELLOW}[SETUP] Mengunduh Google Antigravity CLI via https://antigravity.google/cli/install.sh...${RESET}"
        if curl -fsSL https://antigravity.google/cli/install.sh | bash; then
            echo -e "${GREEN}✓ Antigravity CLI (agy) berhasil dipasang.${RESET}"
        else
            echo -e "${YELLOW}[WARN] Installer curl gagal. Mencoba metode npm global...${RESET}"
            if command -v npm >/dev/null 2>&1; then
                npm install -g @google/gemini-cli 2>/dev/null || true
            fi
        fi
    fi

    # Buat symlink 'gemini' mengarah ke 'agy' agar kedua command bisa dipanggil
    if command -v agy >/dev/null 2>&1 || [ -f "${BIN_DIR}/agy" ]; then
        AGY_BIN="$(command -v agy 2>/dev/null || echo "${BIN_DIR}/agy")"
        ln -sf "$AGY_BIN" "${BIN_DIR}/gemini"
        if [ -n "$SUDO" ] && [ -w /usr/local/bin ]; then
            $SUDO ln -sf "$AGY_BIN" /usr/local/bin/agy 2>/dev/null || true
            $SUDO ln -sf "$AGY_BIN" /usr/local/bin/gemini 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ Command 'agy' dan 'gemini' aktif: $(${BIN_DIR}/agy --version 2>/dev/null || echo 'OK')${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 6. Instalasi Anthropic Claude Code CLI (claude)
# ------------------------------------------------------------------------------
install_claude() {
    echo ""
    echo -e "${CYAN}${BOLD}[2/3] Memeriksa & Menginstall Anthropic Claude Code CLI (claude)...${RESET}"
    
    if command -v claude >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Claude Code CLI sudah terpasang: $(claude --version 2>/dev/null || echo 'terpasang')${RESET}"
    else
        echo -e "${YELLOW}[SETUP] Mengunduh Claude Code native installer via https://claude.ai/install.sh...${RESET}"
        if curl -fsSL https://claude.ai/install.sh | bash; then
            echo -e "${GREEN}✓ Claude Code CLI berhasil dipasang.${RESET}"
        else
            echo -e "${YELLOW}[WARN] Native installer gagal. Mencoba instalasi via npm...${RESET}"
            if command -v npm >/dev/null 2>&1; then
                npm install -g @anthropic-ai/claude-code
            else
                echo -e "${RED}[ERROR] Gagal memasang Claude Code. Pastikan curl atau npm tersedia.${RESET}"
            fi
        fi
    fi

    if command -v claude >/dev/null 2>&1 || [ -f "${BIN_DIR}/claude" ]; then
        CLAUDE_BIN="$(command -v claude 2>/dev/null || echo "${BIN_DIR}/claude")"
        if [ -n "$SUDO" ] && [ -w /usr/local/bin ]; then
            $SUDO ln -sf "$CLAUDE_BIN" /usr/local/bin/claude 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ Command 'claude' aktif: $(${BIN_DIR}/claude --version 2>/dev/null || echo 'OK')${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 7. Instalasi GitHub Copilot CLI (copilot)
# ------------------------------------------------------------------------------
install_copilot() {
    echo ""
    echo -e "${CYAN}${BOLD}[3/3] Memeriksa & Menginstall GitHub Copilot CLI (copilot)...${RESET}"
    
    if command -v copilot >/dev/null 2>&1; then
        echo -e "${GREEN}✓ GitHub Copilot CLI sudah terpasang: $(copilot --version 2>/dev/null || echo 'terpasang')${RESET}"
    else
        echo -e "${YELLOW}[SETUP] Mengunduh GitHub Copilot CLI resmi via https://gh.io/copilot-install...${RESET}"
        if curl -fsSL https://gh.io/copilot-install | bash; then
            echo -e "${GREEN}✓ GitHub Copilot CLI berhasil dipasang.${RESET}"
        else
            echo -e "${YELLOW}[WARN] Script https://gh.io gagal. Mencoba metode npm global...${RESET}"
            if command -v npm >/dev/null 2>&1; then
                npm install -g @github/copilot 2>/dev/null || npm install -g @githubnext/github-copilot-cli 2>/dev/null || true
            fi
        fi
    fi

    if command -v copilot >/dev/null 2>&1 || [ -f "${BIN_DIR}/copilot" ]; then
        COPILOT_BIN="$(command -v copilot 2>/dev/null || echo "${BIN_DIR}/copilot")"
        ln -sf "$COPILOT_BIN" "${BIN_DIR}/github-copilot"
        if [ -n "$SUDO" ] && [ -w /usr/local/bin ]; then
            $SUDO ln -sf "$COPILOT_BIN" /usr/local/bin/copilot 2>/dev/null || true
            $SUDO ln -sf "$COPILOT_BIN" /usr/local/bin/github-copilot 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ Command 'copilot' & 'github-copilot' aktif: $(${BIN_DIR}/copilot --version 2>/dev/null || echo 'OK')${RESET}"
    fi
}

# ------------------------------------------------------------------------------
# 8. Main Flow & Menu Interaktif
# ------------------------------------------------------------------------------
print_banner
ensure_system_deps
ensure_path_configured

if [ -z "$ACTION" ]; then
    if [ -t 0 ]; then
        echo -e "${BOLD}Silakan pilih AI CLI yang ingin Anda install di sistem ini:${RESET}"
        echo -e "  ${CYAN}1) [Semua] Gemini/AGY + Claude Code + GitHub Copilot CLI${RESET}  ${GREEN}[Rekomendasi]${RESET}"
        echo -e "     ${YELLOW}• Google Antigravity / Gemini CLI (command: agy / gemini)${RESET}"
        echo -e "     ${YELLOW}• Anthropic Claude Code CLI (command: claude)${RESET}"
        echo -e "     ${YELLOW}• GitHub Copilot CLI (command: copilot / github-copilot)${RESET}"
        echo ""
        echo -e "  ${CYAN}2) Google Gemini / Antigravity CLI (agy / gemini) saja${RESET}"
        echo -e "  ${CYAN}3) Anthropic Claude Code CLI (claude) saja${RESET}"
        echo -e "  ${CYAN}4) GitHub Copilot CLI (copilot) saja${RESET}"
        echo -e "  ${RED}5) Keluar / Exit${RESET}"
        echo ""
        read -r -p "Masukkan nomor pilihan [1-5] (default: 1): " user_choice
        case "${user_choice:-1}" in
            1) ACTION="all" ;;
            2) ACTION="gemini" ;;
            3) ACTION="claude" ;;
            4) ACTION="copilot" ;;
            *) echo "Instalasi dibatalkan."; exit 0 ;;
        esac
    else
        ACTION="all"
    fi
fi

case "$ACTION" in
    gemini)
        install_gemini_agy
        ;;
    claude)
        install_claude
        ;;
    copilot)
        install_copilot
        ;;
    all)
        install_gemini_agy
        install_claude
        install_copilot
        ;;
esac

echo ""
echo -e "${GREEN}${BOLD}======================================================================${RESET}"
echo -e "${GREEN}${BOLD}             Instalasi AI CLI Berhasil Selesai!                       ${RESET}"
echo -e "${GREEN}${BOLD}======================================================================${RESET}"
echo ""
echo -e "${BOLD}Perintah Penggunaan & Login:${RESET}"
echo -e "  1. ${BOLD}Google Gemini / Antigravity CLI:${RESET}"
echo -e "     - Command : ${CYAN}agy${RESET} atau ${CYAN}gemini${RESET}"
echo -e "     - Login   : Jalankan ${YELLOW}agy${RESET} dan ikuti autentikasi browser/Google"
echo ""
echo -e "  2. ${BOLD}Anthropic Claude Code CLI:${RESET}"
echo -e "     - Command : ${CYAN}claude${RESET}"
echo -e "     - Login   : Jalankan ${YELLOW}claude${RESET} dan ikuti autentikasi akun Anthropic"
echo ""
echo -e "  3. ${BOLD}GitHub Copilot CLI:${RESET}"
echo -e "     - Command : ${CYAN}copilot${RESET} atau ${CYAN}copilot help${RESET}"
echo -e "     - Login   : Jalankan ${YELLOW}copilot auth${RESET} atau login via ${YELLOW}gh auth login${RESET}"
echo ""
echo -e "${YELLOW}Catatan PATH:${RESET} Jika command belum langsung terdeteksi, reload terminal Anda:"
echo -e "  ${CYAN}source ~/.bashrc${RESET}  atau  ${CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
echo -e "${GREEN}======================================================================${RESET}"
