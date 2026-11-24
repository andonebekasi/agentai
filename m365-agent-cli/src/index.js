import fs from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import { loginInteractive, printStatus, logoutSession } from './auth.js';
import { startInteractiveRepl, runOneShot } from './repl.js';
import {
  loadConfig,
  saveConfig,
  CONFIG_DIR,
  loadLearnedRules,
  addLearnedRule,
  clearLearnedRules,
  RULES_FILE
} from './config.js';
import { getBannerString } from './banner.js';
import {
  rpaListTabs,
  rpaGetContent,
  rpaScreenshot,
  rpaClick,
  rpaType,
  rpaGoto,
  rpaEval,
  printRpaDockerStatus,
  DEFAULT_CDP_URL
} from './rpa-docker.js';
import {
  executeLocalCommand,
  addWorkspaceDirectory,
  resolveLinuxPath,
  printWorkspaceFolderBox,
  scanFolderSummary
} from './agy-features.js';
import { startM365RouterServer, DEFAULT_ROUTER_PORT } from './router-server.js';

function applyWorkspaceOptions(opts = {}) {
  const targetDir = opts.cwd || opts.dir;
  if (targetDir) {
    const resolved = resolveLinuxPath(targetDir, process.cwd());
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      process.chdir(resolved);
    } else {
      console.error(chalk.yellow(`⚠ Folder tidak ditemukan: ${resolved} (menggunakan ${process.cwd()})`));
    }
  }
  if (Array.isArray(opts.addDir)) {
    for (const d of opts.addDir) {
      try {
        addWorkspaceDirectory(d, process.cwd());
      } catch (err) {
        console.error(chalk.yellow(`⚠ ${err.message}`));
      }
    }
  }
}

async function readPipedStdin() {
  if (process.stdin.isTTY) {
    return '';
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

export async function runCli(argv = process.argv) {
  const program = new Command();

  program
    .name('m365')
    .description(
      'Andi Pangeran M365 CLI - Microsoft 365 Copilot Linux Agent (https://m365.cloud.microsoft/) dengan akses penuh Lokal, Docker & Browser RPA setara Antigravity (agy) CLI'
    )
    .version('1.1.0')
    .addHelpText('beforeAll', getBannerString())
    .option('-p, --prompt <text>', 'Kirim satu prompt langsung (non-interaktif / one-shot) lalu keluar')
    .option('-m, --mode <mode>', 'Mode Antigravity: normal, plan, goal, boost, grill-me, teamwork', 'normal')
    .option('-C, --cwd <dir>', 'Pilih folder kerja Linux (working directory) yang akan dibaca otomatis')
    .option('-d, --dir <dir>', 'Alias untuk --cwd: pilih folder kerja Linux untuk dibaca M365 CLI')
    .option('--add-dir <dirs...>', 'Tambahkan satu atau beberapa folder ekstra ke workspace (setara agy/claude --add-dir)')
    .option('--agent', 'Aktifkan fitur Agentic (akses lokal, Docker, RPA, file & bash)', true)
    .option('--no-agent', 'Matikan fitur Agentic otomatis')
    .option('-y, --auto-approve', 'Otomatis simpan file & jalankan perintah yang dihasilkan Copilot tanpa konfirmasi (YOLO / Auto mode)', false)
    .option('--headed', 'Tampilkan jendela browser saat menjalankan Copilot (mode visual/debug)', false)
    .option('--browser <type>', 'Pilih engine browser: chromium atau firefox', 'chromium')
    .option('--url <url>', 'Override URL M365 Copilot (default: https://m365.cloud.microsoft/chat)')
    .option('--raw', 'Tampilkan output teks murni tanpa pemformatan Markdown', false)
    .argument('[prompt...]', 'Path folder Linux (/path/folder) dan/atau prompt langsung (mendukung @file, @folder, Docker & RPA)');

  program
    .command('login [folder]')
    .description(
      'Login ke akun Microsoft 365 Copilot & baca folder kerja aktif (otomatis mode URL Web Cloudflare untuk SSH/PuTTY)'
    )
    .option('--browser <type>', 'Pilih browser: chromium atau firefox', 'chromium')
    .option('--url <url>', 'Target URL login M365 Copilot')
    .option('--device', 'Gunakan mode SSH/PuTTY (tampilkan URL dinamis Cloudflare untuk di-copy-paste ke browser)')
    .option('--no-device', 'Alias mode SSH/PuTTY headless (tampilkan URL dinamis Cloudflare untuk copy-paste)')
    .option('--ssh', 'Paksa mode login SSH/PuTTY via URL Web Remote Browser + Cloudflare Tunnel')
    .option('--no-browser', 'Jangan buka jendela GUI lokal; tampilkan URL login untuk copy-paste')
    .option('--cloudflare', 'Gunakan URL publik dinamis Cloudflare Quick Tunnel (trycloudflare.com) tanpa SSH tunnel (default: aktif)', true)
    .option('--no-cloudflare', 'Matikan Cloudflare Tunnel dan hanya gunakan IP LAN lokal')
    .option('--port <port>', 'Port web login server lokal (default: 8365)', '8365')
    .option('--import-cookies <file>', 'Impor cookies dari file JSON (Cookie-Editor atau storageState)')
    .option('--remote-port <port>', 'Port untuk remote web login / debugging')
    .action(async (folderArg, cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      applyWorkspaceOptions({ ...globalOpts, dir: folderArg || globalOpts.dir || globalOpts.cwd });
      const rawArgs = process.argv.slice(2);
      const explicitNoDevice =
        rawArgs.includes('--no-device') ||
        rawArgs.includes('--no-browser') ||
        rawArgs.includes('--device') ||
        rawArgs.includes('--ssh') ||
        rawArgs.includes('--cloudflare');
      await loginInteractive({
        ...globalOpts,
        ...cmdOpts,
        cloudflareForce: rawArgs.includes('--cloudflare'),
        device: Boolean(cmdOpts.device || explicitNoDevice)
      });
    });

  program
    .command('status')
    .description('Cek status sesi login M365 Copilot, Container Docker & Browser RPA')
    .option('--verify', 'Verifikasi sesi secara aktif menggunakan headless browser', false)
    .action(async (cmdOpts) => {
      await printStatus(cmdOpts);
      await printRpaDockerStatus();
    });

  program
    .command('logout')
    .description('Hapus sesi login & cookies Microsoft 365 yang tersimpan di lokal')
    .action(() => {
      logoutSession();
    });

  program
    .command('router')
    .alias('serve')
    .alias('9router')
    .description(
      'Jalankan M365 9Router Gateway Server (OpenAI / Anthropic / Hermes Compatible API + Web Dashboard)'
    )
    .option('-p, --port <port>', 'Port server M365 9Router (default: 5365)', String(DEFAULT_ROUTER_PORT))
    .option('-H, --host <host>', 'Host bind address (default: 0.0.0.0)', '0.0.0.0')
    .option('--cwd <dir>', 'Default working directory untuk eksekusi Agentic/Docker/RPA', '/home/andi/script/test14')
    .option('--cloudflare', 'Buka URL publik Cloudflare Quick Tunnel untuk M365 9Router', false)
    .option('--no-prewarm', 'Jangan pre-connect browser saat startup (connect saat ada request pertama)')
    .action(async (cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      await startM365RouterServer({
        ...globalOpts,
        ...cmdOpts,
        port: Number(cmdOpts.port || DEFAULT_ROUTER_PORT)
      });
    });

  program
    .command('rpa [action] [args...]')
    .description(
      'Kontrol Browser RPA di Docker (CDP http://localhost:9222): status, tabs, content, screenshot, click, type, goto, eval, ask'
    )
    .option('--by-text', 'Klik elemen berdasarkan teks yang terlihat di layar', false)
    .option('--url-match <str>', 'Filter tab berdasarkan substring URL atau judul')
    .option('--cdp-url <url>', 'Override endpoint Chrome DevTools Protocol', DEFAULT_CDP_URL)
    .option('-o, --output <file>', 'Nama file output untuk screenshot', 'screenshot.png')
    .option('--full', 'Ambil full-page screenshot', false)
    .action(async (action = 'status', args = [], cmdOpts, cmd) => {
      const act = action.toLowerCase();
      const cdpUrl = cmdOpts.cdpUrl || DEFAULT_CDP_URL;
      const argText = Array.isArray(args) ? args.join(' ').trim() : '';

      try {
        if (act === 'status' || act === 'info') {
          await printRpaDockerStatus();
        } else if (act === 'tabs') {
          const tabs = await rpaListTabs(cdpUrl);
          console.log(`Open Tabs (${tabs.length}):`);
          tabs.forEach((t) => console.log(`[${t.index}] ${t.title} -> ${t.url}`));
        } else if (act === 'content' || act === 'read') {
          const data = await rpaGetContent(cmdOpts.urlMatch || argText || null, cdpUrl);
          console.log(`=== Content of [${data.tabIndex}] ${data.title} (${data.url}) ===\n`);
          console.log(data.text);
          if (data.interactiveElements.length > 0) {
            console.log(`\n=== Interactive Elements (${data.interactiveElements.length}) ===`);
            data.interactiveElements.slice(0, 40).forEach((e) => {
              console.log(` - [${e.tag.toUpperCase()}] ${e.text}`);
            });
          }
        } else if (act === 'screenshot' || act === 'ss') {
          const outFile = args[0] || cmdOpts.output || 'screenshot.png';
          const res = await rpaScreenshot(outFile, cmdOpts.urlMatch || null, Boolean(cmdOpts.full), cdpUrl);
          console.log(`Screenshot saved to ${res.path} (Page: ${res.url})`);
        } else if (act === 'click') {
          if (!argText) {
            console.error(chalk.red('Penggunaan: m365 rpa click "<teks atau selector>" [--by-text]'));
            process.exitCode = 1;
            return;
          }
          const res = await rpaClick(argText, {
            byText: Boolean(cmdOpts.byText),
            targetMatch: cmdOpts.urlMatch || null,
            cdpUrl
          });
          console.log(chalk.green(`✔ Clicked "${argText}" -> Current URL: ${res.url} (${res.title})`));
        } else if (act === 'type' || act === 'fill') {
          const [selector, ...rest] = args;
          const textToFill = rest.join(' ');
          if (!selector || !textToFill) {
            console.error(chalk.red('Penggunaan: m365 rpa type "<selector>" "<teks>"'));
            process.exitCode = 1;
            return;
          }
          const res = await rpaType(selector, textToFill, {
            targetMatch: cmdOpts.urlMatch || null,
            cdpUrl
          });
          console.log(chalk.green(`✔ Typed into ${selector} on ${res.url}`));
        } else if (act === 'goto' || act === 'open') {
          if (!argText) {
            console.error(chalk.red('Penggunaan: m365 rpa goto "<url>"'));
            process.exitCode = 1;
            return;
          }
          const res = await rpaGoto(argText, { targetMatch: cmdOpts.urlMatch || null, cdpUrl });
          console.log(chalk.green(`✔ Navigated to: ${res.url} (${res.title})`));
        } else if (act === 'eval' || act === 'js') {
          if (!argText) {
            console.error(chalk.red('Penggunaan: m365 rpa eval "<ekspresi_js>"'));
            process.exitCode = 1;
            return;
          }
          const res = await rpaEval(argText, { targetMatch: cmdOpts.urlMatch || null, cdpUrl });
          console.log('Result:', res.result);
        } else {
          // `m365 rpa ask "..."` or `m365 rpa "instruksi"`
          const globalOpts = cmd.parent?.opts() || {};
          const prompt = act === 'ask' ? argText : [action, ...args].join(' ');
          await runOneShot(
            prompt || 'Analisa tampilan layar Browser RPA Docker saat ini dan berikan langkah pengerjaan berikutnya.',
            globalOpts
          );
        }
      } catch (err) {
        console.error(chalk.red(`✖ RPA Error: ${err.message}`));
        process.exitCode = 1;
      }
    });

  program
    .command('docker [args...]')
    .description('Jalankan atau analisa container Docker lokal dengan M365 Copilot')
    .action(async (args = []) => {
      const subCmd = args.length > 0 ? `docker ${args.join(' ')}` : 'docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"';
      await executeLocalCommand(subCmd);
    });

  program
    .command('ask <prompt...>')
    .description('Kirim satu pertanyaan ke M365 Copilot dari terminal (mendukung @file, Docker & RPA)')
    .action(async (promptWords, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      const piped = await readPipedStdin();
      const basePrompt = promptWords.join(' ');
      const fullPrompt = piped ? `${basePrompt}\n\n\`\`\`\n${piped}\n\`\`\`` : basePrompt;
      await runOneShot(fullPrompt, globalOpts);
    });

  program
    .command('plan <prompt...>')
    .description('Antigravity /plan mode: Buat rencana implementasi step-by-step dari terminal')
    .action(async (promptWords, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      const piped = await readPipedStdin();
      const basePrompt = promptWords.join(' ');
      const fullPrompt = piped ? `${basePrompt}\n\n\`\`\`\n${piped}\n\`\`\`` : basePrompt;
      await runOneShot(fullPrompt, { ...globalOpts, mode: 'plan' });
    });

  program
    .command('boost <prompt...>')
    .description('Antigravity /boost mode: Deep thinking, multi-perspective analysis & verifikasi ketat')
    .action(async (promptWords, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      const piped = await readPipedStdin();
      const basePrompt = promptWords.join(' ');
      const fullPrompt = piped ? `${basePrompt}\n\n\`\`\`\n${piped}\n\`\`\`` : basePrompt;
      await runOneShot(fullPrompt, { ...globalOpts, mode: 'boost' });
    });

  program
    .command('goal <prompt...>')
    .description('Antigravity /goal mode: Eksekusi target secara menyeluruh beserta pembuatan file & RPA')
    .action(async (promptWords, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      const piped = await readPipedStdin();
      const basePrompt = promptWords.join(' ');
      const fullPrompt = piped ? `${basePrompt}\n\n\`\`\`\n${piped}\n\`\`\`` : basePrompt;
      await runOneShot(fullPrompt, { ...globalOpts, mode: 'goal', agent: true });
    });

  program
    .command('teamwork <prompt...>')
    .description('Antigravity /teamwork mode: Kolaborasi tim multi-agen (Researcher, Coder, QA)')
    .action(async (promptWords, _cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      const piped = await readPipedStdin();
      const basePrompt = promptWords.join(' ');
      const fullPrompt = piped ? `${basePrompt}\n\n\`\`\`\n${piped}\n\`\`\`` : basePrompt;
      await runOneShot(fullPrompt, { ...globalOpts, mode: 'teamwork' });
    });

  program
    .command('learn [rule...]')
    .description('Antigravity /learn mode: Simpan atau lihat aturan/preferensi permanen untuk Copilot')
    .option('--clear', 'Hapus seluruh aturan yang tersimpan di MEMORY.md', false)
    .action((ruleWords, cmdOpts) => {
      if (cmdOpts.clear) {
        clearLearnedRules();
        console.log(chalk.green('✔ Seluruh memori /learn berhasil dihapus.'));
        return;
      }
      const text = Array.isArray(ruleWords) ? ruleWords.join(' ').trim() : '';
      if (!text) {
        const rules = loadLearnedRules();
        console.log(chalk.cyan.bold(`\n🧠 Memori & Aturan (/learn) — ${RULES_FILE}:`));
        console.log(rules || chalk.gray('Belum ada aturan tersimpan.'));
      } else {
        const saved = addLearnedRule(text);
        console.log(chalk.green(`✔ Aturan disimpan ke ${saved}: "${text}"`));
      }
    });

  program
    .command('config')
    .description('Lihat atau ubah konfigurasi default Andi Pangeran M365 CLI')
    .option('--set-url <url>', 'Ubah URL default M365 Copilot')
    .option('--set-timeout <ms>', 'Ubah batas waktu tunggu respons dalam milidetik')
    .action((cmdOpts) => {
      if (cmdOpts.setUrl) {
        saveConfig({ url: cmdOpts.setUrl });
        console.log(chalk.green(`✔ URL default diubah ke: ${cmdOpts.setUrl}`));
      }
      if (cmdOpts.setTimeout) {
        saveConfig({ timeoutMs: Number(cmdOpts.setTimeout) });
        console.log(chalk.green(`✔ Timeout diubah ke: ${cmdOpts.setTimeout}ms`));
      }
      const cfg = loadConfig();
      console.log(chalk.cyan.bold(`\n⚙ Konfigurasi (${CONFIG_DIR}/config.json):`));
      console.log(JSON.stringify(cfg, null, 2));
    });

  program
    .command('dir [folder] [prompt...]')
    .alias('folder')
    .alias('tree')
    .description('Baca struktur & isi folder Linux (setara agy/claude) atau buka sesi M365 di folder tersebut')
    .option('-i, --interactive', 'Buka mode interaktif REPL di dalam folder tersebut', false)
    .action(async (folderArg = '.', promptWords = [], cmdOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() || {};
      applyWorkspaceOptions({ ...globalOpts, dir: folderArg });
      const scan = printWorkspaceFolderBox(process.cwd(), { showTree: true });
      if (!scan.exists) {
        process.exitCode = 1;
        return;
      }
      if (Array.isArray(promptWords) && promptWords.length > 0) {
        await runOneShot(promptWords.join(' '), globalOpts);
      } else if (cmdOpts.interactive) {
        await startInteractiveRepl(globalOpts);
      }
    });

  program.action(async (promptArgs, opts) => {
    applyWorkspaceOptions(opts);
    const piped = await readPipedStdin();

    let remainingArgs = Array.isArray(promptArgs) ? [...promptArgs] : [];

    // Support `m365 /path/to/folder` or `m365 /path/to/folder "prompt..."` just like `agy` and `claude`
    if (remainingArgs.length > 0) {
      const candidatePath = resolveLinuxPath(remainingArgs[0], process.cwd());
      if (fs.existsSync(candidatePath)) {
        try {
          const st = fs.statSync(candidatePath);
          if (st.isDirectory()) {
            process.chdir(candidatePath);
            remainingArgs.shift();
          }
        } catch {
          // ignore
        }
      }
    }

    const argPrompt = remainingArgs.length > 0 ? remainingArgs.join(' ') : '';
    const flagPrompt = opts.prompt || '';
    const combinedPrompt = [flagPrompt, argPrompt, piped].filter(Boolean).join('\n\n');

    if (combinedPrompt) {
      await runOneShot(combinedPrompt, opts);
    } else {
      await startInteractiveRepl(opts);
    }
  });

  await program.parseAsync(argv);
}
