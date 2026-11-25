# AgentAI Stack: Hermes, NanoClaw, OpenClaw, 9Router, M365 Agent CLI & FRP

<div align="center">

[ 🇮🇩 Bahasa Indonesia ](README.md) | [ 🇬🇧 English ](README_EN.md)

</div>

A comprehensive, self-hosted, Docker Compose-based AI Agent ecosystem:
- **9Router**: Local smart LLM proxy and intelligent gateway (multi-provider routing, quota optimization, 3-tier fallback).
- **OpenClaw**: Autonomous AI assistant and multi-channel automation gateway (*latest*).
- **Hermes Agent**: Autonomous self-improving AI agent with long-term memory curation by Nous Research (*latest*).
- **NanoClaw**: Lightweight, container-isolated personal AI assistant (*latest*).
- **M365 Copilot Agent CLI**: Microsoft 365 Copilot Linux Agent CLI by Andi Pangeran featuring Local, Docker, Browser RPA access, and an OpenAI-compatible Router Server (`m365 router`).
- **FRP (Fast Reverse Proxy)**: High-performance reverse proxy ([fatedier/frp](https://github.com/fatedier/frp)) to securely expose all AI agents from behind local NAT / Wi-Fi to the Internet via a public VPS.
- **Universal AI CLI Installer**: Fast one-liner curl installer for **Google Gemini / Antigravity CLI (`agy` & `gemini`)**, **Anthropic Claude Code CLI (`claude`)**, and **GitHub Copilot CLI (`copilot`)**.

---

## 🚀 Key Features

1. **Fully Integrated with 9Router & M365 Router**:
   - All agents (`openclaw`, `hermes`, `nanoclaw`) automatically point to 9Router's OpenAI-compatible endpoint (`http://9router:20128/v1`).
   - 9Router manages provider API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter) with automatic fallback and prompt caching / compression.
   - **M365 Agent CLI Router** runs on the host (`m365 router`) and can be accessed by containers via `http://host.docker.internal:5365/v1` as an additional free LLM provider from your Microsoft 365 Copilot account!

2. **Isolation & Security**:
   - Runs in an isolated Docker network (`agentai-net`).
   - Persistent volume data stored securely in the local `./data/` directory.
   - Hermes Dashboard is protected by integrated HTTP Basic Authentication.

3. **Conflict-Free Port Allocation**:
   - Default ports are carefully pre-configured so they do not conflict with standard host services.

---

## 📋 Ports & Dashboards Directory

| Service | Host Port | Internal Port | Dashboard / Endpoint | Description |
| :--- | :--- | :--- | :--- | :--- |
| **9Router** | `20128` | `20128` | `http://localhost:20128` | AI Gateway Web UI & LLM Proxy (`/v1`) |
| **OpenClaw** | `18789` | `18789` | `http://localhost:18789` | Control UI & Web Gateway |
| **Hermes Agent** | `8088` | `9119` | `http://localhost:8088` | Web Dashboard (Auth: `admin` / `admin123456`) |
| **NanoClaw** | `18790` | `3000` | `http://localhost:18790` | NanoClaw Agent Service |
| **M365 Router** | `5365` | `5365` | `http://localhost:5365/v1` | M365 Copilot AI Gateway (`m365 router`) |
| **FRP Server (frps)** | `7000` | `7000` | Port Tunnel TCP | FRP Client-Server Tunnel Communication |
| **FRP Dashboard** | `7500` | `7500` | `http://VPS-IP:7500` | Monitoring Web UI on FRP Server (VPS) |

*(All ports can be customized in the `.env` file)*

---

## 💻 Universal Installation on Any Linux Distribution

### ⚡ 1. Fast Installation via `curl` (Interactive Menu)

Run this single command on any Linux terminal (Ubuntu, Debian, CentOS, RHEL, Fedora, Rocky, Alma, Arch, Manjaro, Alpine, openSUSE):

```bash
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash
```

An interactive menu will display allowing you to select what you want to install:
```text
  1) [All-in-One Complete] OpenClaw + Hermes + NanoClaw + 9Router  [Recommended]
     • Auto-Check & Auto-Install Docker Engine + Compose (if not yet installed)
     • Auto-Install Andi Pangeran M365 Copilot Agent CLI (Just Login with M365 Email)
     • Option to configure FRP Client for NAT Traversal to VPS
     • Component Update Flexibility: Freely choose to update OpenClaw, Hermes, and NanoClaw, or skip updates
  2) [AgentAI Stack Only] OpenClaw + Hermes + NanoClaw + 9Router
     • Auto-Check/Install Docker + Auto-Install M365 CLI (Just Login with M365 Email)
     • Component Update Flexibility: Freely choose which components to update
  3) [Docker Only] Auto-Check & Install Docker Engine & Compose (v2)
     • Runs check-docker.sh for any Linux distro
  4) [M365 CLI Only] Andi Pangeran M365 Copilot Agent CLI
     • Linux Agent CLI + AI Router Port 5365 (Just Login with M365 Email: m365 login)
  5) [FRP Client] Fast Reverse Proxy Client (frpc)
     • Expose 9Router, OpenClaw, Hermes, NanoClaw, M365 from behind NAT/WiFi to VPS
  6) [FRP Server] Fast Reverse Proxy Server (frps)
     • Install on Public VPS for Tunneling & Web Dashboard Port 7500
  7) [FRP Both] Install both Client & Server on this machine
  8) [Uninstall FRP] Remove FRP service & binaries from system
  9) [AI CLIs] Install Gemini/AGY + Claude Code + GitHub Copilot CLI
```

#### Non-Interactive One-Liner Options:
```bash
# Install Full Stack automatically:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --all

# Auto-check & Install Docker / Compose only:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --docker

# Install M365 CLI only:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --m365

# Install all developer AI CLIs (Gemini/AGY + Claude + Copilot):
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install.sh | bash -s -- --ai-clis
```

---

### 📁 2. Local Installation (If Repository is Already Cloned)

```bash
chmod +x install.sh check-docker.sh start.sh
./install.sh
```

---

## 🛠️ Daily Operations

### 1. Starting the Stack (`start.sh`)

Simply run:
```bash
./start.sh
```
What this does automatically:
- **Auto-check & Auto-install Docker/Compose**: Executes `check-docker.sh` which installs Docker Engine & Docker Compose v2 if not already present.
- **Auto-install Andi Pangeran M365 CLI**: Installs the M365 Copilot Agent CLI and configures container mounts for OpenClaw, Hermes, NanoClaw, and 9Router. You **only need to log in with your M365 email** (`m365 login`).
- Generates `.env` from `.env.example` if missing.
- Sets up persistent data folders (`./data/`).
- **Flexible Component Image Updates**:
  - Interactive choices when running in a terminal: **1) Skip update (use existing local images - Fast)**, **2) Update all**, or **3) Select specific components (OpenClaw / Hermes / NanoClaw / 9Router)**.
  - Automatically pulls or builds any missing image on first run.
  - Command-line flags available:
    - `./start.sh --skip-update` (Use existing local images)
    - `./start.sh --update-all` (Pull all latest images & rebuild NanoClaw)
    - `./start.sh --update-openclaw` (Update OpenClaw image only)
    - `./start.sh --update-hermes` (Update Hermes Agent image only)
    - `./start.sh --update-nanoclaw` (Rebuild & update NanoClaw only)
- Launches all containers in detached mode.

> **Check Docker Independently:**
> ```bash
> ./check-docker.sh
> ```

### 2. Checking Status (`status.sh`)

To inspect container health, FRP tunnel status, M365 CLI status, and RAM/CPU usage:
```bash
./status.sh
```

### 3. Stopping & Cleaning Up (`destroy.sh`)

Stop containers and remove network (data remains safe in `./data/`):
```bash
./destroy.sh
```

Stop and **wipe all data** (clean slate reset):
```bash
./destroy.sh --volumes
```

---

## ⚡ Andi Pangeran M365 Copilot Agent CLI

The M365 Copilot Agent CLI is pre-integrated into the stack:

### 1. First-Time Login:
```bash
m365 login
```
Enter your Microsoft 365 Copilot email. It supports automatic Cloudflare Quick Tunnel authentication if accessing remotely over SSH/PuTTY!

### 2. Interactive Prompts & Terminal Agent:
```bash
m365 "Analyze the codebase in this folder"
m365 ask "How do I deploy this container?"
```

### 3. AI Router Server (OpenAI-Compatible):
```bash
m365 router
```
The router runs on port `5365` (`http://localhost:5365/v1` or `http://host.docker.internal:5365/v1`).
Available models: `m365`, `m365-agent`, `m365-rpa`, `m365-plan`.
You can register this endpoint in **9Router** to provide free Copilot LLM generation across OpenClaw, Hermes, and NanoClaw!

---

## 💰 Multi-Cloud FinOps Skill (AWS, GCP, Azure, OCI, Tencent Cloud)

The AI Agent now includes a comprehensive **Multi-Cloud FinOps skill** powered by **Cloud Native CLIs** (`aws`, `gcloud`, `az`, `oci`, `tccli`) for:
1. **Waste Detection & Elimination**: Unattached persistent disks/volumes, unassociated public/elastic IPs, stopped/deallocated compute VMs incurring storage costs, and orphaned snapshots.
2. **Cost & Billing Visibility**: Month-to-Date (MTD) usage queries, month-end cost forecast, and budget alert rules.
3. **Rightsizing & Commitments**: AWS Compute Optimizer, GCP Recommender, Azure Advisor, OCI Optimizer, and evaluation of Savings Plans / Reserved Instances / CUDs.

### How to Run FinOps Audits:

**1. Standalone Multi-Cloud Audit Script:**
```bash
# Check status & credentials for all 5 native cloud CLIs
./skills/finops-cloud/scripts/finops_audit.sh check

# Complete audit across all active clouds
./skills/finops-cloud/scripts/finops_audit.sh all

# Per-provider audit
./skills/finops-cloud/scripts/finops_audit.sh aws
./skills/finops-cloud/scripts/finops_audit.sh gcp
./skills/finops-cloud/scripts/finops_audit.sh azure
./skills/finops-cloud/scripts/finops_audit.sh oci
./skills/finops-cloud/scripts/finops_audit.sh tencent
```

**2. Inside M365 Agent CLI REPL:**
Use the `/finops` command:
```bash
m365
? m365> /finops check
? m365> /finops oci
? m365> /finops all
```
*(Audit findings can automatically be sent to Copilot for AI-assisted cost optimization strategy and executive reporting).*

**3. Skill Files & References:**
- Main Skill Guide: `.agents/skills/finops-cloud/SKILL.md` (also in `.m365/skills/` and `~/.config/m365-copilot-cli/skills/`)
- AWS Commands: [references/aws-finops.md](.agents/skills/finops-cloud/references/aws-finops.md)
- GCP Commands: [references/gcp-finops.md](.agents/skills/finops-cloud/references/gcp-finops.md)
- Azure Commands: [references/azure-finops.md](.agents/skills/finops-cloud/references/azure-finops.md)
- OCI Commands: [references/oci-finops.md](.agents/skills/finops-cloud/references/oci-finops.md)
- Tencent Commands: [references/tencent-finops.md](.agents/skills/finops-cloud/references/tencent-finops.md)

---

## 🤖 Universal AI CLI Installer (Gemini/AGY, Claude Code, GitHub Copilot)

Install official developer AI CLI tools on any Linux distribution (Ubuntu, Debian, RHEL, CentOS, Fedora, Arch, Alpine, openSUSE):
- **Google Gemini / Antigravity CLI** (`agy` & `gemini`)
- **Anthropic Claude Code CLI** (`claude`)
- **GitHub Copilot CLI** (`copilot` & `github-copilot`)

### Quick Install via curl:
```bash
# Interactive menu:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash

# Install all 3 tools automatically:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --all
```

### Individual Tool Installation:
```bash
# Google Gemini / Antigravity CLI only:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --gemini

# Anthropic Claude Code CLI only:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --claude

# GitHub Copilot CLI only:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-ai-clis.sh | bash -s -- --copilot
```

---

## 🌐 FRP (Fast Reverse Proxy) - Remote Access & NAT Traversal

Access your AgentAI dashboards from anywhere on the Internet even when running behind **NAT, home Wi-Fi, or ISP firewall without a public IP**.

### 1. Standalone Installation via curl (`install-frp.sh`)

#### A. On Public VPS (FRP Server - `frps`):
```bash
# Interactive:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash

# Automated one-liner:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash -s -- server --token "YOUR_SECRET_TOKEN"
```
- Port Tunnel: `7000`
- Web Dashboard Monitoring: `http://VPS-IP:7500` (User: `admin` / Pass: `admin123456`)

#### B. On Local AgentAI Host (FRP Client - `frpc`):
```bash
# Interactive:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash

# Automated one-liner:
curl -fsSL https://raw.githubusercontent.com/andonebekasi/agentai/main/install-frp.sh | bash -s -- client --server-addr "YOUR_VPS_IP" --token "YOUR_SECRET_TOKEN"
```

Once active, all AgentAI endpoints are securely tunneled through your VPS IP:
- **9Router**: `http://VPS_IP:20128`
- **OpenClaw**: `http://VPS_IP:18789`
- **Hermes Dashboard**: `http://VPS_IP:8088`
- **NanoClaw**: `http://VPS_IP:18790`
- **M365 Router API**: `http://VPS_IP:5365/v1`

---

## 💻 Running CLI Commands Inside Containers

```bash
# OpenClaw CLI:
docker compose exec openclaw node openclaw.mjs --help

# Hermes Agent CLI:
docker compose exec hermes hermes chat

# NanoClaw CLI:
docker compose exec nanoclaw ncl --help
```

---

## 📄 License
MIT License. Created & maintained for the AgentAI & Developer AI Ecosystem.
