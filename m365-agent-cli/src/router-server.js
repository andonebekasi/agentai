import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { M365CopilotClient } from './browser-client.js';
import { hasSavedSession, CONFIG_DIR } from './config.js';
import { buildAgyprompt, handleAgentActions, isWorkspaceOrTechnicalQuery } from './agy-features.js';
import { isCopilotRefusal } from './dom-helpers.js';
import { rpaListTabs, DEFAULT_CDP_URL } from './rpa-docker.js';
import { startCloudflareTunnel } from './remote-login-server.js';

const execAsync = promisify(exec);

export const DEFAULT_ROUTER_PORT = Number(process.env.M365_ROUTER_PORT || 5365);

export const ROUTER_MODELS = [
  {
    id: 'm365',
    object: 'model',
    owned_by: 'microsoft-365-copilot',
    description: 'M365 Copilot Standard + Antigravity Local/Docker/RPA Context',
    mode: 'normal',
    agent: true,
    autoApprove: false
  },
  {
    id: 'm365-agent',
    object: 'model',
    owned_by: 'microsoft-365-copilot',
    description: 'M365 Copilot Autonomous Agent (Auto-Execute Safe Bash, Docker & RPA)',
    mode: 'normal',
    agent: true,
    autoApprove: true
  },
  {
    id: 'm365-rpa',
    object: 'model',
    owned_by: 'microsoft-365-copilot',
    description: 'M365 Copilot Browser RPA & Docker Specialist (CDP Port 9222)',
    mode: 'normal',
    agent: true,
    autoApprove: true,
    forceRpa: true
  },
  {
    id: 'm365-plan',
    object: 'model',
    owned_by: 'microsoft-365-copilot',
    description: 'M365 Copilot Antigravity /plan Mode (Step-by-Step Architect)',
    mode: 'plan',
    agent: true,
    autoApprove: false
  },
  {
    id: 'm365-boost',
    object: 'model',
    owned_by: 'microsoft-365-copilot',
    description: 'M365 Copilot Antigravity /boost Mode (Deep Thinking & Verification)',
    mode: 'boost',
    agent: true,
    autoApprove: false
  },
  {
    id: 'm365-goal',
    object: 'model',
    owned_by: 'microsoft-365-copilot',
    description: 'M365 Copilot Antigravity /goal Mode (Autonomous Goal Execution)',
    mode: 'goal',
    agent: true,
    autoApprove: true
  },
  {
    id: 'm365-teamwork',
    object: 'model',
    owned_by: 'microsoft-365-copilot',
    description: 'M365 Copilot Antigravity /teamwork Mode (Multi-Agent Collaboration)',
    mode: 'teamwork',
    agent: true,
    autoApprove: false
  }
];

function getLocalLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

function extractTextFromMessageContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.input_text === 'string') return part.input_text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }
  return String(content);
}

/**
 * Handle Hermes built-in quick commands (/help, /menu, /info, /cpu) for zero-latency response
 */
async function tryHandleHermesQuickCommand(userPrompt) {
  const clean = (userPrompt || '').trim().toLowerCase();
  if (['/info', '/help', '/menu'].includes(clean)) {
    const helpScript = '/home/andi/script/hermes_scripts/show_help.sh';
    if (fs.existsSync(helpScript)) {
      try {
        const { stdout } = await execAsync(`bash "${helpScript}"`, { timeout: 10000 });
        if (stdout && stdout.trim()) return stdout.trim();
      } catch {
        // fallback to Copilot
      }
    }
  }
  if (clean === '/cpu') {
    const cpuScript = '/home/andi/script/test2/tarik_data_cpu.sh';
    const reportPath = '/home/andi/script/test2/info/analisis_lonjakan_cpu_prod.txt';
    if (fs.existsSync(cpuScript)) {
      try {
        await execAsync(`bash "${cpuScript}"`, { timeout: 60000 });
        if (fs.existsSync(reportPath)) {
          return fs.readFileSync(reportPath, 'utf8');
        }
      } catch (err) {
        return `❌ Error saat menjalankan penarikan data CPU: ${err.message}`;
      }
    }
  }
  if (
    clean === '/bill' ||
    clean.startsWith('/bill ') ||
    ['/billoci', '/ocibill', '/harpaoci', '/saldooci'].includes(clean)
  ) {
    const billScript = '/home/andi/script/hermes_scripts/get_bill.sh';
    const argsStr = clean.startsWith('/bill ') ? (userPrompt || '').trim().slice(6).trim() : '';
    const safeArgs = argsStr.replace(/[^a-zA-Z0-9_.\-\s]/g, '');
    if (fs.existsSync(billScript)) {
      try {
        const { stdout } = await execAsync(`bash "${billScript}" ${safeArgs}`, { timeout: 60000 });
        if (stdout && stdout.trim()) return stdout.trim();
      } catch (err) {
        return `❌ Error saat mengambil data billing: ${err.message}`;
      }
    }
  }
  return null;
}

/**
 * Strip Hermes Gateway `[System Note: Real-time Internet Search Results ...]` wrapper
 * so M365 Copilot's prompt-injection & safety filter is not falsely triggered.
 */
function stripHermesSystemNotes(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { cleanText: '', searchContext: '' };
  }
  let text = rawText.trim();
  let searchContext = '';

  // Match Hermes gateway auto-search note:
  // [System Note: Real-time Internet Search Results for '...':\n...\nPlease use these search results to answer the user's query if relevant.]\n\n
  const searchNoteRx =
    /^\[System Note:\s*Real-time Internet Search Results for '([\s\S]*?)':\s*\n([\s\S]*?)\nPlease use these search results to answer the user's query if relevant\.\]\s*\n*/i;
  const match = text.match(searchNoteRx);
  if (match) {
    searchContext = (match[2] || '').trim();
    text = text.slice(match[0].length).trim();
    if (!text && match[1]) {
      text = match[1].trim();
    }
  }

  // Also strip Hermes model-switch note if prepended
  text = text
    .replace(/^\[Note:\s*model was just switched[^\]]*\]\s*\n*/i, '')
    .trim();

  return { cleanText: text, searchContext };
}

function isErrorOrRefusalMessage(text) {
  if (!text) return true;
  if (isCopilotRefusal(text)) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('maaf, m365 copilot tidak mengembalikan respons teks') ||
    lower.includes('(no response from remote agent)') ||
    lower.includes('⚠️ proxy')
  );
}

/**
 * Build prompt from OpenAI messages array (preserving clean recent conversation context if needed)
 */
function extractPromptFromMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  // Find the last user message
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) {
    const rawLast = extractTextFromMessageContent(messages[messages.length - 1]?.content);
    return stripHermesSystemNotes(rawLast).cleanText;
  }

  const rawLatestUser = extractTextFromMessageContent(messages[lastUserIdx].content).trim();
  const { cleanText: latestUserText } = stripHermesSystemNotes(rawLatestUser);

  // If it's a quick slash command like /help or /cpu, return as-is
  if (latestUserText.startsWith('/')) {
    return latestUserText;
  }

  // Filter recent conversation turns (last 4 messages before the latest user message, excluding errors/refusals)
  const historySlice = [];
  let lastUnansweredUserQuestion = '';

  const recentMsgs = messages.slice(Math.max(0, lastUserIdx - 6), lastUserIdx);
  for (let i = 0; i < recentMsgs.length; i++) {
    const m = recentMsgs[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const rawTxt = extractTextFromMessageContent(m.content).trim();
    const { cleanText: txt } = stripHermesSystemNotes(rawTxt);
    if (!txt) continue;

    if (m.role === 'assistant' && isErrorOrRefusalMessage(txt)) {
      continue;
    }

    if (m.role === 'user') {
      lastUnansweredUserQuestion = txt;
    } else if (m.role === 'assistant') {
      lastUnansweredUserQuestion = '';
    }

    const roleLabel = m.role === 'user' ? 'User' : 'Assistant';
    historySlice.push(`${roleLabel}: ${txt.slice(0, 800)}`);
  }

  // If the user sends a short follow-up like "sebutkan ini", "jelaskan ini", "coba lagi", "ulangi"
  // after a previous question that failed/had no valid answer, combine with the previous question directly
  const isShortFollowUp =
    /^(sebutkan|jelaskan|jawab|ulangi|coba|lanjutkan|apa|bagaimana)(\s+(ini|itu|lagi|dong|ya|tersebut))?[.?!]*$/i.test(
      latestUserText
    );
  if (isShortFollowUp && lastUnansweredUserQuestion && lastUnansweredUserQuestion !== latestUserText) {
    return `${lastUnansweredUserQuestion} (${latestUserText})`;
  }

  const trimmedHistory = historySlice.slice(-4);
  if (trimmedHistory.length === 0) {
    return latestUserText;
  }

  return `${latestUserText}\n\n---\n[Konteks Percakapan Sebelumnya]:\n${trimmedHistory.join('\n')}`;
}

/**
 * 9Router-style Dashboard HTML
 */
function renderRouterDashboardHtml({ port, lanIp, tunnelUrl, stats, logs, isConnected }) {
  const baseUrl = `http://${lanIp}:${port}`;
  const v1Url = `${baseUrl}/v1`;
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>M365 9Router — Andi Pangeran AI Gateway & Hermes Brain</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: #131b2e;
      --border: #23304d;
      --accent: #38bdf8;
      --accent2: #a855f7;
      --success: #22c55e;
      --warn: #f59e0b;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 1180px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #131b2e 0%, #1e1b4b 100%);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 20px;
    }
    .title h1 { font-size: 22px; font-weight: 700; color: #fff; }
    .title p { font-size: 13px; color: var(--muted); margin-top: 4px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      background: rgba(34, 197, 94, 0.15);
      color: var(--success);
      border: 1px solid rgba(34, 197, 94, 0.35);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
    }
    .card h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 8px; }
    .card .val { font-size: 20px; font-weight: 700; color: var(--accent); word-break: break-all; }
    .card .sub { font-size: 12px; color: var(--muted); margin-top: 6px; }
    code {
      background: #090d16;
      color: #38bdf8;
      padding: 3px 7px;
      border-radius: 6px;
      font-size: 12.5px;
      font-family: monospace;
    }
    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .section h2 { font-size: 16px; margin-bottom: 14px; color: #fff; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-weight: 600; }
    .playground { display: flex; gap: 10px; margin-top: 12px; }
    .playground input, .playground select {
      background: #090d16;
      border: 1px solid var(--border);
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
    }
    .playground input { flex: 1; }
    .btn {
      background: var(--accent);
      color: #0b0f19;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-secondary {
      background: #334155;
      color: #fff;
    }
    pre#replyBox {
      margin-top: 14px;
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      font-size: 13px;
      white-space: pre-wrap;
      max-height: 360px;
      overflow-y: auto;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">
        <h1>⚡ Andi Pangeran M365 9Router Gateway</h1>
        <p>OpenAI / Anthropic / Hermes Compatible AI Router • Terhubung ke M365 Copilot + Docker + Browser RPA</p>
      </div>
      <div>
        <span class="badge">● ${isConnected ? 'M365 Engine Ready' : 'Standby (Auto-Connect)'}</span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>OpenAI Base URL (Hermes)</h3>
        <div class="val">http://localhost:${port}/v1</div>
        <div class="sub">LAN: <code>${v1Url}</code></div>
      </div>
      <div class="card">
        <h3>Perintah Aktifkan di Hermes</h3>
        <div class="val"><code>/model m365 --provider "M365 Router"</code></div>
        <div class="sub">Bisa dari WhatsApp, Telegram, atau Hermes CLI</div>
      </div>
      <div class="card">
        <h3>Total Requests / Sukses</h3>
        <div class="val">${stats.totalRequests} req (${stats.successRequests} OK)</div>
        <div class="sub">Rata-rata durasi: ${stats.avgLatencyMs} ms</div>
      </div>
      ${
        tunnelUrl
          ? `<div class="card"><h3>Cloudflare Public URL</h3><div class="val"><a href="${tunnelUrl}" style="color:#38bdf8" target="_blank">${tunnelUrl}</a></div><div class="sub">Endpoint: <code>${tunnelUrl}/v1</code></div></div>`
          : ''
      }
    </div>

    <div class="section">
      <h2>🧠 Daftar Model Router (Tersedia untuk Hermes / OpenAI Client)</h2>
      <table>
        <thead>
          <tr>
            <th>Model ID</th>
            <th>Mode Antigravity</th>
            <th>Deskripsi</th>
            <th>Perintah di Hermes Chat (WA / Telegram)</th>
          </tr>
        </thead>
        <tbody>
          ${ROUTER_MODELS.map(
            (m) => `<tr>
              <td><code>${m.id}</code></td>
              <td><code>${m.mode}${m.autoApprove ? ' + auto' : ''}</code></td>
              <td>${m.description}</td>
              <td><code>/model ${m.id} --provider "M365 Router"</code></td>
            </tr>`
          ).join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>💬 Test Chat Playground (Langsung ke M365 Router)</h2>
      <div class="playground">
        <select id="modelSelect">
          ${ROUTER_MODELS.map((m) => `<option value="${m.id}">${m.id}</option>`).join('')}
        </select>
        <input id="promptInput" type="text" placeholder="Ketik pesan tes untuk M365 Copilot Router (misal: cek docker container dan tab rpa)..." />
        <button class="btn" onclick="sendTest()">Kirim</button>
        <button class="btn btn-secondary" onclick="resetChat()">Reset Sesi</button>
      </div>
      <pre id="replyBox"></pre>
    </div>

    <div class="section">
      <h2>📜 Riwayat Request Terbaru (Live Router Logs)</h2>
      <table>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Model</th>
            <th>Prompt</th>
            <th>Durasi</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${
            logs.length === 0
              ? '<tr><td colspan="5" style="color:#94a3b8">Belum ada request yang masuk.</td></tr>'
              : logs
                  .slice()
                  .reverse()
                  .map(
                    (l) => `<tr>
                      <td>${l.time}</td>
                      <td><code>${l.model}</code></td>
                      <td>${l.promptPreview.replace(/</g, '&lt;')}</td>
                      <td>${l.durationMs} ms</td>
                      <td style="color:${l.ok ? '#22c55e' : '#ef4444'}">${l.ok ? '200 OK' : 'ERROR'}</td>
                    </tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function sendTest() {
      const model = document.getElementById('modelSelect').value;
      const prompt = document.getElementById('promptInput').value.trim();
      const box = document.getElementById('replyBox');
      if (!prompt) return;
      box.style.display = 'block';
      box.textContent = '⏳ Memproses melalui M365 9Router (' + model + ')...';
      try {
        const res = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await res.json();
        box.textContent = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
      } catch (e) {
        box.textContent = 'Error: ' + e.message;
      }
    }
    async function resetChat() {
      const box = document.getElementById('replyBox');
      box.style.display = 'block';
      box.textContent = '🔄 Mereset percakapan M365 Copilot...';
      await fetch('/api/new-chat', { method: 'POST' });
      box.textContent = '✔ Sesi chat M365 Copilot berhasil di-reset!';
    }
  </script>
</body>
</html>`;
}

/**
 * Start the M365 9Router OpenAI/Anthropic/Hermes Gateway Server
 */
export async function startM365RouterServer(options = {}) {
  const port = Number(options.port || DEFAULT_ROUTER_PORT);
  const host = options.host || '0.0.0.0';
  const defaultCwd = options.cwd || '/home/andi/script/test14';
  const workDir = fs.existsSync(defaultCwd) ? defaultCwd : process.cwd();

  if (!hasSavedSession()) {
    throw new Error(
      'Sesi login M365 Copilot belum ditemukan. Jalankan `m365 login` terlebih dahulu.'
    );
  }

  const routerProfileDir = path.join(CONFIG_DIR, 'router-profile');
  fs.mkdirSync(routerProfileDir, { recursive: true, mode: 0o700 });

  const client = new M365CopilotClient({
    headless: !options.headed,
    url: options.url,
    browser: options.browser,
    profileDir: routerProfileDir
  });

  const stats = {
    startedAt: new Date().toISOString(),
    totalRequests: 0,
    successRequests: 0,
    totalLatencyMs: 0,
    get avgLatencyMs() {
      return this.successRequests > 0
        ? Math.round(this.totalLatencyMs / this.successRequests)
        : 0;
    }
  };
  const recentLogs = [];

  // Mutex queue so concurrent HTTP requests to the persistent browser execute cleanly in order
  let queuePromise = Promise.resolve();
  function enqueueTask(taskFn) {
    const next = queuePromise.then(taskFn, taskFn);
    queuePromise = next.catch(() => {});
    return next;
  }

  async function ensureConnected() {
    if (!client.isReady || !client.page || client.page.isClosed()) {
      console.log(chalk.cyan('🔌 [M365 9Router] Menghubungkan sesi browser M365 Copilot...'));
      await client.connect((msg) => {
        console.log(chalk.gray(`   ${msg}`));
      });
      console.log(chalk.green('✔ [M365 9Router] Browser M365 Copilot terhubung dan siap melayani Hermes!'));
    }
  }

  // Pre-warm the browser connection asynchronously in the queue so HTTP server listens immediately
  if (options.prewarm !== false) {
    enqueueTask(async () => {
      try {
        await ensureConnected();
      } catch (err) {
        console.error(
          chalk.yellow(
            `⚠ [M365 9Router] Prewarm tertunda (${err.message}). Akan otomatis connect saat request masuk.`
          )
        );
      }
    });
  }

  /**
   * Core completion handler used by /v1/chat/completions, /v1/responses, and /v1/messages
   */
  async function processPromptWithM365(rawUserPrompt, modelId = 'm365', reqCwd = workDir) {
    const startTime = Date.now();
    stats.totalRequests++;

    // 1. Check Hermes built-in fast commands (/help, /menu, /info, /cpu)
    const quickReply = await tryHandleHermesQuickCommand(rawUserPrompt);
    if (quickReply !== null) {
      const durationMs = Date.now() - startTime;
      stats.successRequests++;
      stats.totalLatencyMs += durationMs;
      recentLogs.push({
        time: new Date().toLocaleTimeString('id-ID'),
        model: modelId,
        promptPreview: rawUserPrompt.slice(0, 80),
        durationMs,
        ok: true
      });
      return quickReply;
    }

    // 2. Determine model mode & agent settings
    const modelCfg =
      ROUTER_MODELS.find((m) => m.id === modelId.toLowerCase()) || ROUTER_MODELS[0];

    return enqueueTask(async () => {
      try {
        await ensureConnected();

        // Check if user sent `/new` or `/reset` from Hermes chat
        const trimmed = rawUserPrompt.trim();
        if (['/new', '/clear', '/reset'].includes(trimmed.toLowerCase())) {
          await client.newChat();
          return '✔ Sesi percakapan M365 Copilot telah di-reset (percakapan baru dimulai).';
        }

        // Support inline slash modes sent from Hermes chat (e.g. `/plan ...`, `/boost ...`, `/rpa ...`)
        let effectiveMode = modelCfg.mode;
        let cleanPrompt = stripHermesSystemNotes(rawUserPrompt).cleanText || rawUserPrompt.trim();
        let forceRpaContext = Boolean(modelCfg.forceRpa);
        const slashMatch = cleanPrompt.match(/^\/(plan|boost|goal|teamwork|grill-me|rpa)\b\s*(.*)$/is);
        if (slashMatch) {
          const slashCmd = slashMatch[1].toLowerCase();
          const rest = (slashMatch[2] || '').trim();
          if (slashCmd === 'rpa') {
            forceRpaContext = true;
            cleanPrompt =
              rest ||
              'Analisa tampilan layar Browser RPA Docker saat ini (http://localhost:9222) dan jelaskan langkah pengerjaannya.';
          } else {
            effectiveMode = slashCmd;
            if (rest) cleanPrompt = rest;
          }
        }

        // Extract the core user question (without appended conversation history) for clean classification & fallback retry
        const coreQuestion = cleanPrompt.split('\n\n---\n[Konteks Percakapan Sebelumnya]:')[0].trim();

        // Only inject local workspace/Docker/RPA system overrides when requested by model mode or technical/workspace keywords
        const needsWorkspaceContext =
          forceRpaContext ||
          modelCfg.id !== 'm365' ||
          effectiveMode !== 'normal' ||
          isWorkspaceOrTechnicalQuery(coreQuestion, reqCwd);

        let currentPrompt = cleanPrompt;
        if (needsWorkspaceContext) {
          const built = await buildAgyprompt(cleanPrompt, effectiveMode, {
            agent: true,
            cwd: reqCwd
          });
          currentPrompt = built.finalPrompt;
        }

        let finalOutput = '';
        const maxLoops = needsWorkspaceContext ? 2 : 0;

        for (let round = 0; round <= maxLoops; round++) {
          let responseText = '';
          try {
            responseText = await client.ask(currentPrompt);
          } catch (askErr) {
            // Reconnect once if browser page crashed or detached
            client.isReady = false;
            await client.close().catch(() => {});
            await ensureConnected();
            responseText = await client.ask(currentPrompt);
          }

          // Auto-recovery on empty response or topic guardrail refusal ("Sorry, it looks like I can't chat about this...")
          if (round === 0 && (!responseText || isCopilotRefusal(responseText))) {
            await client.newChat().catch(() => {});
            if (currentPrompt !== coreQuestion && coreQuestion) {
              responseText = await client.ask(coreQuestion);
            }
            if (!responseText || isCopilotRefusal(responseText)) {
              await client.newChat().catch(() => {});
              const neutralPrompt = `Berikan informasi ensiklopedis, faktual, dan objektif secara ringkas dalam Bahasa Indonesia untuk pertanyaan berikut: ${coreQuestion}`;
              responseText = await client.ask(neutralPrompt);
            }
          }

          if (!responseText) {
            break;
          }

          finalOutput = responseText;

          if (!needsWorkspaceContext) {
            break;
          }

          // Execute safe inspection/RPA/Docker commands automatically (or all if m365-agent / m365-rpa / m365-goal)
          const { appliedFiles, executedCommands, shouldContinueLoop } = await handleAgentActions(
            responseText,
            {
              rl: null,
              autoApprove: Boolean(modelCfg.autoApprove),
              autoSafeRead: true,
              cwd: reqCwd
            }
          );

          if (shouldContinueLoop && executedCommands.length > 0 && round < maxLoops) {
            const cmdBlocks = executedCommands.map(
              (c) =>
                `Perintah: \`${c.command.trim()}\`\nStatus: ${c.ok ? 'SUCCESS' : 'ERROR'}\nOutput:\n\`\`\`text\n${(c.output || '').trim()}\n\`\`\``
            );
            currentPrompt =
              `Berikut adalah hasil eksekusi perintah secara langsung di server Linux / Docker / Browser RPA pengguna:\n\n` +
              cmdBlocks.join('\n\n') +
              (appliedFiles.length > 0 ? `\n\nFile disimpan: ${appliedFiles.join(', ')}` : '') +
              `\n\nSilakan berikan jawaban/analisa akhir yang lengkap berdasarkan output di atas.`;
          } else {
            // If commands were executed on the final round, append a concise execution summary
            if (executedCommands.length > 0 || appliedFiles.length > 0) {
              const summaryParts = ['\n\n---', '🛠️ **Eksekusi Lokal M365 Antigravity Agent:**'];
              if (appliedFiles.length > 0) {
                summaryParts.push(`- File disimpan: \`${appliedFiles.join('`, `')}\``);
              }
              for (const c of executedCommands) {
                const firstLine = c.command.trim().split('\n')[0];
                summaryParts.push(
                  `- Perintah \`${firstLine}\`: **${c.ok ? 'Sukses' : 'Error'}**` +
                    (c.output ? `\n\`\`\`text\n${c.output.trim().slice(0, 1500)}\n\`\`\`` : '')
                );
              }
              finalOutput += summaryParts.join('\n');
            }
            break;
          }
        }

        const durationMs = Date.now() - startTime;
        stats.successRequests++;
        stats.totalLatencyMs += durationMs;
        recentLogs.push({
          time: new Date().toLocaleTimeString('id-ID'),
          model: modelId,
          promptPreview: rawUserPrompt.slice(0, 80),
          durationMs,
          ok: Boolean(finalOutput)
        });
        if (recentLogs.length > 50) recentLogs.shift();

        return finalOutput || 'Maaf, M365 Copilot tidak mengembalikan respons teks. Silakan coba lagi.';
      } catch (err) {
        const durationMs = Date.now() - startTime;
        recentLogs.push({
          time: new Date().toLocaleTimeString('id-ID'),
          model: modelId,
          promptPreview: rawUserPrompt.slice(0, 80),
          durationMs,
          ok: false
        });
        throw err;
      }
    });
  }

  let tunnelInfo = null;

  const server = http.createServer(async (req, res) => {
    // Enable CORS for all origins (like 9Router)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    try {
      // 1. Dashboard UI
      if (req.method === 'GET' && (pathname === '/' || pathname === '/dashboard')) {
        const html = renderRouterDashboardHtml({
          port,
          lanIp: getLocalLanIp(),
          tunnelUrl: tunnelInfo?.url || null,
          stats,
          logs: recentLogs,
          isConnected: client.isReady
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // 2. Health & Status API
      if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/status')) {
        let rpaTabs = [];
        try {
          rpaTabs = await rpaListTabs(DEFAULT_CDP_URL);
        } catch {
          // ignore
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            router: 'm365-9router',
            m365Connected: client.isReady,
            workingDirectory: workDir,
            rpaCdpUrl: DEFAULT_CDP_URL,
            rpaOpenTabs: rpaTabs,
            stats,
            models: ROUTER_MODELS.map((m) => m.id)
          })
        );
        return;
      }

      // 3. Reset Chat Session API
      if (req.method === 'POST' && pathname === '/api/new-chat') {
        await enqueueTask(async () => {
          await ensureConnected();
          await client.newChat();
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'M365 Copilot chat reset' }));
        return;
      }

      // 4. OpenAI /v1/models
      if (req.method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) {
        const now = Math.floor(Date.now() / 1000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: ROUTER_MODELS.map((m) => ({
              id: m.id,
              object: 'model',
              created: now,
              owned_by: m.owned_by,
              description: m.description
            }))
          })
        );
        return;
      }

      // 5. OpenAI /v1/chat/completions
      if (
        req.method === 'POST' &&
        (pathname === '/v1/chat/completions' || pathname === '/chat/completions')
      ) {
        const body = await readJsonBody(req);
        const modelName = body.model || 'm365';
        const stream = Boolean(body.stream);
        const userPrompt = extractPromptFromMessages(body.messages || []);

        if (!userPrompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'No prompt or messages provided' } }));
          return;
        }

        const created = Math.floor(Date.now() / 1000);
        const completionId = `chatcmpl-m365-${Date.now().toString(36)}`;

        console.log(
          chalk.cyan(`\n📥 [M365 9Router] Request (${modelName}${stream ? ', stream' : ''}): `) +
            chalk.white(userPrompt.slice(0, 100).replace(/\s+/g, ' '))
        );

        const outputText = await processPromptWithM365(userPrompt, modelName, body.cwd || workDir);

        if (stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
          });

          const roleChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: modelName,
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
          };
          res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

          const contentChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: modelName,
            choices: [{ index: 0, delta: { content: outputText }, finish_reason: null }]
          };
          res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);

          const stopChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: modelName,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
          };
          res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          const responsePayload = {
            id: completionId,
            object: 'chat.completion',
            created,
            model: modelName,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: outputText
                },
                finish_reason: 'stop'
              }
            ],
            usage: {
              prompt_tokens: Math.ceil(userPrompt.length / 4),
              completion_tokens: Math.ceil(outputText.length / 4),
              total_tokens: Math.ceil((userPrompt.length + outputText.length) / 4)
            }
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(responsePayload));
        }
        return;
      }

      // 6. OpenAI /v1/responses compatibility (used by newer Codex / OpenAI SDKs)
      if (req.method === 'POST' && (pathname === '/v1/responses' || pathname === '/responses')) {
        const body = await readJsonBody(req);
        const modelName = body.model || 'm365';
        const input = body.input;
        const userPrompt = Array.isArray(input)
          ? extractPromptFromMessages(input)
          : extractTextFromMessageContent(input);

        const outputText = await processPromptWithM365(userPrompt, modelName, body.cwd || workDir);
        const respId = `resp_m365_${Date.now().toString(36)}`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: respId,
            object: 'response',
            created_at: Math.floor(Date.now() / 1000),
            status: 'completed',
            model: modelName,
            output: [
              {
                type: 'message',
                id: `msg_${Date.now().toString(36)}`,
                status: 'completed',
                role: 'assistant',
                content: [{ type: 'output_text', text: outputText, annotations: [] }]
              }
            ],
            output_text: outputText
          })
        );
        return;
      }

      // 7. Anthropic /v1/messages compatibility (just like 9Router)
      if (req.method === 'POST' && (pathname === '/v1/messages' || pathname === '/messages')) {
        const body = await readJsonBody(req);
        const modelName = body.model || 'm365';
        const userPrompt = extractPromptFromMessages(body.messages || []);
        const outputText = await processPromptWithM365(userPrompt, modelName, body.cwd || workDir);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: `msg_m365_${Date.now().toString(36)}`,
            type: 'message',
            role: 'assistant',
            model: modelName,
            content: [{ type: 'text', text: outputText }],
            stop_reason: 'end_turn',
            usage: {
              input_tokens: Math.ceil(userPrompt.length / 4),
              output_tokens: Math.ceil(outputText.length / 4)
            }
          })
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Endpoint not found: ${req.method} ${pathname}` } }));
    } catch (err) {
      console.error(chalk.red(`✖ [M365 9Router Error] ${err.message}`));
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolve());
  });

  const lanIp = getLocalLanIp();
  console.log(
    chalk.cyan.bold('\n╭─ 🚀 Andi Pangeran M365 9Router Server Aktif ──────────────────────────╮')
  );
  console.log(
    chalk.cyan('│ ') +
      chalk.white('Web Dashboard (9Router UI) : ') +
      chalk.green.bold(`http://localhost:${port}`) +
      chalk.gray(` (LAN: http://${lanIp}:${port})`)
  );
  console.log(
    chalk.cyan('│ ') +
      chalk.white('OpenAI Base URL (Hermes)   : ') +
      chalk.yellow.bold(`http://localhost:${port}/v1`)
  );
  console.log(
    chalk.cyan('│ ') +
      chalk.white('Model Tersedia             : ') +
      chalk.magenta(ROUTER_MODELS.map((m) => m.id).join(', '))
  );
  console.log(
    chalk.cyan('│ ') +
      chalk.white('Aktifkan di Hermes Chat    : ') +
      chalk.green.bold('/model m365 --provider "M365 Router"')
  );
  console.log(
    chalk.cyan.bold('╰───────────────────────────────────────────────────────────────────────╯\n')
  );

  if (options.cloudflare) {
    console.log(chalk.cyan('🌐 Membuka Cloudflare Quick Tunnel untuk M365 9Router...'));
    tunnelInfo = await startCloudflareTunnel(port);
    if (tunnelInfo?.url) {
      console.log(chalk.green.bold(`✔ Public Cloudflare 9Router URL : ${tunnelInfo.url}`));
      console.log(chalk.yellow.bold(`✔ Public OpenAI Endpoint        : ${tunnelInfo.url}/v1\n`));
    }
  }

  const shutdown = async () => {
    console.log(chalk.gray('\nMenutup M365 9Router Server...'));
    if (tunnelInfo) tunnelInfo.stop();
    server.close();
    await client.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, client, port };
}
