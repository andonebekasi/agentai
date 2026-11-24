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

## 🚀 Cara Instalasi

### Skenario 1: Pada VPS Publik (FRP Server / `frps`)
Jalankan script di VPS Anda:
```bash
chmod +x install-frp.sh
./install-frp.sh server --token "TOKEN_RAHASIA_ANDA"
```
Dashboard monitoring FRPS dapat diakses di:
`http://IP-VPS:7500` (User: `admin`, Pass: `admin123456`)

### Skenario 2: Pada Mesin Lokal / Host AgentAI (FRP Client / `frpc`)
Jalankan script di host AgentAI lokal:
```bash
chmod +x install-frp.sh
./install-frp.sh client --server-addr "IP_VPS_ANDA" --token "TOKEN_RAHASIA_ANDA"
```

Atau jalankan melalui mode interaktif tanpa parameter:
```bash
./install-frp.sh
```

---

## 🔄 Menjalankan via Docker Compose (Alternatif)

Jika Anda lebih memilih menjalankan `frpc` melalui Docker Compose tanpa systemd:
1. Atur konfigurasi di `frp/frpc.toml` (masukkan `serverAddr` dan `auth.token`).
2. Aktifkan profile FRP:
   ```bash
   docker compose --profile frp up -d
   ```
   Atau tambahkan `COMPOSE_PROFILES=frp` di file `.env`.
