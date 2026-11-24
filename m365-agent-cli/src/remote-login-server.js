import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * Starts a temporary Cloudflare Quick Tunnel (`trycloudflare.com`) pointing to the local port.
 * Requires `cloudflared` binary installed on the system.
 */
export function startCloudflareTunnel(localPort, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const candidates = ['cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared'];
    let bin = 'cloudflared';
    for (const c of candidates) {
      if (c.startsWith('/') && fs.existsSync(c)) {
        bin = c;
        break;
      }
    }

    let child;
    try {
      child = spawn(
        bin,
        ['tunnel', '--url', `http://127.0.0.1:${localPort}`, '--no-autoupdate'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch {
      resolve({ url: null, close: async () => {} });
      return;
    }

    let foundUrl = null;
    let settled = false;

    const cleanupProcess = async () => {
      if (!child || child.killed) return;
      try {
        child.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 200));
        if (!child.killed) child.kill('SIGKILL');
      } catch {
        // ignore
      }
    };

    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        url,
        close: cleanupProcess
      });
    };

    const timer = setTimeout(() => {
      finish(foundUrl);
    }, timeoutMs);

    const handleChunk = (chunk) => {
      const text = chunk.toString('utf8');
      if (!foundUrl) {
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match) {
          foundUrl = match[0];
        }
      }
      if (foundUrl && /Registered tunnel connection/i.test(text)) {
        finish(foundUrl);
      }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);

    child.on('error', () => {
      finish(null);
    });

    child.on('exit', () => {
      if (!settled) {
        finish(foundUrl);
      }
    });
  });
}

/**
 * Detects the best LAN / external IPv4 addresses of this machine
 * so SSH/PuTTY users can copy-paste the URL directly into their local browser.
 */
export function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const primary = [];
  const secondary = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const lower = name.toLowerCase();
    const isVirtualBridge =
      lower.startsWith('docker') ||
      lower.startsWith('br-') ||
      lower.startsWith('veth') ||
      lower.startsWith('virbr') ||
      lower.startsWith('cni') ||
      lower.startsWith('flannel');

    for (const addr of addrs) {
      if ((addr.family === 'IPv4' || addr.family === 4) && !addr.internal) {
        if (isVirtualBridge) {
          secondary.push(addr.address);
        } else {
          primary.push(addr.address);
        }
      }
    }
  }

  // Also check SSH_CONNECTION if present (format: "<client_ip> <client_port> <server_ip> <server_port>")
  const sshConn = process.env.SSH_CONNECTION;
  if (sshConn) {
    const parts = sshConn.trim().split(/\s+/);
    const serverIp = parts[2];
    if (serverIp && serverIp !== '127.0.0.1' && serverIp !== '::1' && !primary.includes(serverIp)) {
      primary.unshift(serverIp);
    }
  }

  return primary.length > 0 ? primary : secondary;
}

function buildPortalHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>M365 Copilot CLI - Remote SSH Browser Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background: #1e293b;
      border-bottom: 1px solid #334155;
      padding: 10px 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      justify-content: space-between;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      color: #38bdf8;
    }
    .badge {
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 999px;
      font-weight: 600;
      background: #334155;
      color: #fbbf24;
    }
    .badge.ready {
      background: #065f46;
      color: #34d399;
    }
    .url-bar {
      flex: 1;
      min-width: 220px;
      max-width: 520px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 6px 10px;
      color: #94a3b8;
      font-family: monospace;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toolbar {
      background: #1e293b;
      border-bottom: 1px solid #334155;
      padding: 8px 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .quick-input {
      flex: 1;
      min-width: 220px;
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 7px 12px;
      color: #f8fafc;
      font-size: 13px;
      outline: none;
    }
    .quick-input:focus {
      border-color: #38bdf8;
    }
    button {
      background: #334155;
      color: #f8fafc;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 7px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #475569; }
    button.primary {
      background: #0284c7;
      border-color: #0369a1;
    }
    button.primary:hover { background: #0369a1; }
    button.success {
      background: #059669;
      border-color: #047857;
    }
    button.success:hover { background: #047857; }
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      overflow: auto;
      position: relative;
      background: #020617;
    }
    .screen-wrapper {
      position: relative;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
      border: 2px solid #334155;
      border-radius: 8px;
      overflow: hidden;
      background: #ffffff;
      max-width: 100%;
      max-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
    }
    .screen-wrapper:focus {
      border-color: #38bdf8;
    }
    #screen {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 135px);
      width: auto;
      height: auto;
      cursor: pointer;
      user-select: none;
      -webkit-user-drag: none;
    }
    .click-dot {
      position: absolute;
      width: 18px;
      height: 18px;
      border: 2px solid #ef4444;
      background: rgba(239, 68, 68, 0.35);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: pulse 0.45s ease-out forwards;
    }
    @keyframes pulse {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
    }
    .overlay-done {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.92);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 100;
      text-align: center;
      padding: 24px;
    }
    .overlay-done h1 { color: #34d399; margin-bottom: 12px; font-size: 28px; }
    .overlay-done p { color: #cbd5e1; max-width: 520px; line-height: 1.6; }
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 90;
      padding: 20px;
    }
    .modal-card {
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 10px;
      max-width: 600px;
      width: 100%;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .modal-card textarea {
      width: 100%;
      height: 180px;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
    }
    .hint {
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>🐧⚡ Andi Pangeran M365 CLI — SSH Login</span>
      <span id="statusBadge" class="badge">Menunggu Login...</span>
    </div>
    <div id="urlBar" class="url-bar" title="URL Aktif di Browser Server">Memuat browser...</div>
    <div style="display:flex; gap:8px;">
      <button onclick="openCookieModal()" title="Paste JSON Cookies dari ekstensi Cookie-Editor">🍪 Paste Cookies</button>
      <button onclick="sendAction({ type: 'reload' })" title="Muat ulang halaman">🔄 Refresh</button>
      <button class="success" onclick="saveAndFinish()">✅ Simpan Sesi & Selesai</button>
    </div>
  </header>

  <div class="toolbar">
    <span class="hint">💡 Klik langsung pada gambar browser di bawah untuk mengetik, atau ketik/paste di sini:</span>
    <input
      id="quickText"
      class="quick-input"
      type="text"
      placeholder="Ketik atau Paste Email / Password / Kode OTP di sini lalu tekan Enter..."
    />
    <button class="primary" onclick="sendQuickText(false)">Ketik</button>
    <button class="primary" onclick="sendQuickText(true)">Ketik + Enter ↵</button>
    <button onclick="sendAction({ type: 'press', key: 'Backspace' })">⌫ Backspace</button>
    <button onclick="sendAction({ type: 'press', key: 'Tab' })">⇥ Tab</button>
  </div>

  <main>
    <div id="screenWrapper" class="screen-wrapper" tabindex="0">
      <img id="screen" alt="Menunggu tampilan browser dari server..." />
    </div>
  </main>

  <div id="cookieModal" class="modal">
    <div class="modal-card">
      <h3>🍪 Impor Cookies JSON</h3>
      <p class="hint">
        Jika Anda sudah login ke <b>m365.cloud.microsoft</b> di tab lain, Anda bisa mengekspor cookies (format JSON dari ekstensi <i>Cookie-Editor</i>) dan menempelkannya di bawah ini:
      </p>
      <textarea id="cookieJsonInput" placeholder='[{"name": "...", "value": "...", "domain": ".cloud.microsoft"}]'></textarea>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button onclick="closeCookieModal()">Batal</button>
        <button class="success" onclick="submitCookieJson()">Impor & Simpan</button>
      </div>
    </div>
  </div>

  <div id="doneOverlay" class="overlay-done">
    <h1>🎉 Login Berhasil Disimpan!</h1>
    <p>
      Sesi dan cookies Microsoft 365 Copilot telah tersimpan di server.<br />
      Anda sekarang bisa menutup halaman browser ini dan kembali ke terminal <b>SSH / PuTTY</b> Anda.
    </p>
  </div>

  <script>
    const screenImg = document.getElementById('screen');
    const screenWrapper = document.getElementById('screenWrapper');
    const urlBar = document.getElementById('urlBar');
    const statusBadge = document.getElementById('statusBadge');
    const quickText = document.getElementById('quickText');
    const doneOverlay = document.getElementById('doneOverlay');
    const cookieModal = document.getElementById('cookieModal');

    let viewportWidth = 1280;
    let viewportHeight = 850;
    let lastFrameTime = Date.now();

    function applyFrameMessage(msg) {
      if (!msg) return;
      if (msg.image) {
        screenImg.src = 'data:image/jpeg;base64,' + msg.image;
        lastFrameTime = Date.now();
        if (msg.width) viewportWidth = msg.width;
        if (msg.height) viewportHeight = msg.height;
      }
      if (msg.url) {
        urlBar.textContent = msg.url;
      }
      if (msg.isChatReady) {
        statusBadge.textContent = '✅ Chat Copilot Terdeteksi!';
        statusBadge.classList.add('ready');
      }
      if (msg.finished) {
        doneOverlay.style.display = 'flex';
        evtSource.close();
      }
    }

    const evtSource = new EventSource('/api/stream');
    evtSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        applyFrameMessage(msg);
      } catch (e) {}
    };

    // Fallback polling in case Cloudflare or a reverse proxy buffers SSE
    setInterval(async () => {
      if (doneOverlay.style.display === 'flex') return;
      if (Date.now() - lastFrameTime > 1400) {
        try {
          const res = await fetch('/api/frame', { cache: 'no-store' });
          if (res.ok) {
            const msg = await res.json();
            applyFrameMessage(msg);
          }
        } catch (e) {}
      }
    }, 1500);

    async function sendAction(payload) {
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        return await res.json();
      } catch (e) {
        return { ok: false };
      }
    }

    screenImg.addEventListener('click', (e) => {
      screenWrapper.focus();
      const rect = screenImg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const scaleX = viewportWidth / rect.width;
      const scaleY = viewportHeight / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      const dot = document.createElement('div');
      dot.className = 'click-dot';
      dot.style.left = (e.clientX - rect.left) + 'px';
      dot.style.top = (e.clientY - rect.top) + 'px';
      screenWrapper.appendChild(dot);
      setTimeout(() => dot.remove(), 450);

      sendAction({ type: 'click', x, y });
    });

    screenImg.addEventListener('wheel', (e) => {
      e.preventDefault();
      sendAction({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY });
    }, { passive: false });

    quickText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendQuickText(true);
      }
    });

    function sendQuickText(withEnter) {
      const val = quickText.value;
      if (!val && withEnter) {
        sendAction({ type: 'press', key: 'Enter' });
        return;
      }
      if (!val) return;
      sendAction({ type: 'text', text: val, submit: Boolean(withEnter) });
      quickText.value = '';
    }

    function isInputFocused() {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    }

    window.addEventListener('keydown', (e) => {
      if (isInputFocused() || cookieModal.style.display === 'flex') return;
      if (e.ctrlKey || e.metaKey) {
        // Allow Ctrl+V to trigger the paste event
        if (e.key.toLowerCase() === 'v') return;
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          sendAction({ type: 'press', key: 'Control+A' });
          return;
        }
      }

      const specialKeys = [
        'Enter', 'Backspace', 'Tab', 'Escape', 'Delete',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown'
      ];

      if (specialKeys.includes(e.key)) {
        e.preventDefault();
        sendAction({ type: 'press', key: e.key });
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        sendAction({ type: 'text', text: e.key, submit: false });
      }
    });

    window.addEventListener('paste', (e) => {
      if (isInputFocused() || cookieModal.style.display === 'flex') return;
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      if (pasted) {
        e.preventDefault();
        sendAction({ type: 'text', text: pasted, submit: false });
      }
    });

    async function saveAndFinish() {
      await sendAction({ type: 'save' });
      doneOverlay.style.display = 'flex';
    }

    function openCookieModal() {
      cookieModal.style.display = 'flex';
    }
    function closeCookieModal() {
      cookieModal.style.display = 'none';
    }
    async function submitCookieJson() {
      const raw = document.getElementById('cookieJsonInput').value.trim();
      if (!raw) return;
      const res = await sendAction({ type: 'import-cookies', json: raw });
      if (res && res.ok) {
        closeCookieModal();
        doneOverlay.style.display = 'flex';
      } else {
        alert('Format JSON cookies tidak valid: ' + (res?.error || 'Unknown error'));
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Starts a local HTTP server that streams the headless Playwright browser page
 * and forwards mouse/keyboard interactions from the user's browser over SSH/LAN.
 */
export async function startRemoteLoginServer({
  context,
  page,
  preferredPort = 8365,
  viewport = { width: 1280, height: 850 },
  enableCloudflare = true,
  onManualSave = () => {},
  onImportCookiesRaw = () => {}
}) {
  const clients = new Set();
  let latestFrameBase64 = '';
  let isChatReady = false;
  let closed = false;
  let cdpSession = null;

  const getActivePage = () => {
    const pages = context.pages();
    return pages.length > 0 ? pages[pages.length - 1] : page;
  };

  const broadcast = (payload) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      try {
        res.write(data);
      } catch {
        clients.delete(res);
      }
    }
  };

  const captureFrameNow = async () => {
    if (closed) return;
    try {
      const activePage = getActivePage();
      const buf = await activePage.screenshot({ type: 'jpeg', quality: 75, timeout: 3000 });
      latestFrameBase64 = buf.toString('base64');
      broadcast({
        type: 'frame',
        image: latestFrameBase64,
        url: activePage.url(),
        width: viewport.width,
        height: viewport.height,
        isChatReady
      });
    } catch {
      // ignore transient navigation errors
    }
  };

  // Try starting CDP screencast for low-latency frame streaming (Chromium)
  try {
    cdpSession = await context.newCDPSession(page);
    cdpSession.on('Page.screencastFrame', async ({ data, sessionId }) => {
      latestFrameBase64 = data;
      try {
        await cdpSession.send('Page.screencastFrameAck', { sessionId });
      } catch {
        // ignore
      }
      broadcast({
        type: 'frame',
        image: latestFrameBase64,
        url: getActivePage().url(),
        width: viewport.width,
        height: viewport.height,
        isChatReady
      });
    });
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      maxWidth: viewport.width,
      maxHeight: viewport.height,
      everyNthFrame: 1
    });
  } catch {
    // Firefox or non-CDP browser: fallback timer handles frame streaming
  }

  // Periodic frame refresh so static screens and newly opened tabs stay up to date
  const frameInterval = setInterval(captureFrameNow, 1000);

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'GET' && urlObj.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(buildPortalHtml());
      return;
    }

    if (req.method === 'GET' && urlObj.pathname === '/api/frame') {
      if (!latestFrameBase64) {
        await captureFrameNow();
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(
        JSON.stringify({
          type: 'frame',
          image: latestFrameBase64,
          url: getActivePage().url(),
          width: viewport.width,
          height: viewport.height,
          isChatReady,
          finished: closed
        })
      );
      return;
    }

    if (req.method === 'GET' && urlObj.pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive'
      });
      clients.add(res);
      req.on('close', () => clients.delete(res));

      // Send initial frame immediately
      if (latestFrameBase64) {
        res.write(
          `data: ${JSON.stringify({
            type: 'frame',
            image: latestFrameBase64,
            url: getActivePage().url(),
            width: viewport.width,
            height: viewport.height,
            isChatReady
          })}\n\n`
        );
      } else {
        captureFrameNow();
      }
      return;
    }

    if (req.method === 'POST' && urlObj.pathname === '/api/action') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        return;
      }

      const activePage = getActivePage();
      try {
        switch (body.type) {
          case 'click': {
            const x = Number(body.x) || 0;
            const y = Number(body.y) || 0;
            await activePage.mouse.click(x, y, { button: body.button || 'left' });
            setTimeout(captureFrameNow, 120);
            setTimeout(captureFrameNow, 450);
            break;
          }
          case 'wheel': {
            await activePage.mouse.wheel(Number(body.deltaX) || 0, Number(body.deltaY) || 0);
            setTimeout(captureFrameNow, 150);
            break;
          }
          case 'press': {
            if (body.key) {
              await activePage.keyboard.press(String(body.key));
              setTimeout(captureFrameNow, 120);
              setTimeout(captureFrameNow, 450);
            }
            break;
          }
          case 'text': {
            if (body.text) {
              await activePage.keyboard.insertText(String(body.text));
            }
            if (body.submit) {
              await new Promise((r) => setTimeout(r, 80));
              await activePage.keyboard.press('Enter');
            }
            setTimeout(captureFrameNow, 120);
            setTimeout(captureFrameNow, 500);
            break;
          }
          case 'reload': {
            await activePage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            setTimeout(captureFrameNow, 300);
            break;
          }
          case 'save': {
            onManualSave();
            break;
          }
          case 'import-cookies': {
            await onImportCookiesRaw(body.json);
            break;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  // Bind to first available port starting at preferredPort
  let boundPort = Number(preferredPort) || 8365;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          server.removeListener('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(boundPort, '0.0.0.0');
      });
      break;
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        boundPort++;
      } else {
        throw err;
      }
    }
  }

  const ips = getLocalIpAddresses();
  const primaryIp = ips[0] || 'localhost';
  const lanUrl = `http://${primaryIp}:${boundPort}`;
  const localUrl = `http://localhost:${boundPort}`;

  let cfTunnel = { url: null, close: async () => {} };
  if (enableCloudflare) {
    cfTunnel = await startCloudflareTunnel(boundPort);
  }

  const cloudflareUrl = cfTunnel.url || null;
  const primaryUrl = cloudflareUrl || lanUrl;

  const onProcessExit = () => {
    cfTunnel.close().catch(() => {});
  };
  process.once('exit', onProcessExit);
  process.once('SIGINT', onProcessExit);
  process.once('SIGTERM', onProcessExit);

  return {
    port: boundPort,
    primaryUrl,
    cloudflareUrl,
    lanUrl,
    localUrl,
    allUrls: ips.map((ip) => `http://${ip}:${boundPort}`),
    setChatReady(ready) {
      isChatReady = Boolean(ready);
      broadcast({ type: 'status', isChatReady });
    },
    async close() {
      if (closed) return;
      closed = true;
      process.removeListener('exit', onProcessExit);
      process.removeListener('SIGINT', onProcessExit);
      process.removeListener('SIGTERM', onProcessExit);
      clearInterval(frameInterval);
      broadcast({ type: 'done', finished: true });
      for (const res of clients) {
        try {
          res.end();
        } catch {
          // ignore
        }
      }
      clients.clear();
      if (cdpSession) {
        await cdpSession.send('Page.stopScreencast').catch(() => {});
        await cdpSession.detach().catch(() => {});
      }
      await cfTunnel.close().catch(() => {});
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}
