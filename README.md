# AgentAI Stack: Hermes, NanoClaw, OpenClaw, 9Router, M365 Agent CLI & FRP

<div align="center">

[ 🇮🇩 Bahasa Indonesia ](README.md) | [ 🇬🇧 English ](README_EN.md)

</div>

Stack lengkap berbasis Docker Compose untuk menjalankan ekosistem AI Agent mandiri (*self-hosted*):
- **9Router**: Gateway LLM cerdas lokal (multi-provider routing, quota optimization, 3-tier fallback).
- **OpenClaw**: Autonomous AI assistant dan gateway otomatisasi multi-channel (*latest*).
- **Hermes Agent**: Autonomous self-improving AI agent dengan kurasi memori jangka panjang oleh Nous Research (*latest*).
- **NanoClaw**: Lightweight, container-isolated personal AI assistant (*latest*).
- **M365 Copilot Agent CLI**: CLI Agent Linux Microsoft 365 Copilot dengan akses Lokal, Docker, Browser RPA, dan AI Router Server (`m365 router`).
- **FRP (Fast Reverse Proxy)**: Reverse proxy berkecepatan tinggi ([fatedier/frp](https://github.com/fatedier/frp)) untuk mengekspos seluruh AI agent dari balik NAT / WiFi lokal ke Internet via VPS publik secara aman dan terenkripsi.
- **Universal AI CLI Installer**: Installer cepat satu baris via curl untuk **Google Gemini / Antigravity CLI (`agy` & `gemini`)**, **Anthropic Claude Code CLI (`claude`)**, dan **GitHub Copilot CLI (`copilot`)**.

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

### ⚡ 1. Instalasi Cepat via curl (Pilih Menu Sesuai Kebutuhan)
Cukup jalankan satu baris perintah berikut pada terminal Linux (Debian, Ubuntu, CentOS, RHEL, Fedora, Rocky, Alma, Arch, Manjaro, Alpine, openSUSE):

```bash
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash
```

Menu interaktif akan muncul sehingga Anda dapat memilih paket instalasi sesuai kebutuhan:
1. **[All-in-One Lengkap] OpenClaw + Hermes + NanoClaw + 9Router** *(Rekomendasi)*
   - Auto-check & auto-install Docker Engine + Compose v2 (jika belum ada)
   - Auto-install Andi Pangeran M365 Copilot Agent CLI (Tinggal login email M365)
   - Opsi setup FRP Client untuk remote NAT traversal ke VPS
   - **Bebas Pilih Update Komponen**: Anda dapat memilih update semua, memilih komponen tertentu (OpenClaw, Hermes, NanoClaw), atau lewati update untuk startup instan
2. **[AgentAI Stack Saja] OpenClaw + Hermes + NanoClaw + 9Router**
   - Auto-check/install Docker + Auto-install M365 CLI (Tinggal login email M365)
   - Pilihan bebas update komponen: OpenClaw, Hermes, NanoClaw
3. **[Docker Saja] Auto-Check & Install Docker Engine & Compose (v2)**
   - Menjalankan `check-docker.sh` untuk distro Linux apa saja
4. **[M365 CLI Saja] Andi Pangeran M365 Copilot Agent CLI**
   - CLI Agent Linux + AI Router Port 5365 (Tinggal login email M365: `m365 login`)
5. **[FRP Client] Fast Reverse Proxy Client (frpc)**
   - Ekspos 9Router, OpenClaw, Hermes, NanoClaw, M365 dari balik NAT/WiFi ke VPS
6. **[FRP Server] Fast Reverse Proxy Server (frps)**
   - Pasang di VPS Publik untuk Tunnel & Web Dashboard Monitoring Port 7500
7. **[FRP Keduanya] Pasang FRP Client & Server sekaligus di mesin ini**
8. **[Uninstall FRP] Copot service & binary FRP dari sistem**
9. **[AI CLIs] Install Gemini/AGY + Claude Code + GitHub Copilot CLI**

#### Opsi Satu Baris Non-Interaktif:
```bash
# Install Full Stack otomatis:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --all

# Install Docker & Docker Compose saja:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --docker

# Install M365 CLI saja:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --m365

# Install Semua AI CLIs (Gemini/AGY + Claude + Copilot):
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --ai-clis
```

---

### 📁 2. Instalasi dari File Lokal (Jika Repo Sudah di-Clone)

Jika Anda sudah meng-clone repository ini:
```bash
chmod +x install.sh
./install.sh
```

Script `install.sh` akan otomatis:
1. Mendeteksi distro Linux Anda.
2. Memeriksa apakah Docker Engine dan Docker Compose (v2) sudah terpasang (menginstall otomatis jika belum ada).
3. Mengaktifkan service daemon Docker dan memasukkan user non-root ke grup `docker`.
4. Memeriksa & memasang **M365 Copilot Agent CLI** (`m365`) beserta browser Chromium Playwright & Cloudflared Quick Tunnel.
5. Menyiapkan hak akses script dan langsung menjalankan stack (`start.sh`).

---

## 🛠️ Cara Penggunaan Harian

### 1. Menjalankan Stack (`start.sh`)

Cukup jalankan script `start.sh`:
```bash
./start.sh
```
Script ini otomatis:
- **Auto-check & Auto-install Docker/Compose**: Menjalankan `check-docker.sh` yang otomatis memeriksa dan menginstall Docker Engine serta Docker Compose jika belum ada.
- **Auto-install Andi Pangeran M365 CLI**: Memeriksa dan otomatis memasang M365 Copilot Agent CLI untuk digunakan oleh OpenClaw, Hermes Agent, NanoClaw, dan 9Router. Anda **tinggal login menggunakan email M365** (`m365 login`).
- Menyiapkan file `.env` dari `.env.example` jika belum ada.
- Menyiapkan direktori data persistent (`./data/`).
- **Pilihan Fleksibel Update Image Komponen**:
  - Secara default saat dijalankan di terminal, Anda dapat memilih: **1) Lewati Update (Gunakan image lokal - Sangat Cepat)**, **2) Update Semua**, atau **3) Pilih Komponen Tertentu (OpenClaw / Hermes / NanoClaw / 9Router)**.
  - Image yang belum pernah diunduh atau belum dibangun akan otomatis disiapkan pertama kali.
  - Opsi flag CLI mandiri:
    - `./start.sh --skip-update` (Gunakan versi lokal tanpa unduh ulang)
    - `./start.sh --update-all` (Update semua: OpenClaw + Hermes + NanoClaw + 9Router)
    - `./start.sh --update-openclaw` (Update OpenClaw saja)
    - `./start.sh --update-hermes` (Update Hermes Agent saja)
    - `./start.sh --update-nanoclaw` (Rebuild & update NanoClaw saja)
- Menjalankan seluruh container di background.

> **Tips Cek Docker Saja:** Anda juga dapat menjalankan script mandiri `check-docker.sh` kapan saja untuk memeriksa atau menginstall Docker & Compose:
> ```bash
> ./check-docker.sh
> ```

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

### OpenClaw CLI:
```bash
docker compose exec openclaw node openclaw.mjs skills info finops-cloud
docker compose exec openclaw node openclaw.mjs agent --message "Audit biaya cloud AWS"
```

### Hermes Agent CLI:
```bash
docker compose exec hermes hermes chat
docker compose exec hermes hermes skills list
docker compose exec hermes hermes ask "Jalankan rekomendasi FinOps"
```

### NanoClaw CLI:
```bash
docker compose exec nanoclaw ncl --help
docker compose exec nanoclaw ncl status
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

## 💰 Multi-Cloud FinOps Skill (AWS, GCP, Azure, OCI, Tencent Cloud)

Agent AI kini dilengkapi dengan skill **FinOps Multi-Cloud** berbasis **CLI Cloud Native** (`aws`, `gcloud`, `az`, `oci`, `tccli`) untuk:
1. **Audit & Eliminasi Pemborosan (Waste Detection)**: Mendeteksi unattached disk/volumes, IP publik statis/elastis menganggur, VM berstatus stopped/deallocated yang menahan disk berbayar, dan snapshot usang.
2. **Analisis Biaya & Tagihan (Cost & Billing Visibility)**: Query biaya berjalan (MTD), proyeksi akhir bulan, dan status budget alert.
3. **Rightsizing & Diskon Komitmen**: Rekomendasi AWS Compute Optimizer, GCP Recommender, Azure Advisor, OCI Optimizer, serta evaluasi Savings Plans / Reserved Instances / CUDs.

### Cara Menjalankan Audit FinOps:

**1. Menggunakan Skrip Audit Mandiri:**
```bash
# Periksa ketersediaan & login 5 cloud native CLI
./skills/finops-cloud/scripts/finops_audit.sh check

# Audit menyeluruh seluruh cloud yang aktif
./skills/finops-cloud/scripts/finops_audit.sh all

# Audit per-cloud provider
./skills/finops-cloud/scripts/finops_audit.sh aws
./skills/finops-cloud/scripts/finops_audit.sh gcp
./skills/finops-cloud/scripts/finops_audit.sh azure
./skills/finops-cloud/scripts/finops_audit.sh oci
./skills/finops-cloud/scripts/finops_audit.sh tencent
```

**2. Melalui M365 Agent CLI REPL:**
Ketik command `/finops` di sesi interaktif `m365`:
```bash
m365
? m365> /finops check
? m365> /finops oci
? m365> /finops all
```
*(Hasil audit dapat otomatis dikirimkan ke Copilot untuk dianalisis dan disusun laporan rekomendasi penghematannya).*

**3. Lokasi Berkas Skill & Referensi:**
- File Instruksi Skill: `.agents/skills/finops-cloud/SKILL.md` (juga tersedia di `.m365/skills/` dan `~/.config/m365-copilot-cli/skills/`)
- Panduan Perintah AWS: [references/aws-finops.md](.agents/skills/finops-cloud/references/aws-finops.md)
- Panduan Perintah GCP: [references/gcp-finops.md](.agents/skills/finops-cloud/references/gcp-finops.md)
- Panduan Perintah Azure: [references/azure-finops.md](.agents/skills/finops-cloud/references/azure-finops.md)
- Panduan Perintah OCI: [references/oci-finops.md](.agents/skills/finops-cloud/references/oci-finops.md)
- Panduan Perintah Tencent: [references/tencent-finops.md](.agents/skills/finops-cloud/references/tencent-finops.md)

---

## 🤖 Universal AI CLI Installer (Gemini/AGY, Claude Code, GitHub Copilot)

Untuk memasang tool CLI AI developer resmi pada semua distro Linux (Debian, Ubuntu, CentOS, RHEL, Fedora, Arch, Alpine, openSUSE):
- **Google Gemini / Antigravity CLI** (`agy` & `gemini`)
- **Anthropic Claude Code CLI** (`claude`)
- **GitHub Copilot CLI** (`copilot` & `github-copilot`)

### Instalasi Cepat via curl (Satu Baris):
```bash
# Mode Interaktif (Pilih paket di layar):
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash

# Atau Pasang Semua Sekaligus:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --all
```

### Opsi Per-Tool:
```bash
# Google Gemini / Antigravity CLI saja:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --gemini

# Anthropic Claude Code CLI saja:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --claude

# GitHub Copilot CLI saja:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --copilot
```

---

## 🌐 FRP (Fast Reverse Proxy) - Akses Remote & NAT Traversal

Untuk mengakses dashboard AgentAI (9Router, OpenClaw, Hermes, NanoClaw, M365 Router) dari internet ketika server Anda berada di balik **NAT, Wi-Fi rumah, atau firewall tanpa IP publik**, gunakan **FRP** ([github.com/fatedier/frp](https://github.com/fatedier/frp)).

FRP terdiri atas dua bagian:
1. **`frps` (Server)**: Dipasang di VPS publik (AWS EC2, DigitalOcean, Linode, dll.).
2. **`frpc` (Client)**: Dipasang di server lokal / PC AgentAI Anda.

### 1. Instalasi Otomatis via curl atau Script (`install-frp.sh`)

Script `install-frp.sh` otomatis mendeteksi arsitektur CPU (`amd64`, `arm64`, `arm`), mengunduh binary resmi terbaru, mengonfigurasi file TOML, dan memasang systemd service auto-start.

#### A. Pada VPS Publik (FRP Server):
Anda dapat menginstall langsung di VPS via curl tanpa perlu meng-clone seluruh repo:
```bash
# Mode Interaktif:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash

# Atau Satu Baris Otomatis:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash -s -- server --token "TOKEN_RAHASIA_ANDA"
```
- Port Tunnel: `7000`
- Web Dashboard Monitoring: `http://IP-VPS:7500` (User: `admin` / Pass: `admin123456`)

#### B. Pada Server Lokal AgentAI (FRP Client):
```bash
# Mode Interaktif:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash

# Atau Satu Baris Otomatis:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash -s -- client --server-addr "IP_VPS_ANDA" --token "TOKEN_RAHASIA_ANDA"
```
*(Atau gunakan `./install-frp.sh` jika Anda sudah berada di folder repo)*
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

