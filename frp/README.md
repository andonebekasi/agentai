# FRP (Fast Reverse Proxy) untuk AgentAI Stack

[FRP (Fast Reverse Proxy)](https://github.com/fatedier/frp) adalah reverse proxy berkecepatan tinggi yang dirancang untuk mengekspos server lokal di balik NAT atau firewall ke Internet melalui VPS publik.

## 🌟 Arsitektur

```text
[ Browser / Internet ]
         │
         ▼
[ VPS Publik (FRP Server - frps) ] : Port 7000 (Tunnel) & Port Service
         │ (Encrypted TCP Tunnel)
         ▼
[ Mesin Lokal AgentAI (FRP Client - frpc) ]
         ├── 9Router Dashboard & API   : 20128
         ├── OpenClaw Control UI       : 18789
         ├── Hermes Agent Dashboard    : 8088
         ├── NanoClaw Agent Service    : 18790
         └── M365 AI Router API        : 5365
```

---

## 🚀 Cara Instalasi Langsung via curl (Satu Baris)

Anda dapat menginstall FRP secara mandiri tanpa harus meng-clone repository ini terlebih dahulu.

### Skenario 1: Pada VPS Publik (FRP Server / `frps`)
Jalankan di VPS Anda:

**Mode Interaktif (Pilih & masukkan token di layar):**
```bash
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash
```

**Atau Otomatis Satu Baris:**
```bash
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash -s -- server --token "TOKEN_RAHASIA_ANDA"
```
- Dashboard Web UI Monitoring: `http://IP-VPS:7500` (User: `admin` / Pass: `admin123456`)
- Port Tunnel: `7000`

---

### Skenario 2: Pada Mesin Lokal / Host AgentAI (FRP Client / `frpc`)
Jalankan di server lokal atau komputer AgentAI yang berada di balik WiFi/NAT:

**Mode Interaktif:**
```bash
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash
```

**Atau Otomatis Satu Baris:**
```bash
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash -s -- client --server-addr "IP_VPS_ANDA" --token "TOKEN_RAHASIA_ANDA"
```

Setelah aktif, seluruh dashboard AgentAI otomatis bisa diakses via IP VPS publik Anda:
- **9Router**: `http://IP_VPS:20128`
- **OpenClaw**: `http://IP_VPS:18789`
- **Hermes**: `http://IP_VPS:8088`
- **NanoClaw**: `http://IP_VPS:18790`
- **M365 Router**: `http://IP_VPS:5365/v1`

---

## 🛠️ Instalasi dari File Lokal (Jika Repo Sudah di-Clone)

Jika Anda sudah berada di dalam direktori repository:
```bash
chmod +x install-frp.sh

# Jalankan menu interaktif:
./install-frp.sh

# Atau langsung spesifik:
./install-frp.sh server --token "TOKEN_RAHASIA_ANDA"
./install-frp.sh client --server-addr "IP_VPS_ANDA" --token "TOKEN_RAHASIA_ANDA"
```

Untuk mencopot / uninstall FRP:
```bash
./install-frp.sh --uninstall
```

---

## 🔄 Menjalankan via Docker Compose (Alternatif)

Jika Anda lebih memilih menjalankan `frpc` melalui Docker Compose tanpa systemd:
1. Atur konfigurasi di `frp/frpc.toml` (masukkan `serverAddr` dan `auth.token`).
2. Aktifkan profile FRP:
   ```bash
   docker compose --profile frp up -d
   ```
   Atau tambahkan `ENABLE_FRP=true` di file `.env`.
