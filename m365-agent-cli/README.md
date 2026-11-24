# 🐧⚡ Andi Pangeran M365 CLI (`m365`)

```text
      .---.           ___    _   ______  ____   ____  ___    _   ______________  ___    ___    _   __
     /     \         /   |  / | / / __ \/  _/  / __ \/   |  / | / / ____/ ____/ / __ \/   |  / | / /
     \.@_@./        / /| | /  |/ / / / // /   / /_/ / /| | /  |/ / / __/ __/   / /_/ / /| | /  |/ / 
     /`\_/`\       / ___ |/ /|  / /_/ // /   / ____/ ___ |/ /|  / /_/ / /___  / _, _/ ___ |/ /|  /  
    //  _  \\      /_/  |_/_/ |_/_____/___/  /_/   /_/  |_/_/ |_/\____/_____/ /_/ |_/_/  |_/_/ |_/   
   | \     )|_     ⚡ A N D I   P A N G E R A N   M 3 6 5   C L I  •  v1.0.0
  /`\_`>  <_/ \    ──────────────────────────────────────────────────────────────────────────────────
  \__/'---'\__/    🐧 Linux Copilot Agent (m365.cloud.microsoft) | Ketik /help untuk daftar perintah
```

CLI interaktif untuk mengakses **Microsoft 365 Copilot** (`https://m365.cloud.microsoft/chat`) langsung dari terminal Linux, dengan gaya seperti **Antigravity (`agy`)** dan **`claude`** CLI.

Menggunakan **Playwright Persistent Browser Session** sehingga Anda cukup login sekali melalui browser (mendukung akun kantor/kampus Microsoft Entra ID, SSO, MFA/Authenticator, maupun akun Microsoft Personal), lalu sesi & cookies disimpan secara lokal di `~/.config/m365-copilot-cli/` untuk penggunaan headless dari CLI.

---

## Fitur Utama
- **Satu Kali Login Browser (`m365 login`)**: Membuka browser untuk login Microsoft (SSO/MFA) dan menyimpan profil serta cookies secara otomatis.
- **Impor Cookies (`m365 login --import-cookies`)**: Mendukung lingkungan server/SSH tanpa GUI dengan mengimpor file JSON dari ekstensi *Cookie-Editor* atau Playwright `storageState`.
- **Mode Interaktif REPL (`m365`)**: Chat bolak-balik di terminal dengan dukungan pemformatan Markdown, *slash commands* (`/new`, `/status`, `/save`, `/screenshot`, `/history`, `/login`, `/exit`).
- **Mode One-Shot & Piping (`m365 -p "..."`)**: Kirim perintah langsung atau *pipe* output dari perintah Linux lain (`cat log.txt | m365 -p "Analisa error ini"`).
- **Hybrid Stream & Multi-Frame DOM Engine**: Mendukung intersepsi WebSocket SignalR M365 Copilot secara *real-time* sekaligus ekstraksi multi-frame/Shadow DOM.

---

## Cara Penggunaan

### 1. Login Pertama Kali (Otomatis URL Dinamis Cloudflare untuk SSH / PuTTY)
Jalankan perintah berikut di terminal (termasuk dari **SSH / PuTTY**):
```bash
m365 login
# Atau eksplisit mode device/SSH/Cloudflare:
m365 login --device
m365 login --no-device
m365 login --cloudflare
```
- **Jika diakses dari SSH / PuTTY (Tanpa GUI / No Display)**:
  - CLI otomatis menjalankan browser secara *headless* di server dan membuat **URL Publik Dinamis Cloudflare (`https://xxxx-xxxx.trycloudflare.com`)** tanpa perlu mengatur SSH Tunnel:
    `👉 https://xxxx-xxxx-xxxx-xxxx.trycloudflare.com`
    *(Tersedia juga URL alternatif LAN `http://192.168.1.10:8365`)*.
  - **Copy & Paste URL Cloudflare tersebut** ke browser di PC/Laptop/HP Anda dari jaringan mana saja.
  - Halaman login Microsoft dari server akan tampil secara *live* di browser Anda. Ketik email, password, dan MFA Anda, lalu pilih **"Yes"** pada *"Stay signed in?"*.
  - Setelah halaman Chat M365 Copilot tampil, sesi akan otomatis tersimpan di server (atau klik tombol **`✅ Simpan Sesi & Selesai`** di halaman web / tekan **[ENTER]** di PuTTY).
  - Jika hanya ingin memakai IP LAN lokal tanpa Cloudflare: `m365 login --no-cloudflare`.
- **Alternatif Impor Cookies JSON**:
  ```bash
  m365 login --import-cookies cookies.json
  ```

### 2. Mode Chat Interaktif & Fitur Antigravity / AGY (`m365`)
```bash
m365
```
Di dalam sesi interaktif, seluruh fitur & *slash commands* setara **Antigravity (`agy`)** tersedia:

#### A. Alur Kerja Agentic (Antigravity Slash Commands)
- `/plan <tugas>` — Buat rencana arsitektur & implementasi bertahap (*Step-by-step Implementation Plan*)
- `/goal <target>` — Mode eksekusi target otonom berlapis sampai target selesai (`[GOAL_COMPLETE]`)
- `/boost <pertanyaan>` — Mode *Deep Thinking*, analisis multi-perspektif, keamanan & verifikasi ketat
- `/grill-me <topik>` — Wawancara interaktif untuk mematangkan desain & spesifikasi sebelum coding
- `/teamwork <tugas>` — Kolaborasi tim multi-agen (*Researcher + Senior Coder + QA Reviewer*)
- `/compact` — Ringkas & padatkan konteks percakapan saat ini lalu lanjutkan di sesi baru yang bersih
- `/learn [aturan|clear]` — Simpan instruksi/preferensi permanen ke memori (`~/.config/m365-copilot-cli/MEMORY.md`)
- `/browser <url> [prompt]` — Buka halaman web via Playwright & analisa isinya langsung dengan Copilot
- `/schedule <durasi> <tugas>` — Jalankan prompt pada jadwal berulang (contoh: `/schedule 5m Cek beban server`)
- `/skills` — Lihat daftar *custom skills* di `~/.config/m365-copilot-cli/skills/` atau `.m365/skills/`

#### B. Integrasi Workspace, Baca Folder Otomatis, File `@file`, & Eksekusi Lokal (`!cmd`) (Setara `agy` & `claude`)
- **Otomatis Baca Folder Saat Login & Masuk CLI**: Saat menjalankan `m365 login` atau `m365`, CLI otomatis membaca struktur pohon direktori & isi file penting di folder tempat Anda berada, serta menampilkannya di kotak **Workspace & Folder Reader** dan prompt `⚡ [📁 ~/script/test14] m365 ❯`.
- **`<path/folder>`** — Ketik langsung path folder Linux di CLI (`m365 /home/andi/script/test14`) atau di dalam prompt interaktif (`/home/andi/script/test14`) untuk langsung pindah & membaca seluruh isi folder tersebut.
- **`/dir [path]` atau `/cd <path>`** — Lihat ringkasan folder kerja saat ini atau pindah ke folder kerja baru.
- **`/add-dir <path>`** (atau flag `--add-dir <path>`) — Tambahkan folder ekstra ke dalam konteks workspace (sama seperti `agy --add-dir` dan `claude --add-dir`).
- **`/ls [path]` & `/tree [path]`** — Tampilkan daftar file beserta ukurannya atau pohon direktori lengkap.
- **`/read <file_atau_folder>`** — Baca penuh isi file atau seluruh file utama di dalam sebuah folder dan analisa dengan Copilot.
- **`@<path/file_atau_folder>`** — Lampirkan isi file atau seluruh isi folder lokal otomatis ke prompt (contoh: `Analisa @docs dan @rpa.py`).
- **`!<perintah_linux>`** — Jalankan perintah shell langsung dari dalam REPL (contoh: `!git status` atau `!ls -la`).
- **`/run <perintah_linux>`** — Jalankan perintah Linux dan tawarkan untuk mengirim output-nya ke Copilot.
- **`/apply [all|nama_file]`** — Terapkan/simpan blok kode dari jawaban terakhir Copilot ke file lokal.
- **`/agent [on|off|auto]`** — Aktifkan/matikan deteksi otomatis pembuatan file & eksekusi perintah bash dari respons Copilot.

#### C. Manajemen Sesi M365 Copilot
- `/help` — Tampilkan daftar perintah lengkap
- `/new` atau `/clear` — Mulai topik/percakapan baru
- `/status` — Cek status sesi, cookies, mode Agent, & jadwal aktif
- `/save hasil.md` — Simpan jawaban terakhir ke file Markdown
- `/screenshot debug.png` — Ambil tangkapan layar browser headless saat ini
- `/history` — Lihat 10 riwayat pertanyaan terakhir
- `/login` / `/logout` — Login ulang atau hapus sesi
- `/exit` — Keluar dari CLI

### 3. Mode One-Shot & Subcommands Antigravity (Langsung dari Terminal)
```bash
# Menggunakan konteks @file langsung dari terminal (seperti agy)
m365 "Jelaskan arsitektur proyek ini dari @package.json dan @src/index.js"

# Subcommand Antigravity langsung dari CLI:
m365 plan "Buat REST API autentikasi JWT di Express.js"
m365 boost "Audit keamanan dan optimasi performa @src/remote-login-server.js"
m365 goal -y "Buatkan script monitoring CPU di monitor.sh"
m365 teamwork "Rancang arsitektur microservices untuk sistem pembayaran"
m365 learn "Selalu gunakan Bahasa Indonesia dan ES Modules (import/export)"

# Piping dari stdin (seperti claude / agy)
git diff | m365 -p "Buatkan commit message dari perubahan ini"

# Output teks murni tanpa warna/markdown (cocok untuk script)
m365 --raw -p "Tulis 1 kalimat motivasi"
```

### 4. Cek Status & Logout
```bash
# Cek status cookies lokal
m365 status

# Verifikasi apakah sesi masih aktif secara headless
m365 status --verify

# Hapus sesi & cookies
m365 logout
```
