# AgentAI Stack: Hermes, NanoClaw, OpenClaw, 9Router, M365 Agent CLI & FRP

Stack lengkap berbasis Docker Compose untuk menjalankan ekosistem AI Agent mandiri (*self-hosted*):
- **9Router**: Gateway LLM cerdas lokal (multi-provider routing, quota optimization, 3-tier fallback).
- **OpenClaw**: Autonomous AI assistant dan gateway otomatisasi multi-channel (*latest*).
- **Hermes Agent**: Autonomous self-improving AI agent dengan kurasi memori jangka panjang oleh Nous Research (*latest*).
- **NanoClaw**: Lightweight, container-isolated personal AI assistant (*latest*).
- **M365 Copilot Agent CLI**: CLI Agent Linux Microsoft 365 Copilot dengan akses Lokal, Docker, Browser RPA, dan AI Router Server (`m365 router`).
- **FRP (Fast Reverse Proxy)**: Reverse proxy berkecepatan tinggi ([fatedier/frp](https://github.com/fatedier/frp)) untuk mengekspos seluruh AI agent dari balik NAT / WiFi lokal ke Internet via VPS publik secara aman dan terenkripsi.

---

## 🚀 Fitur Utama

1. **Terintegrasi Penuh dengan 9Router & M365 Router**:
   - Seluruh agent (`openclaw`, `hermes`, `nanoclaw`) otomatis diarahkan ke endpoint OpenAI-compatible milik 9Router (`http://9router:20128/v1`).
   - 9Router mengelola API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter) dengan fitur fallback otomatis dan token compression.
   - **M365 Agent CLI Router** dapat dijalankan di host (`m365 router`) dan diakses kontainer melalui `http://host.docker.internal:5365/v1` sebagai penyedia LLM tambahan gratis dari akun Microsoft 365 Copilot!

2. **Isolasi dan Keamanan**:
   - Berjalan dalam Docker network terisolasi (`agentai-net`).
   - Persistent volume tersimpan di direktori lokal `./data/` yang aman.
   - Hermes Dashboard dilindungi dengan autentikasi Basic Auth terintegrasi.

3. **Port Aman dari Konflik**:
   - Port default dikonfigurasi agar tidak bentrok dengan service umum lain (misalnya zap-web atau open-webui).

---

## 📋 Daftar Port & Dashboard

| Service | Host Port | Internal Port | Dashboard / Endpoint | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| **9Router** | `20128` | `20128` | `http://localhost:20128` | AI Gateway Web UI & LLM Proxy (`/v1`) |
| **OpenClaw** | `18789` | `18789` | `http://localhost:18789` | Control UI & Web Gateway |
| **Hermes Agent** | `8088` | `9119` | `http://localhost:8088` | Web Dashboard (Auth: `admin` / `admin123456`) |
| **NanoClaw** | `18790` | `3000` | `http://localhost:18790` | NanoClaw Agent Service |
| **M365 Router** | `5365` | `5365` | `http://localhost:5365/v1` | M365 Copilot AI Gateway (`m365 router`) |
| **FRP Server (frps)** | `7000` | `7000` | Port Tunnel TCP | Komunikasi Tunnel Client-Server FRP |
| **FRP Dashboard** | `7500` | `7500` | `http://IP-VPS:7500` | Monitoring Web UI FRP Server (di VPS) |

*(Semua port dapat disesuaikan di file `.env`)*

---

## 💻 Cara Install di Host / PC Baru (Semua OS Linux)

Jika Anda memindahkan atau meng-clone repository ini ke server/PC lain yang **belum terpasang Docker, Docker Compose, atau M365 CLI**, jalankan script instalasi universal:

```bash
chmod +x install.sh
./install.sh
```

Script [install.sh](file:///home/andi/script/poc-aws/agentai/install.sh) akan otomatis:
1. Mendeteksi distro Linux Anda (Debian, Ubuntu, CentOS, RHEL, Fedora, Rocky, Alma, Arch, Manjaro, Alpine, openSUSE).
2. Memeriksa apakah Docker Engine dan Docker Compose (v2) sudah terpasang (menginstall otomatis jika belum ada).
3. Mengaktifkan service daemon Docker dan memasukkan user non-root ke grup `docker`.
4. Memeriksa & memasang **M365 Copilot Agent CLI** (`m365`) beserta browser Chromium Playwright & Cloudflared Quick Tunnel.
5. Menyiapkan hak akses script dan langsung menjalankan stack ([start.sh](file:///home/andi/script/poc-aws/agentai/start.sh)).

---

## 🛠️ Cara Penggunaan Harian

### 1. Menjalankan Stack (`start.sh`)

Cukup jalankan script `start.sh`:
```bash
./start.sh
```
Script ini akan:
- Memeriksa Docker dan Docker Compose.
- Menyiapkan file `.env` dari `.env.example` jika belum ada.
- Menyiapkan direktori data persistent (`./data/`).
- Mengunduh image terbaru (`decolua/9router:latest`, `ghcr.io/openclaw/openclaw:latest`, `nousresearch/hermes-agent:latest`) dan membangun `nanoclaw`.
- Menjalankan seluruh container di background.

### 2. Memeriksa Status (`status.sh`)

Untuk melihat status kontainer, port mapping, dan pemakaian resource CPU/RAM:
```bash
./status.sh
```
Atau langsung via Docker:
```bash
docker compose ps
docker compose logs -f
```

### 3. Menghentikan & Membersihkan Stack (`destroy.sh`)

Untuk menghentikan kontainer dan menghapus network tanpa menghapus data persistent:
```bash
./destroy.sh
```

Untuk menghentikan dan **menghapus semua data** (reset total):
```bash
./destroy.sh --volumes
```

---

## 🔑 Konfigurasi API Keys (.env)

Edit file `.env` untuk menambahkan API key provider AI Anda:

```bash
# Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=sk-...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...

# Kredensial Dashboard Hermes
HERMES_AUTH_USER=admin
HERMES_AUTH_PASS=admin123456
```

---

## 💻 CLI Commands di Dalam Container

Anda dapat menjalankan perintah interaktif langsung ke dalam kontainer yang sedang berjalan:

### OpenClaw CLI:
```bash
docker compose exec openclaw node openclaw.mjs status
docker compose exec openclaw node openclaw.mjs --help
```

### Hermes Agent CLI:
```bash
docker compose exec hermes hermes chat
docker compose exec hermes hermes skills list
```

### NanoClaw CLI:
```bash
docker compose exec nanoclaw ncl --help
```

---

## ⚡ M365 Copilot Agent CLI (Host & Router)

M365 Copilot Agent CLI dapat digunakan langsung di terminal host atau dijalankan sebagai AI Router:

### 1. Login Pertama Kali:
```bash
m365 login
```
*(Mendukung login via URL Cloudflare Tunnel otomatis jika Anda mengakses server melalui SSH/PuTTY).*

### 2. Jalankan Mode Interaktif / Pertanyaan:
```bash
m365 "Tolong analisa kode di folder ini"
m365 ask "Bagaimana cara deploy container ini?"
```

### 3. Jalankan M365 sebagai OpenAI-Compatible Router:
```bash
m365 router
```
Router akan berjalan di port `5365` (`http://localhost:5365/v1` atau `http://host.docker.internal:5365/v1`).
Model yang tersedia: `m365`, `m365-agent`, `m365-rpa`, `m365-plan`.
Anda dapat mendaftarkan endpoint ini ke dalam **9Router** untuk digunakan oleh OpenClaw, Hermes, dan NanoClaw tanpa biaya API tambahan!

---

## 🌐 FRP (Fast Reverse Proxy) - Akses Remote & NAT Traversal

Untuk mengakses dashboard AgentAI (9Router, OpenClaw, Hermes, NanoClaw, M365 Router) dari internet ketika server Anda berada di balik **NAT, Wi-Fi rumah, atau firewall tanpa IP publik**, gunakan **FRP** ([github.com/fatedier/frp](https://github.com/fatedier/frp)).

FRP terdiri atas dua bagian:
1. **`frps` (Server)**: Dipasang di VPS publik (AWS EC2, DigitalOcean, Linode, dll.).
2. **`frpc` (Client)**: Dipasang di server lokal / PC AgentAI Anda.

### 1. Instalasi Otomatis via Script (`install-frp.sh`)

Script [install-frp.sh](file:///home/andi/script/poc-aws/agentai/install-frp.sh) otomatis mendeteksi arsitektur CPU (`amd64`, `arm64`, `arm`), mengunduh binary resmi terbaru, mengonfigurasi file TOML, dan memasang systemd service auto-start.

#### A. Pada VPS Publik (FRP Server):
```bash
./install-frp.sh server --token "TOKEN_RAHASIA_ANDA"
```
- Port Tunnel: `7000`
- Web Dashboard Monitoring: `http://IP-VPS:7500` (User: `admin` / Pass: `admin123456`)

#### B. Pada Server Lokal AgentAI (FRP Client):
```bash
./install-frp.sh client --server-addr "IP_VPS_ANDA" --token "TOKEN_RAHASIA_ANDA"
```
Setelah aktif, seluruh service AgentAI otomatis dipetakan ke IP VPS Anda:
- **9Router**: `http://IP_VPS:20128`
- **OpenClaw**: `http://IP_VPS:18789`
- **Hermes Dashboard**: `http://IP_VPS:8088`
- **NanoClaw**: `http://IP_VPS:18790`
- **M365 Router API**: `http://IP_VPS:5365/v1`

### 2. Menjalankan FRP via Docker Compose (Alternatif)

Jika tidak ingin menggunakan service systemd, Anda dapat menjalankannya lewat Docker Compose:
1. Sesuaikan `serverAddr` dan `auth.token` pada [frp/frpc.toml](file:///home/andi/script/poc-aws/agentai/frp/frpc.toml).
2. Jalankan perintah:
```bash
docker compose --profile frp up -d
```
Atau setel `ENABLE_FRP=true` di file `.env`.

