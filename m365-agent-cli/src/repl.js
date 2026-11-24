import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';
import ora from 'ora';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { M365CopilotClient } from './browser-client.js';
import { loginInteractive, printStatus, logoutSession } from './auth.js';
import {
  hasSavedSession,
  appendHistory,
  getHistory,
  loadLearnedRules,
  addLearnedRule,
  clearLearnedRules,
  listSkills,
  RULES_FILE,
  SKILLS_DIR
} from './config.js';
import { printBanner } from './banner.js';
import {
  buildAgyprompt,
  extractActionBlocks,
  executeLocalCommand,
  handleAgentActions,
  parseDurationMs,
  printWorkspaceFolderBox,
  scanFolderSummary,
  readFolderFilesContent,
  resolveLinuxPath,
  formatShortPath,
  addWorkspaceDirectory,
  detectLinuxPathInput,
  shouldAutoReadFolderContents
} from './agy-features.js';
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

const marked = new Marked(markedTerminal());

export function renderMarkdown(text) {
  if (!text) return '';
  try {
    return marked.parse(text).trimEnd();
  } catch {
    return text;
  }
}

export { printBanner };

export function printReplHelp() {
  console.log(chalk.cyan.bold('\n🚀 Perintah Slash Antigravity / AGY di Andi Pangeran M365 CLI:'));
  console.log(chalk.white.bold('  [Alur Kerja Agentic / Antigravity Slash Commands]'));
  console.log(`  ${chalk.yellow('/plan <tugas>')}             Buat rencana arsitektur & implementasi bertahap (Step-by-step plan)`);
  console.log(`  ${chalk.yellow('/goal <target>')}            Jalankan mode otonom berlapis sampai target tercapai`);
  console.log(`  ${chalk.yellow('/boost <pertanyaan>')}       Mode berpikir mendalam (Deep Thinking, multi-perspektif & verifikasi)`);
  console.log(`  ${chalk.yellow('/grill-me <topik>')}         Wawancara interaktif untuk mematangkan desain/arsitektur proyek`);
  console.log(`  ${chalk.yellow('/teamwork <tugas>')}         Simulasi tim multi-agen (Researcher + Coder + QA Reviewer)`);
  console.log(`  ${chalk.yellow('/compact')}                  Ringkas & padatkan konteks percakapan saat ini lalu reset sesi`);
  console.log(`  ${chalk.yellow('/learn [aturan|clear]')}     Simpan preferensi/aturan permanen ke memori (${RULES_FILE})`);
  console.log(`  ${chalk.yellow('/browser <url> [prompt]')}   Buka halaman web via Playwright & analisa isinya dengan Copilot`);
  console.log(`  ${chalk.yellow('/schedule <durasi> <tugas>')}Jalankan prompt berulang/terjadwal (contoh: /schedule 5m Cek status server)`);
  console.log(`  ${chalk.yellow('/skills')}                   Lihat daftar custom skills yang terpasang`);

  console.log(chalk.white.bold('\n  [Docker Container & Browser RPA Control (CDP Port 9222 — Setara AGY)]'));
  console.log(`  ${chalk.yellow('/rpa [status|tabs]')}        Cek status Docker Container, Cloudflare Tunnel, & Tab Browser RPA`);
  console.log(`  ${chalk.yellow('/rpa content [tab/url]')}    Baca seluruh teks & elemen interaktif dari layar Browser RPA Docker`);
  console.log(`  ${chalk.yellow('/rpa ask <instruksi>')}      Ambil isi layar Browser RPA Docker saat ini & analisa dengan Copilot`);
  console.log(`  ${chalk.yellow('/rpa click <teks/sel>')}     Klik tombol/elemen di Browser RPA Docker (contoh: /rpa click Resume)`);
  console.log(`  ${chalk.yellow('/rpa type <sel> <teks>')}    Ketik teks ke kolom input di Browser RPA Docker`);
  console.log(`  ${chalk.yellow('/rpa goto <url>')}           Arahkan tab Browser RPA Docker ke URL tujuan`);
  console.log(`  ${chalk.yellow('/rpa screenshot [file]')}    Ambil screenshot dari Browser RPA Docker (http://localhost:9222)`);
  console.log(`  ${chalk.yellow('/docker [ps|logs|exec..]')}  Jalankan perintah Docker (contoh: /docker ps, /docker logs chromium-rpa)`);

  console.log(chalk.white.bold('\n  [Akses & Baca Folder Linux (Setara AGY & Claude Code)]'));
  console.log(`  ${chalk.green('<path/folder>')}              Ketik langsung path folder (misal: ${chalk.cyan('/home/andi/script/test14')}) untuk pindah & baca isi folder`);
  console.log(`  ${chalk.green('@<file_atau_folder>')}        Lampirkan isi file atau seluruh isi folder ke prompt (contoh: ${chalk.cyan('Analisa @docs')} atau ${chalk.cyan('@rpa.py')})`);
  console.log(`  ${chalk.yellow('/dir [path]')} atau ${chalk.yellow('/cd <path>')} Lihat ringkasan folder aktif atau pindah ke folder kerja baru`);
  console.log(`  ${chalk.yellow('/add-dir <path>')}            Tambahkan folder tambahan ke workspace (seperti ${chalk.cyan('agy --add-dir')} / ${chalk.cyan('claude --add-dir')})`);
  console.log(`  ${chalk.yellow('/ls [path]')} atau ${chalk.yellow('/files')}     Tampilkan daftar file & sub-folder beserta ukurannya`);
  console.log(`  ${chalk.yellow('/tree [path]')}               Tampilkan struktur pohon direktori (Directory Tree)`);
  console.log(`  ${chalk.yellow('/read <path> [instruksi]')}   Baca isi file atau seluruh file di dalam folder & kirim ke Copilot`);
  console.log(`  ${chalk.green('!<perintah_linux>')}         Jalankan perintah bash langsung dari CLI (contoh: !docker compose ps)`);
  console.log(`  ${chalk.yellow('/run <perintah_linux>')}     Jalankan perintah bash & opsional kirim output ke Copilot`);
  console.log(`  ${chalk.yellow('/apply [all]')}              Terapkan/simpan blok kode dari jawaban terakhir Copilot ke file lokal`);
  console.log(`  ${chalk.yellow('/agent [on|off|auto]')}      Aktifkan/matikan mode Agent (deteksi otomatis file, bash, Docker & RPA)`);

  console.log(chalk.white.bold('\n  [Manajemen Sesi M365 Copilot]'));
  console.log(`  ${chalk.yellow('/new')} atau ${chalk.yellow('/clear')}          Mulai percakapan baru (reset konteks Copilot)`);
  console.log(`  ${chalk.yellow('/status')}                   Lihat status sesi cookies, Docker/RPA, mode Agent, & jadwal aktif`);
  console.log(`  ${chalk.yellow('/save <file.md>')}           Simpan jawaban terakhir Copilot ke file Markdown`);
  console.log(`  ${chalk.yellow('/screenshot [file.png]')}    Ambil screenshot halaman internal M365 Copilot`);
  console.log(`  ${chalk.yellow('/history')}                  Tampilkan 10 riwayat prompt terakhir`);
  console.log(`  ${chalk.yellow('/login')} / ${chalk.yellow('/logout')}          Login ulang atau hapus sesi Microsoft 365`);
  console.log(`  ${chalk.yellow('/exit')} atau ${chalk.yellow('/quit')}          Keluar dari Andi Pangeran M365 CLI\n`);
}

function formatExecutedCommandsFeedback(executedCommands, appliedFiles = []) {
  const blocks = [];
  if (appliedFiles.length > 0) {
    blocks.push(`File lokal yang telah dibuat/diperbarui: ${appliedFiles.join(', ')}`);
  }
  for (const item of executedCommands) {
    blocks.push(
      `### Hasil Eksekusi Perintah Lokal:\n\`\`\`bash\n${item.command.trim()}\n\`\`\`\n` +
        `Status: ${item.ok ? 'SUCCESS (Exit 0)' : 'ERROR'}\n` +
        `Output:\n\`\`\`text\n${(item.output || '(tidak ada output stdout)').trim()}\n\`\`\``
    );
  }
  return (
    `Berikut adalah hasil eksekusi perintah secara langsung di mesin Linux / Docker / RPA lokal pengguna:\n\n` +
    blocks.join('\n\n') +
    `\n\nSilakan analisa output asli di atas dan lanjutkan langkah penyelesaiannya secara lengkap. Jika semua tugas sudah tuntas, berikan jawaban akhir yang komprehensif.`
  );
}

/**
 * One-shot execution: `m365 -p "pertanyaan"` or `m365 "ada di docker di folder ini"`
 */
export async function runOneShot(promptText, options = {}) {
  if (!hasSavedSession()) {
    console.error(
      chalk.yellow('⚠ Belum ada sesi login M365. Menjalankan proses login terlebih dahulu...\n')
    );
    const ok = await loginInteractive(options);
    if (!ok) {
      process.exit(1);
    }
  }

  const mode = options.mode || 'normal';
  const agentActive = Boolean(options.agent !== false || options.autoApprove);
  const autoReadFolder = shouldAutoReadFolderContents(promptText, process.cwd());
  if (autoReadFolder && !options.raw) {
    const scan = scanFolderSummary(process.cwd());
    console.log(
      chalk.cyan(`📂 [Auto-Read Folder] Membaca folder kerja `) +
        chalk.green.bold(scan.dirPath) +
        chalk.gray(` (${scan.fileCount} file, ${scan.dirCount} sub-folder)`)
    );
  }
  const { finalPrompt, attachedFiles } = await buildAgyprompt(promptText, mode, {
    agent: agentActive
  });

  if (attachedFiles.length > 0 && !options.raw) {
    console.log(
      chalk.cyan(`📎 Melampirkan ${attachedFiles.length} konteks file/folder lokal: `) +
        attachedFiles.map((f) => chalk.green(f.path)).join(', ')
    );
  }

  const client = new M365CopilotClient({
    headless: !options.headed,
    url: options.url,
    browser: options.browser
  });

  const spinner = !options.raw ? ora('Menghubungkan ke M365 Copilot...').start() : null;

  try {
    await client.connect((statusText) => {
      if (spinner) spinner.text = statusText;
    });

    let currentPromptToSend = finalPrompt;
    let loopRound = 0;
    const maxLoopRounds = 3;

    while (loopRound <= maxLoopRounds) {
      if (spinner) {
        spinner.start(
          loopRound > 0
            ? `Copilot memproses hasil eksekusi lokal (Iterasi Agent #${loopRound + 1})...`
            : mode !== 'normal'
              ? `Copilot sedang memproses dalam mode [/${mode}]...`
              : 'Copilot sedang berpikir...'
        );
      }

      const response = await client.ask(currentPromptToSend, {
        onUpdate: (fullText) => {
          if (spinner) {
            const preview = fullText.replace(/\s+/g, ' ').slice(-60);
            spinner.text = `Menerima respons (${fullText.length} karakter): ${chalk.gray(preview)}`;
          }
        }
      });

      if (spinner) spinner.stop();

      if (!response) {
        console.error(chalk.red('✖ Tidak ada respons yang diterima dari M365 Copilot.'));
        process.exitCode = 1;
        break;
      }

      appendHistory({ prompt: promptText, response });
      if (options.raw) {
        process.stdout.write(response + '\n');
      } else {
        console.log(renderMarkdown(response));
      }

      if (!agentActive) break;

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const { appliedFiles, executedCommands, shouldContinueLoop } = await handleAgentActions(
        response,
        {
          rl,
          autoApprove: Boolean(options.autoApprove),
          autoSafeRead: true
        }
      );
      rl.close();

      if (shouldContinueLoop && executedCommands.length > 0 && loopRound < maxLoopRounds) {
        currentPromptToSend = formatExecutedCommandsFeedback(executedCommands, appliedFiles);
        loopRound++;
      } else {
        break;
      }
    }
  } catch (err) {
    if (spinner) spinner.fail(chalk.red(err.message));
    else console.error(chalk.red(`Error: ${err.message}`));
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

/**
 * Interactive REPL mode (with full Antigravity / AGY CLI + Docker + RPA capabilities)
 */
export async function startInteractiveRepl(options = {}) {
  printBanner();
  printWorkspaceFolderBox(process.cwd());
  console.log('');

  if (!hasSavedSession()) {
    console.log(
      chalk.yellow('\n⚠ Sesi login belum ditemukan. Mari login ke akun Microsoft 365 Anda terlebih dahulu.')
    );
    const loggedIn = await loginInteractive(options);
    if (!loggedIn) {
      console.log(chalk.red('Login dibatalkan. Jalankan `m365 login` kapan saja untuk mencoba lagi.'));
      return;
    }
  }

  const client = new M365CopilotClient({
    headless: !options.headed,
    url: options.url,
    browser: options.browser
  });

  const initSpinner = ora('Menyiapkan sesi Andi Pangeran M365 Copilot di latar belakang...').start();
  try {
    await client.connect((msg) => {
      initSpinner.text = msg;
    });
    initSpinner.succeed(
      chalk.green(
        `Terhubung ke Microsoft 365 Copilot! Folder kerja aktif (${formatShortPath(process.cwd())}) otomatis terbaca.`
      )
    );
  } catch (err) {
    initSpinner.fail(chalk.red(err.message));
    console.log(chalk.yellow('Ketik `/login` untuk autentikasi ulang atau `/exit` untuk keluar.\n'));
  }

  let lastResponse = '';
  let lastCommandOutput = '';
  let agentMode = Boolean(options.agent !== false); // Active by default like agy
  let autoApprove = Boolean(options.autoApprove);
  let activeMode = 'normal';
  const activeSchedules = [];

  const getPromptLabel = () => {
    const modeTag = activeMode !== 'normal' ? chalk.magenta.bold(`[/${activeMode}] `) : '';
    const agentTag = autoApprove ? chalk.red.bold('⚡auto ') : agentMode ? chalk.green('⚡ ') : '';
    const dirTag = chalk.blueBright(`[📁 ${formatShortPath(process.cwd())}] `);
    return `\n${agentTag}${modeTag}${dirTag}${chalk.cyan.bold('m365 ❯ ')}`;
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPromptLabel()
  });

  const refreshPrompt = () => {
    rl.setPrompt(getPromptLabel());
    rl.prompt();
  };

  const cleanupAndExit = async () => {
    for (const sch of activeSchedules) {
      clearInterval(sch.timer);
    }
    rl.close();
    const closeSpinner = ora('Menutup sesi browser M365...').start();
    await client.close();
    closeSpinner.succeed(chalk.gray('Sampai jumpa dari Andi Pangeran M365 CLI!'));
    process.exit(0);
  };

  rl.on('SIGINT', async () => {
    console.log('');
    await cleanupAndExit();
  });

  /**
   * Helper to send a prompt to Copilot and run the Autonomous Antigravity Agent Loop
   */
  const sendToCopilot = async (rawUserPrompt, modeOverride = null, extraOpts = {}) => {
    const chosenMode = modeOverride || activeMode || 'normal';
    const autoReadFolder =
      extraOpts.forceReadFolder || shouldAutoReadFolderContents(rawUserPrompt, process.cwd());
    if (autoReadFolder && agentMode) {
      const scan = scanFolderSummary(process.cwd());
      console.log(
        chalk.cyan(`📂 [Auto-Read Folder] Membaca folder kerja `) +
          chalk.green.bold(scan.dirPath) +
          chalk.gray(` (${scan.fileCount} file, ${scan.dirCount} sub-folder)`)
      );
    }
    const { finalPrompt, attachedFiles } = await buildAgyprompt(rawUserPrompt, chosenMode, {
      agent: agentMode,
      forceReadFolder: Boolean(extraOpts.forceReadFolder)
    });

    if (attachedFiles.length > 0) {
      console.log(
        chalk.cyan(`📎 Melampirkan ${attachedFiles.length} konteks file/folder lokal: `) +
          attachedFiles.map((f) => chalk.green(f.path)).join(', ')
      );
    }

    let currentPromptToSend = finalPrompt;
    let loopRound = 0;
    const maxLoopRounds = 4;
    let finalResponse = '';

    while (loopRound <= maxLoopRounds) {
      const modeBadge = chosenMode !== 'normal' ? `[/${chosenMode}] ` : '';
      const roundBadge = loopRound > 0 ? `[Agent Loop #${loopRound + 1}] ` : '';
      const spinner = ora({
        text: chalk.cyan(`${roundBadge}${modeBadge}Copilot sedang memproses...`),
        discardStdin: false
      }).start();

      try {
        const response = await client.ask(currentPromptToSend, {
          onUpdate: (fullText) => {
            const singleLine = fullText.replace(/\s+/g, ' ').slice(-55);
            spinner.text = `${chalk.cyan(`${roundBadge}${modeBadge}Copilot mengetik`)} (${fullText.length} char): ${chalk.gray(singleLine)}`;
          }
        });

        spinner.stop();

        if (!response) {
          console.log(
            chalk.yellow(
              '\n⚠ Tidak ada teks balasan yang terdeteksi. Coba gunakan `/screenshot` untuk melihat tampilan halaman.'
            )
          );
          break;
        }

        lastResponse = response;
        finalResponse = response;
        appendHistory({ prompt: rawUserPrompt, mode: chosenMode, response });
        console.log(
          chalk.magenta.bold(
            `\n╭─ 🐧 Copilot ${chosenMode !== 'normal' ? `(Mode /${chosenMode})` : ''}${loopRound > 0 ? ` [Iterasi Agent #${loopRound + 1}]` : ''}`
          )
        );
        console.log(renderMarkdown(response));

        if (!agentMode) break;

        const { appliedFiles, executedCommands, shouldContinueLoop } = await handleAgentActions(
          response,
          {
            rl,
            autoApprove,
            autoSafeRead: true
          }
        );

        if (shouldContinueLoop && executedCommands.length > 0 && loopRound < maxLoopRounds) {
          console.log(
            chalk.cyan(
              `\n🔄 [Antigravity Agent Loop] Mengirim hasil eksekusi (${executedCommands.length} perintah) kembali ke Copilot...`
            )
          );
          currentPromptToSend = formatExecutedCommandsFeedback(executedCommands, appliedFiles);
          loopRound++;
        } else {
          break;
        }
      } catch (err) {
        spinner.fail(chalk.red(`Gagal mengirim pesan: ${err.message}`));
        break;
      }
    }

    return finalResponse;
  };

  refreshPrompt();

  for await (const rawLine of rl) {
    const input = rawLine.trim();
    if (!input) {
      refreshPrompt();
      continue;
    }

    // 0. Direct exit/quit/keluar without slash (like claude / agy)
    if (['exit', 'quit', 'keluar'].includes(input.toLowerCase())) {
      await cleanupAndExit();
      return;
    }

    // 0b. Direct cd / pwd / ls / tree commands without slash or !
    if (/^(cd|pwd|ls|tree)(\s+.*)?$/i.test(input)) {
      const [rawVerb, ...verbArgs] = input.split(/\s+/);
      const verb = rawVerb.toLowerCase();
      const targetArg = verbArgs.join(' ').trim();

      if (verb === 'pwd') {
        printWorkspaceFolderBox(process.cwd(), { showTree: false });
        refreshPrompt();
        continue;
      }
      if (verb === 'cd') {
        try {
          const nextDir = resolveLinuxPath(targetArg || '~', process.cwd());
          if (!fs.existsSync(nextDir) || !fs.statSync(nextDir).isDirectory()) {
            console.log(chalk.red(`✖ Folder tidak ditemukan: ${nextDir}`));
          } else {
            process.chdir(nextDir);
            console.log(chalk.green(`✔ Pindah ke folder kerja baru: ${chalk.bold(nextDir)}\n`));
            printWorkspaceFolderBox(process.cwd(), { showTree: false });
          }
        } catch (err) {
          console.log(chalk.red(`✖ Gagal pindah folder: ${err.message}`));
        }
        refreshPrompt();
        continue;
      }
      if (verb === 'ls' && (!targetArg || !targetArg.startsWith('-'))) {
        const targetDir = resolveLinuxPath(targetArg || '.', process.cwd());
        printWorkspaceFolderBox(targetDir, { showTree: true });
        refreshPrompt();
        continue;
      }
      if (verb === 'tree' && (!targetArg || !targetArg.startsWith('-'))) {
        const targetDir = resolveLinuxPath(targetArg || '.', process.cwd());
        const scan = scanFolderSummary(targetDir, { maxDepth: 4, maxEntries: 200 });
        if (!scan.exists) {
          console.log(chalk.red(`✖ Folder tidak ditemukan: ${targetDir}`));
        } else {
          console.log(chalk.cyan.bold(`\n🌳 Pohon Direktori: ${scan.dirPath} (${scan.fileCount} file, ${scan.dirCount} sub-folder)`));
          console.log(chalk.white(scan.treeLines.join('\n') || '(kosong)'));
        }
        refreshPrompt();
        continue;
      }
    }

    // 1. Direct Shell Execution via `!<command>` (Antigravity / agy style)
    if (input.startsWith('!')) {
      const cmdStr = input.slice(1).trim();
      if (cmdStr) {
        const res = await executeLocalCommand(cmdStr);
        lastCommandOutput = res.output;
      }
      refreshPrompt();
      continue;
    }

    // 1b. Direct Linux Folder or File Path Input (e.g. `/home/andi/script/test14`, `./docs`, `~/script/test18`)
    const detectedPath = detectLinuxPathInput(input, process.cwd());
    if (detectedPath) {
      if (detectedPath.isDirectory) {
        if (!detectedPath.restPrompt) {
          // User entered ONLY a folder path -> switch workspace to that folder & display its contents!
          try {
            process.chdir(detectedPath.resolvedPath);
            console.log(
              chalk.green(
                `\n✔ Folder berhasil dimuat ke M365 CLI: ${chalk.bold(detectedPath.resolvedPath)}`
              )
            );
            printWorkspaceFolderBox(process.cwd(), { showTree: true });
          } catch (err) {
            console.log(chalk.red(`✖ Gagal membaca folder: ${err.message}`));
          }
          refreshPrompt();
          continue;
        } else {
          // User entered `<folder_path> <instruksi>` -> switch/add folder and send prompt to Copilot
          try {
            process.chdir(detectedPath.resolvedPath);
            console.log(
              chalk.green(
                `📂 Folder aktif diatur ke: ${chalk.bold(detectedPath.resolvedPath)}`
              )
            );
          } catch {
            // ignore chdir error
          }
          await sendToCopilot(
            `${detectedPath.restPrompt}\n\n(Fokus pada folder lokal: @${detectedPath.resolvedPath})`,
            null,
            { forceReadFolder: true }
          );
          refreshPrompt();
          continue;
        }
      } else if (detectedPath.isFile) {
        const filePrompt = detectedPath.restPrompt
          ? `${detectedPath.restPrompt} (File: @${detectedPath.resolvedPath})`
          : `Baca dan jelaskan isi file @${detectedPath.resolvedPath} secara lengkap.`;
        await sendToCopilot(filePrompt);
        refreshPrompt();
        continue;
      }
    }

    // 2. Handle Slash Commands
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.split(/\s+/);
      const command = cmd.toLowerCase();
      const restText = args.join(' ').trim();

      switch (command) {
        case '/help':
        case '/h':
          printReplHelp();
          break;

        case '/exit':
        case '/quit':
        case '/q':
          await cleanupAndExit();
          return;

        case '/new':
        case '/clear':
        case '/reset': {
          const sp = ora('Memulai percakapan baru di M365 Copilot...').start();
          try {
            console.clear();
            printBanner();
            printWorkspaceFolderBox(process.cwd());
            activeMode = 'normal';
            await client.newChat();
            sp.succeed(chalk.green('Percakapan baru dimulai!'));
          } catch (err) {
            sp.fail(chalk.red(`Gagal mereset chat: ${err.message}`));
          }
          break;
        }

        // --- FOLDER & WORKSPACE READER COMMANDS (AGY / CLAUDE STYLE) ---

        case '/dir':
        case '/folder':
        case '/cd':
        case '/cwd':
        case '/pwd': {
          if (restText && command !== '/pwd') {
            const targetDir = resolveLinuxPath(restText, process.cwd());
            if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
              console.log(chalk.red(`✖ Folder tidak ditemukan atau bukan direktori: ${targetDir}`));
              break;
            }
            process.chdir(targetDir);
            console.log(chalk.green(`✔ Folder kerja aktif dipindahkan ke: ${chalk.bold(targetDir)}\n`));
          }
          printWorkspaceFolderBox(process.cwd(), { showTree: true });
          break;
        }

        case '/add-dir': {
          if (!restText) {
            console.log(chalk.yellow('Penggunaan: /add-dir <path_folder> (contoh: /add-dir /home/andi/script/test18)'));
            break;
          }
          try {
            const added = addWorkspaceDirectory(restText, process.cwd());
            console.log(chalk.green(`✔ Folder tambahan berhasil dimasukkan ke workspace: ${chalk.bold(added)}\n`));
            printWorkspaceFolderBox(added, {
              title: `📂 Isi Folder Tambahan (${formatShortPath(added)})`,
              showTree: true
            });
          } catch (err) {
            console.log(chalk.red(`✖ ${err.message}`));
          }
          break;
        }

        case '/ls':
        case '/files': {
          const targetDir = resolveLinuxPath(restText || '.', process.cwd());
          if (!fs.existsSync(targetDir)) {
            console.log(chalk.red(`✖ Path tidak ditemukan: ${targetDir}`));
            break;
          }
          printWorkspaceFolderBox(targetDir, { showTree: true });
          break;
        }

        case '/tree': {
          const targetDir = resolveLinuxPath(restText || '.', process.cwd());
          const scan = scanFolderSummary(targetDir, { maxDepth: 4, maxEntries: 200 });
          if (!scan.exists) {
            console.log(chalk.red(`✖ Folder tidak ditemukan: ${targetDir}`));
            break;
          }
          console.log(
            chalk.cyan.bold(
              `\n🌳 Struktur Pohon Folder: ${scan.dirPath} (${scan.fileCount} file, ${scan.dirCount} sub-folder)`
            )
          );
          console.log(chalk.white(scan.treeLines.join('\n') || '(folder kosong)'));
          break;
        }

        case '/read':
        case '/cat':
        case '/baca': {
          if (!restText) {
            // If no path provided, read current folder and ask Copilot to summarize it
            printWorkspaceFolderBox(process.cwd(), { showTree: true });
            await sendToCopilot(
              `Baca dan jelaskan seluruh struktur folder serta isi file utama yang ada di folder kerja saat ini (${process.cwd()}).`,
              null,
              { forceReadFolder: true }
            );
            break;
          }
          const [targetToken, ...questionWords] = args;
          const resolvedTarget = resolveLinuxPath(targetToken, process.cwd());
          if (!fs.existsSync(resolvedTarget)) {
            console.log(chalk.red(`✖ File atau folder tidak ditemukan: ${resolvedTarget}`));
            break;
          }
          const extraQ = questionWords.join(' ').trim();
          const stat = fs.statSync(resolvedTarget);
          if (stat.isDirectory()) {
            const deep = readFolderFilesContent(resolvedTarget);
            console.log(
              chalk.green(
                `📂 Berhasil membaca folder ${resolvedTarget}: ${deep.scan.fileCount} file ditemukan (${deep.filesRead.length} file teks utama dimuat).`
              )
            );
            const promptToSend =
              extraQ ||
              `Analisa dan jelaskan isi folder lokal \`${resolvedTarget}\` beserta fungsi dari file-file di dalamnya.`;
            await sendToCopilot(`${promptToSend}\n\n@${resolvedTarget}`, null, {
              forceReadFolder: true
            });
          } else {
            const content = fs.readFileSync(resolvedTarget, 'utf8');
            console.log(
              chalk.green(
                `📄 Berhasil membaca file ${resolvedTarget} (${content.length} karakter).`
              )
            );
            const promptToSend =
              extraQ || `Analisa dan jelaskan isi file lokal \`${resolvedTarget}\` berikut.`;
            await sendToCopilot(`${promptToSend}\n\n@${resolvedTarget}`);
          }
          break;
        }

        // --- DOCKER & RPA COMMANDS (ANTIGRAVITY STYLE) ---

        case '/rpa': {
          const sub = (args[0] || 'status').toLowerCase();
          const subArgs = args.slice(1);
          const subText = subArgs.join(' ').trim();

          try {
            if (sub === 'status' || sub === 'info') {
              await printRpaDockerStatus();
            } else if (sub === 'tabs') {
              const tabs = await rpaListTabs();
              console.log(chalk.cyan.bold(`\n🌏 Open Tabs di Browser RPA (${DEFAULT_CDP_URL}):`));
              tabs.forEach((t) => {
                console.log(`  [${chalk.yellow(t.index)}] ${chalk.bold(t.title)} -> ${chalk.green(t.url)}`);
              });
            } else if (sub === 'content' || sub === 'read') {
              const sp = ora('Membaca konten layar Browser RPA Docker...').start();
              const data = await rpaGetContent(subText || null);
              sp.succeed(chalk.green(`Tab [${data.tabIndex}]: ${data.title} (${data.url})`));
              console.log(chalk.white(data.text.slice(0, 4000)));
              if (data.interactiveElements.length > 0) {
                console.log(chalk.cyan.bold(`\nElemen Interaktif (${data.interactiveElements.length}):`));
                data.interactiveElements.slice(0, 25).forEach((el) => {
                  console.log(`  - [${el.tag.toUpperCase()}] ${el.text}`);
                });
              }
            } else if (sub === 'screenshot' || sub === 'ss') {
              const outFile = subArgs[0] || 'rpa-screenshot.png';
              const res = await rpaScreenshot(outFile);
              console.log(chalk.green(`✔ Screenshot Browser RPA disimpan ke: ${res.path} (${res.url})`));
            } else if (sub === 'click') {
              if (!subText) {
                console.log(chalk.yellow('Penggunaan: /rpa click <teks atau selector>'));
                break;
              }
              const cleanSelector = subText.replace(/--by-text/gi, '').trim().replace(/^["']|["']$/g, '');
              const byText = subText.includes('--by-text');
              const sp = ora(`Mengklik "${cleanSelector}" di Browser RPA...`).start();
              const res = await rpaClick(cleanSelector, { byText });
              sp.succeed(chalk.green(`Berhasil klik! URL aktif sekarang: ${res.url} (${res.title})`));
            } else if (sub === 'type' || sub === 'fill') {
              const selector = subArgs[0];
              const textToType = subArgs.slice(1).join(' ');
              if (!selector || !textToType) {
                console.log(chalk.yellow('Penggunaan: /rpa type <selector> <teks>'));
                break;
              }
              const res = await rpaType(selector, textToType);
              console.log(chalk.green(`✔ Berhasil mengetik ke ${selector} di ${res.url}`));
            } else if (sub === 'goto' || sub === 'open') {
              if (!subText) {
                console.log(chalk.yellow('Penggunaan: /rpa goto <url>'));
                break;
              }
              const sp = ora(`Membuka ${subText} di Browser RPA...`).start();
              const res = await rpaGoto(subText);
              sp.succeed(chalk.green(`Sekarang di: ${res.title} (${res.url})`));
            } else if (sub === 'eval' || sub === 'js') {
              if (!subText) {
                console.log(chalk.yellow('Penggunaan: /rpa eval <ekspresi_js>'));
                break;
              }
              const res = await rpaEval(subText);
              console.log(chalk.green('Result:'), res.result);
            } else {
              // Treat `/rpa ask <prompt>` or `/rpa <prompt>` as asking Copilot with live RPA content
              const question = sub === 'ask' ? subText : restText;
              const userQ =
                question ||
                'Analisa tampilan layar Browser RPA saat ini, jelaskan apa yang sedang tampil, dan berikan langkah atau aksi RPA berikutnya.';
              await sendToCopilot(userQ);
            }
          } catch (err) {
            console.log(chalk.red(`✖ RPA Error: ${err.message}`));
          }
          break;
        }

        case '/docker': {
          const dockerCmd = restText ? `docker ${restText}` : 'docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"';
          const res = await executeLocalCommand(dockerCmd);
          lastCommandOutput = res.output;
          break;
        }

        // --- ANTIGRAVITY SLASH COMMANDS ---

        case '/plan': {
          if (!restText) {
            activeMode = activeMode === 'plan' ? 'normal' : 'plan';
            console.log(
              chalk.cyan(
                `📐 Mode /plan sekarang: ${chalk.bold(activeMode === 'plan' ? 'AKTIF' : 'NONAKTIF')}. Ketik tugas Anda untuk membuat rencana arsitektur.`
              )
            );
          } else {
            await sendToCopilot(restText, 'plan');
          }
          break;
        }

        case '/boost': {
          if (!restText) {
            activeMode = activeMode === 'boost' ? 'normal' : 'boost';
            console.log(
              chalk.cyan(
                `🚀 Mode /boost (Deep Thinking & Rigorous Verification) sekarang: ${chalk.bold(activeMode === 'boost' ? 'AKTIF' : 'NONAKTIF')}.`
              )
            );
          } else {
            await sendToCopilot(restText, 'boost');
          }
          break;
        }

        case '/grill-me':
        case '/grill': {
          if (!restText) {
            activeMode = activeMode === 'grill-me' ? 'normal' : 'grill-me';
            console.log(
              chalk.cyan(
                `🔥 Mode /grill-me (Interactive Design Interview) sekarang: ${chalk.bold(activeMode === 'grill-me' ? 'AKTIF' : 'NONAKTIF')}.`
              )
            );
          } else {
            await sendToCopilot(restText, 'grill-me');
          }
          break;
        }

        case '/teamwork':
        case '/team': {
          if (!restText) {
            activeMode = activeMode === 'teamwork' ? 'normal' : 'teamwork';
            console.log(
              chalk.cyan(
                `🤝 Mode /teamwork (Multi-Agent Collaboration) sekarang: ${chalk.bold(activeMode === 'teamwork' ? 'AKTIF' : 'NONAKTIF')}.`
              )
            );
          } else {
            await sendToCopilot(restText, 'teamwork');
          }
          break;
        }

        case '/goal': {
          if (!restText) {
            console.log(chalk.yellow('Penggunaan: /goal <deskripsi target otonom yang ingin dicapai>'));
            break;
          }
          console.log(chalk.cyan.bold(`\n🎯 Memulai Antigravity Autonomous Goal: "${restText}"`));
          let step = 1;
          const maxSteps = 4;
          let currentGoalPrompt = `Target Utama (/goal): ${restText}\nMulai Langkah 1: Periksa konteks lokal/Docker/RPA yang sudah tersedia, buat rencana singkat, dan langsung berikan implementasi kode/aksi pertama.`;

          while (step <= maxSteps) {
            console.log(chalk.magenta.bold(`\n─── [Goal Step ${step}/${maxSteps}] ───`));
            const resp = await sendToCopilot(currentGoalPrompt, 'goal');
            if (!resp || resp.includes('[GOAL_COMPLETE]')) {
              console.log(chalk.green.bold('\n✔ Target /goal selesai dicapai!'));
              break;
            }
            if (step < maxSteps) {
              const nextAns = await new Promise((resolve) =>
                rl.question(
                  chalk.yellow(`\n❯ Lanjutkan iterasi /goal ke Langkah ${step + 1}? [Y/n/instruksi tambahan]: `),
                  resolve
                )
              );
              const trimmed = (nextAns || '').trim();
              if (trimmed.toLowerCase() === 'n' || trimmed.toLowerCase() === 'no') {
                console.log(chalk.gray('Iterasi /goal dihentikan oleh pengguna.'));
                break;
              }
              currentGoalPrompt =
                trimmed && trimmed.toLowerCase() !== 'y'
                  ? `Lanjutkan pencapaian target "${restText}" dengan masukan tambahan: ${trimmed}`
                  : `Lanjutkan ke langkah berikutnya untuk menyelesaikan target "${restText}". Verifikasi apa yang kurang, sempurnakan, dan akhiri dengan [GOAL_COMPLETE] jika sudah tuntas.`;
            }
            step++;
          }
          break;
        }

        case '/compact': {
          console.log(chalk.cyan('📦 Memadatkan konteks percakapan (/compact)...'));
          const summary = await sendToCopilot(
            'Buat ringkasan padat (compact summary) dari seluruh diskusi, kode, dan keputusan kita sejauh ini agar dapat diteruskan ke sesi baru.',
            'compact'
          );
          if (summary) {
            const sp = ora('Mereset sesi chat dan menyuntikkan konteks yang sudah dipadatkan...').start();
            try {
              await client.newChat();
              await client.ask(
                `Berikut adalah ringkasan konteks percakapan kita sebelumnya (/compact):\n\n${summary}\n\nKonfirmasi singkat bahwa Anda siap melanjutkan.`
              );
              sp.succeed(chalk.green('Konteks berhasil dipadatkan (/compact) pada sesi chat baru!'));
            } catch (err) {
              sp.fail(chalk.red(`Gagal mereset chat setelah compact: ${err.message}`));
            }
          }
          break;
        }

        case '/learn': {
          if (!restText) {
            const rules = loadLearnedRules();
            console.log(chalk.cyan.bold(`\n🧠 Memori & Aturan (/learn) — ${RULES_FILE}:`));
            if (!rules) {
              console.log(
                chalk.gray(
                  '  Belum ada aturan yang disimpan. Gunakan `/learn <aturan>` untuk menyimpan preferensi permanen.'
                )
              );
            } else {
              console.log(renderMarkdown(rules));
            }
          } else if (restText.toLowerCase() === 'clear') {
            clearLearnedRules();
            console.log(chalk.green('✔ Seluruh memori /learn berhasil dihapus.'));
          } else {
            const savedTo = addLearnedRule(restText);
            console.log(chalk.green(`✔ Aturan baru disimpan ke memori permanen (${savedTo}):`));
            console.log(chalk.white(`  "${restText}"`));
          }
          break;
        }

        case '/browser': {
          const [targetUrl, ...questionWords] = args;
          if (!targetUrl) {
            console.log(chalk.yellow('Penggunaan: /browser <url> [instruksi analisa]'));
            break;
          }
          const sp = ora(`🌐 Membuka dan mengekstrak halaman ${targetUrl} via Playwright...`).start();
          try {
            const pageData = await client.browseUrl(targetUrl);
            sp.succeed(chalk.green(`Berhasil membaca halaman: "${pageData.title}" (${pageData.url})`));
            const userQuestion =
              questionWords.join(' ').trim() || 'Ringkas dan jelaskan isi utama dari halaman web ini.';
            const browserPrompt = `${userQuestion}\n\n---\n**[Konten Halaman Web dari /browser]**\nJudul: ${pageData.title}\nURL: ${pageData.url}\n\n\`\`\`text\n${pageData.text}\n\`\`\``;
            await sendToCopilot(browserPrompt);
          } catch (err) {
            sp.fail(chalk.red(`Gagal membuka URL ${targetUrl}: ${err.message}`));
          }
          break;
        }

        case '/schedule': {
          if (!restText || restText.toLowerCase() === 'list') {
            if (activeSchedules.length === 0) {
              console.log(
                chalk.gray(
                  'Belum ada jadwal aktif. Contoh penggunaan: `/schedule 5m Cek status penggunaan memori dan analisa`'
                )
              );
            } else {
              console.log(chalk.cyan.bold('\n⏰ Daftar Jadwal (/schedule) Aktif:'));
              activeSchedules.forEach((s) => {
                console.log(
                  `  #${s.id} [setiap ${s.intervalStr}] — "${s.prompt}" (dijalankan ${s.runs}x)`
                );
              });
              console.log(chalk.gray('  Ketik `/schedule clear` untuk menghentikan semua jadwal.'));
            }
            break;
          }
          if (restText.toLowerCase() === 'clear' || restText.toLowerCase() === 'stop') {
            activeSchedules.forEach((s) => clearInterval(s.timer));
            activeSchedules.length = 0;
            console.log(chalk.green('✔ Semua jadwal (/schedule) telah dihentikan.'));
            break;
          }
          const [intervalStr, ...schedPromptWords] = args;
          const ms = parseDurationMs(intervalStr);
          const schedPrompt = schedPromptWords.join(' ').trim();
          if (!ms || ms < 5000 || !schedPrompt) {
            console.log(
              chalk.yellow(
                'Format: /schedule <durasi: 30s|5m|1h> <prompt> (minimal 5s). Contoh: `/schedule 10m Ringkas log error`'
              )
            );
            break;
          }
          const id = activeSchedules.length + 1;
          const schedEntry = {
            id,
            intervalStr,
            prompt: schedPrompt,
            runs: 0,
            timer: setInterval(async () => {
              schedEntry.runs++;
              console.log(
                chalk.cyan.bold(`\n⏰ [Schedule #${id} Trigger #${schedEntry.runs}]: ${schedPrompt}`)
              );
              await sendToCopilot(schedPrompt);
              refreshPrompt();
            }, ms)
          };
          activeSchedules.push(schedEntry);
          console.log(
            chalk.green(
              `✔ Jadwal #${id} aktif setiap ${intervalStr}: "${schedPrompt}" (Ketik \`/schedule clear\` untuk berhenti)`
            )
          );
          break;
        }

        case '/skills': {
          const skills = listSkills();
          console.log(chalk.cyan.bold(`\n🧩 Daftar Skills (${SKILLS_DIR}):`));
          if (skills.length === 0) {
            console.log(
              chalk.gray(
                `  Belum ada custom skill. Anda bisa menambahkan file .md di ${SKILLS_DIR} atau .m365/skills/`
              )
            );
          } else {
            skills.forEach((s, i) => {
              console.log(`  ${i + 1}. ${chalk.green.bold(s.name)} (${s.scope}) -> ${chalk.gray(s.path)}`);
            });
          }
          break;
        }

        case '/run': {
          if (!restText) {
            console.log(chalk.yellow('Penggunaan: /run <perintah_linux> (atau gunakan !<perintah_linux>)'));
            break;
          }
          const res = await executeLocalCommand(restText);
          lastCommandOutput = res.output;
          const askSend = await new Promise((resolve) =>
            rl.question(chalk.yellow('  ❯ Kirim output perintah ini ke Copilot untuk dianalisa? [Y/n]: '), resolve)
          );
          const ans = (askSend || '').trim().toLowerCase();
          if (ans === '' || ans === 'y' || ans === 'yes') {
            await sendToCopilot(
              `Analisa hasil eksekusi perintah \`${restText}\` berikut:\n\n\`\`\`text\n${lastCommandOutput}\n\`\`\``
            );
          }
          break;
        }

        case '/apply': {
          if (!lastResponse) {
            console.log(chalk.yellow('Belum ada respons Copilot untuk diterapkan.'));
            break;
          }
          const { files, bashCommands, allBlocks } = extractActionBlocks(lastResponse);
          if (files.length > 0 || bashCommands.length > 0) {
            await handleAgentActions(lastResponse, {
              rl,
              autoApprove: restText.toLowerCase() === 'all' || autoApprove
            });
          } else if (allBlocks.length > 0 && restText && restText.toLowerCase() !== 'all') {
            const targetFile = path.resolve(process.cwd(), restText);
            fs.mkdirSync(path.dirname(targetFile), { recursive: true });
            fs.writeFileSync(targetFile, allBlocks[0].code + '\n', 'utf8');
            console.log(chalk.green(`✔ Blok kode disimpan ke: ${targetFile}`));
          } else {
            console.log(
              chalk.yellow(
                'Tidak ditemukan nama file otomatis di blok kode terakhir. Gunakan `/apply <nama_file>` untuk menyimpan blok kode pertama.'
              )
            );
          }
          break;
        }

        case '/agent': {
          const arg = restText.toLowerCase();
          if (arg === 'on') {
            agentMode = true;
            autoApprove = false;
          } else if (arg === 'off') {
            agentMode = false;
            autoApprove = false;
          } else if (arg === 'auto') {
            agentMode = true;
            autoApprove = true;
          } else {
            agentMode = !agentMode;
          }
          console.log(
            chalk.cyan(
              `🛠️  Mode Antigravity Agent: ${
                autoApprove
                  ? chalk.red.bold('AUTO-APPROVE (Otomatis simpan file & jalankan perintah)')
                  : agentMode
                    ? chalk.green.bold('ON (Auto-Inspect Docker/RPA + Konfirmasi interaktif)')
                    : chalk.gray('OFF')
              }`
            )
          );
          break;
        }

        case '/status':
          await printStatus({ verify: false });
          await printRpaDockerStatus();
          console.log(
            `Mode Agent         : ${
              autoApprove
                ? chalk.red.bold('AUTO-APPROVE')
                : agentMode
                  ? chalk.green('AKTIF (Interaktif + Auto-Inspect Docker/RPA)')
                  : chalk.gray('NONAKTIF')
            }`
          );
          console.log(`Mode Slash Aktif   : ${chalk.magenta(activeMode)}`);
          console.log(`Jadwal (/schedule) : ${chalk.yellow(activeSchedules.length)} aktif`);
          break;

        case '/login': {
          await client.close();
          await loginInteractive(options);
          const sp = ora('Menghubungkan kembali ke M365 Copilot...').start();
          try {
            await client.connect((msg) => {
              sp.text = msg;
            });
            sp.succeed(chalk.green('Terhubung kembali ke M365 Copilot!'));
          } catch (err) {
            sp.fail(chalk.red(err.message));
          }
          break;
        }

        case '/logout':
          await client.close();
          logoutSession();
          break;

        case '/screenshot': {
          const targetFile = args[0] || `m365-screenshot-${Date.now()}.png`;
          try {
            const savedPath = await client.screenshot(targetFile);
            console.log(chalk.green(`✔ Screenshot disimpan ke: ${savedPath}`));
          } catch (err) {
            console.log(chalk.red(`✖ Gagal mengambil screenshot: ${err.message}`));
          }
          break;
        }

        case '/save': {
          const targetFile = args[0] || `copilot-response-${Date.now()}.md`;
          if (!lastResponse) {
            console.log(chalk.yellow('Belum ada respons Copilot untuk disimpan.'));
          } else {
            fs.writeFileSync(targetFile, lastResponse, 'utf8');
            console.log(chalk.green(`✔ Respons terakhir disimpan ke: ${targetFile}`));
          }
          break;
        }

        case '/history': {
          const hist = getHistory().slice(-10);
          if (hist.length === 0) {
            console.log(chalk.gray('Belum ada riwayat percakapan.'));
          } else {
            console.log(chalk.cyan.bold('\n📜 10 Riwayat Terakhir:'));
            hist.forEach((item, idx) => {
              const modeTag = item.mode && item.mode !== 'normal' ? `[/${item.mode}] ` : '';
              console.log(
                `${chalk.gray(`${idx + 1}. [${item.timestamp}]`)} ${chalk.magenta(modeTag)}${chalk.white.bold(item.prompt.slice(0, 80))}`
              );
            });
          }
          break;
        }

        default:
          console.log(
            chalk.yellow(`Perintah tidak dikenal: ${command}. Ketik ${chalk.bold('/help')} untuk daftar perintah Antigravity.`)
          );
          break;
      }

      refreshPrompt();
      continue;
    }

    // 3. Regular Prompt (with @file context expansion, live Docker+RPA context & Autonomous Agent Loop)
    await sendToCopilot(input);
    refreshPrompt();
  }
}
