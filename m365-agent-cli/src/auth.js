import fs from 'node:fs';
import readline from 'node:readline';
import { chromium, firefox } from 'playwright';
import chalk from 'chalk';
import ora from 'ora';
import {
  PROFILE_DIR,
  STATE_FILE,
  CONFIG_DIR,
  ensureDirectories,
  loadConfig,
  getSessionInfo,
  clearSession
} from './config.js';
import { findChatInputAcrossFrames, isLoginUrl } from './dom-helpers.js';
import { startRemoteLoginServer } from './remote-login-server.js';
import { printBanner } from './banner.js';
import { printWorkspaceFolderBox } from './agy-features.js';

/**
 * Parse raw JSON string of cookies (Cookie-Editor array or Playwright storageState)
 * and save to STATE_FILE.
 */
export function saveCookiesFromJsonString(rawJsonString) {
  ensureDirectories();
  const raw = JSON.parse(rawJsonString);
  let cookies = [];
  let origins = [];

  if (Array.isArray(raw)) {
    const sameSiteMap = {
      no_restriction: 'None',
      unspecified: 'Lax',
      lax: 'Lax',
      strict: 'Strict',
      none: 'None'
    };
    cookies = raw.map((c) => {
      const rawSameSite = String(c.sameSite || 'Lax').toLowerCase();
      return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate ? Number(c.expirationDate) : -1,
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
        sameSite: sameSiteMap[rawSameSite] || 'Lax'
      };
    });
  } else if (raw && Array.isArray(raw.cookies)) {
    cookies = raw.cookies;
    origins = raw.origins || [];
  } else {
    throw new Error(
      'Format JSON tidak dikenali. Gunakan format array Cookie-Editor atau Playwright storageState.'
    );
  }

  const state = { cookies, origins };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  return cookies;
}

/**
 * Import cookies from a JSON file (supports Playwright storageState format
 * or browser extension Cookie-Editor / EditThisCookie array format).
 */
export function importCookiesFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File cookie tidak ditemukan: ${filePath}`);
  }
  const rawJson = fs.readFileSync(filePath, 'utf8');
  const cookies = saveCookiesFromJsonString(rawJson);
  return cookies.length;
}

/**
 * Interactive login via Playwright Browser (Desktop GUI or Headless SSH/PuTTY Web Login URL)
 */
export async function loginInteractive(options = {}) {
  ensureDirectories();
  const config = loadConfig();
  const targetUrl = options.url || config.url || 'https://m365.cloud.microsoft/chat';
  const useFirefox = options.browser === 'firefox';

  if (options.importCookies) {
    const count = importCookiesFromFile(options.importCookies);
    console.log(chalk.green(`✔ Berhasil mengimpor ${count} cookies ke ${STATE_FILE}`));
    return true;
  }

  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const forceHeadlessWeb = Boolean(
    !hasDisplay ||
      options.device ||
      options.noDevice ||
      options.ssh ||
      options.noBrowser ||
      options.cloudflareForce ||
      options.port ||
      options.remotePort
  );

  const browserType = useFirefox ? firefox : chromium;
  const launchArgs = useFirefox
    ? []
    : [
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox'
      ];

  const viewport = { width: 1280, height: 850 };
  let context;
  let runningHeadless = forceHeadlessWeb;

  if (!runningHeadless) {
    try {
      context = await browserType.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        viewport,
        userAgent: config.userAgent,
        args: launchArgs
      });
    } catch {
      // Fallback automatically to Headless SSH / Web Login mode if XServer fails
      runningHeadless = true;
    }
  }

  if (runningHeadless) {
    try {
      context = await browserType.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        viewport,
        userAgent: config.userAgent,
        args: launchArgs
      });
    } catch (err) {
      throw new Error(
        `Gagal membuka headless browser (${useFirefox ? 'firefox' : 'chromium'}): ${err.message}`
      );
    }
  }

  // Restore existing storageState cookies if any
  if (fs.existsSync(STATE_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (Array.isArray(saved.cookies) && saved.cookies.length > 0) {
        await context.addCookies(saved.cookies);
      }
    } catch {
      // ignore
    }
  }

  const page = context.pages()[0] || (await context.newPage());

  // Remove navigator.webdriver fingerprint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  let finished = false;
  let finishReason = 'auto';
  let resolveWebAction;
  const webActionPromise = new Promise((resolve) => {
    resolveWebAction = resolve;
  });

  let remoteServer = null;
  let initialNavPromise = null;
  if (runningHeadless) {
    // Start navigating to M365 Copilot in the background while Cloudflare tunnel spins up
    initialNavPromise = page
      .goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => {});

    const enableCloudflare = options.cloudflare !== false;
    const preferredPort = Number(options.port || options.remotePort || 8365);
    const cfSpinner = enableCloudflare
      ? ora('Membuat URL dinamis publik menggunakan Cloudflare Tunnel (trycloudflare.com)...').start()
      : null;

    remoteServer = await startRemoteLoginServer({
      context,
      page,
      preferredPort,
      viewport,
      enableCloudflare,
      onManualSave: () => {
        if (!finished) {
          finished = true;
          resolveWebAction('web-save');
        }
      },
      onImportCookiesRaw: async (rawJson) => {
        const cookies = saveCookiesFromJsonString(rawJson);
        await context.addCookies(cookies);
        if (!finished) {
          finished = true;
          resolveWebAction('web-cookies');
        }
      }
    });

    if (cfSpinner) {
      if (remoteServer.cloudflareUrl) {
        cfSpinner.succeed(
          chalk.green(`Cloudflare Quick Tunnel aktif: ${chalk.bold(remoteServer.cloudflareUrl)}`)
        );
      } else {
        cfSpinner.warn(
          chalk.yellow(
            'Cloudflare Tunnel tidak tersedia, menggunakan URL IP LAN lokal sebagai fallback.'
          )
        );
      }
    }

    printBanner();
    console.log(
      chalk.cyan.bold('🔐 Andi Pangeran M365 CLI - SSH / PuTTY Headless Login (Cloudflare URL)')
    );
    console.log(chalk.gray('──────────────────────────────────────────────────────────────────────'));
    console.log(`🌐 Target M365 : ${chalk.underline(targetUrl)}`);
    console.log(`📁 Profil Sesi : ${chalk.gray(PROFILE_DIR)}`);
    console.log(`📂 Folder Aktif: ${chalk.green.bold(process.cwd())}`);
    console.log(
      chalk.bgBlue.white.bold(
        '\n 📋 COPY & PASTE URL DINAMIS BERIKUT KE BROWSER DI PC / HP / LAPTOP ANDA: '
      )
    );
    console.log(`\n   👉  ${chalk.green.bold.underline(remoteServer.primaryUrl)}\n`);
    if (remoteServer.cloudflareUrl) {
      console.log(chalk.gray(`   Alternatif LAN   : ${remoteServer.lanUrl}`));
    } else if (remoteServer.allUrls.length > 1) {
      console.log(
        chalk.gray(`   Alternatif IP    : ${remoteServer.allUrls.slice(1).join(' , ')}`)
      );
    }
    console.log(
      chalk.gray(
        `   Alternatif Lokal : ${remoteServer.localUrl}  (tanpa perlu SSH tunnel jika memakai URL Cloudflare di atas)`
      )
    );
    console.log(
      chalk.yellow(
        '\nInstruksi Login via URL Dinamis Cloudflare:\n' +
          `1. Copy URL ${chalk.bold(remoteServer.primaryUrl)} di atas lalu Paste ke browser di PC/Laptop/HP Anda (tanpa perlu SSH tunnel).\n` +
          '2. Halaman login Microsoft 365 dari server ini akan tampil secara live di browser Anda.\n' +
          '3. Ketik Email, Password, & selesaikan MFA/Authenticator, lalu pilih "Yes" pada "Stay signed in?".\n' +
          '4. Sesi akan tersimpan otomatis saat halaman Chat Copilot tampil, ATAU klik tombol "✅ Simpan Sesi"\n' +
          '   di halaman web tersebut, ATAU tekan [ENTER] di terminal PuTTY ini kapan saja.\n'
      )
    );
    printWorkspaceFolderBox(process.cwd(), {
      title: '📂 Folder Linux Terdeteksi Saat Login (Auto-Read Setara AGY / Claude)'
    });
    console.log('');
  } else {
    printBanner();
    console.log(chalk.cyan.bold('🔐 Andi Pangeran M365 CLI - Browser Login'));
    console.log(chalk.gray('──────────────────────────────────────────────────────────'));
    console.log(`🌐 Membuka URL : ${chalk.underline(targetUrl)}`);
    console.log(`📁 Profil Sesi : ${chalk.gray(PROFILE_DIR)}`);
    console.log(`📂 Folder Aktif: ${chalk.green.bold(process.cwd())}`);
    console.log(
      chalk.yellow(
        '\nInstruksi:\n' +
          '1. Silakan login dengan akun Microsoft 365 / Entra ID / Personal Anda di jendela browser yang terbuka.\n' +
          '2. Selesaikan verifikasi MFA / Authenticator jika diminta, dan pilih "Yes" pada "Stay signed in?".\n' +
          '3. Tunggu sampai halaman Chat M365 Copilot tampil.\n' +
          '4. CLI akan otomatis mendeteksi login, ATAU Anda bisa menekan [ENTER] di terminal ini kapan saja untuk menyimpan sesi.\n'
      )
    );
    printWorkspaceFolderBox(process.cwd(), {
      title: '📂 Folder Linux Terdeteksi Saat Login (Auto-Read Setara AGY / Claude)'
    });
    console.log('');
  }

  const spinner = ora(
    runningHeadless
      ? `Menunggu Anda login melalui ${chalk.green.bold(remoteServer.primaryUrl)} ... (Tekan [ENTER] jika sudah selesai)`
      : 'Menunggu proses login di browser... (Tekan [ENTER] jika sudah masuk ke halaman chat)'
  ).start();

  if (initialNavPromise) {
    await initialNavPromise;
  } else {
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch {
      // Allow navigation timeouts while user is redirected to login.microsoftonline.com
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const manualEnterPromise = new Promise((resolve) => {
    rl.once('line', () => {
      finished = true;
      resolve('manual');
    });
  });

  const browserClosedPromise = new Promise((resolve) => {
    context.on('close', () => {
      finished = true;
      resolve('closed');
    });
  });

  const autoDetectPromise = (async () => {
    while (!finished) {
      await new Promise((r) => setTimeout(r, 2000));
      if (finished) break;
      try {
        const currentPages = context.pages();
        if (currentPages.length === 0) {
          return 'closed';
        }
        const activePage = currentPages[currentPages.length - 1];
        const url = activePage.url();
        if (!isLoginUrl(url) && (url.includes('cloud.microsoft') || url.includes('office.com'))) {
          const inputFound = await findChatInputAcrossFrames(activePage);
          if (inputFound) {
            if (remoteServer) remoteServer.setChatReady(true);
            spinner.text = chalk.green(
              'Halaman chat Copilot terdeteksi! Menyimpan sesi dalam 3 detik...'
            );
            await new Promise((r) => setTimeout(r, 3000));
            return 'auto';
          }
        }
      } catch {
        // Ignore transient navigation errors while redirects happen
      }
    }
    return 'stopped';
  })();

  finishReason = await Promise.race([
    manualEnterPromise,
    autoDetectPromise,
    browserClosedPromise,
    webActionPromise
  ]);
  finished = true;
  rl.close();

  try {
    if (finishReason !== 'closed' && finishReason !== 'web-cookies') {
      await context.storageState({ path: STATE_FILE });
    }
  } catch {
    // ignore
  }

  if (remoteServer) {
    await remoteServer.close().catch(() => {});
  }

  try {
    if (finishReason !== 'closed') {
      await context.close();
    }
  } catch {
    // Context may already be closed
  }

  const info = getSessionInfo();
  if (info.cookieCount > 0 || info.hasProfileDir) {
    spinner.succeed(
      chalk.green(
        `Login berhasil disimpan! (${info.cookieCount} cookies tersimpan, ${info.microsoftCookies} cookie Microsoft)`
      )
    );
    console.log(chalk.gray(`   Lokasi sesi: ${CONFIG_DIR}\n`));
    printWorkspaceFolderBox(process.cwd(), {
      title: '📂 Folder Aktif Siap Dibaca M365 CLI (Setara AGY / Claude)'
    });
    console.log(
      chalk.cyan(
        '\n🚀 Sekarang Anda bisa mulai chat & baca folder dari CLI:\n' +
          '   • Mode Interaktif (Otomatis Baca Folder Ini) : m365\n' +
          '   • Buka Folder Tertentu                       : m365 /path/ke/folder\n' +
          '   • Mode One-Shot                              : m365 -p "Analisa isi folder ini"'
      )
    );
    return true;
  } else {
    spinner.warn(chalk.yellow('Sesi ditutup sebelum cookie Microsoft tersimpan.'));
    return false;
  }
}

export async function printStatus(options = {}) {
  const info = getSessionInfo();
  const config = loadConfig();

  printBanner();
  console.log(chalk.cyan.bold('📊 Status Sesi Andi Pangeran M365 CLI'));
  console.log(chalk.gray('──────────────────────────────────────────────────────────'));
  console.log(`Target URL         : ${chalk.white(config.url)}`);
  console.log(`Direktori Konfig   : ${chalk.gray(CONFIG_DIR)}`);
  console.log(
    `File State Cookie  : ${info.hasStateFile ? chalk.green('Ada') : chalk.red('Belum ada')}`
  );
  console.log(
    `Profil Browser     : ${info.hasProfileDir ? chalk.green('Ada') : chalk.red('Belum ada')}`
  );
  console.log(
    `Total Cookies      : ${chalk.yellow(info.cookieCount)} (${info.microsoftCookies} Microsoft/Office)`
  );
  if (info.domains.length > 0) {
    console.log(`Domain Aktif       : ${chalk.gray(info.domains.slice(0, 6).join(', '))}`);
  }
  if (info.updatedAt) {
    console.log(`Terakhir Diperbarui: ${chalk.gray(info.updatedAt)}`);
  }
  console.log('');
  printWorkspaceFolderBox(process.cwd());

  if (!info.hasStateFile && !info.hasProfileDir) {
    console.log(chalk.yellow('\n💡 Anda belum login. Jalankan `m365 login` terlebih dahulu.'));
    return false;
  }

  if (options.verify) {
    const spinner = ora('Memverifikasi sesi secara headless ke m365.cloud.microsoft...').start();
    try {
      const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        userAgent: config.userAgent,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
      });
      if (fs.existsSync(STATE_FILE)) {
        const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (Array.isArray(saved.cookies) && saved.cookies.length > 0) {
          await context.addCookies(saved.cookies);
        }
      }
      const page = context.pages()[0] || (await context.newPage());
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 4000));
      const finalUrl = page.url();
      await context.close();

      if (isLoginUrl(finalUrl)) {
        spinner.fail(
          chalk.red(
            `Sesi sudah kedaluwarsa (dialihkan ke halaman login: ${finalUrl}). Silakan jalankan 'm365 login' kembali.`
          )
        );
        return false;
      } else {
        spinner.succeed(chalk.green(`Sesi valid! Berhasil mengakses: ${finalUrl}`));
        return true;
      }
    } catch (err) {
      spinner.fail(chalk.red(`Gagal memverifikasi sesi: ${err.message}`));
      return false;
    }
  }

  return true;
}

export function logoutSession() {
  clearSession();
  console.log(chalk.green('✔ Sesi dan cookies M365 Copilot berhasil dihapus.'));
}
