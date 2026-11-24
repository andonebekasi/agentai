import fs from 'node:fs';
import { chromium, firefox } from 'playwright';
import {
  PROFILE_DIR,
  STATE_FILE,
  ensureDirectories,
  loadConfig,
  hasSavedSession
} from './config.js';
import {
  findChatInputAcrossFrames,
  submitPromptToInput,
  getConversationSnapshot,
  parseSignalRPayload,
  cleanCopilotText,
  isCopilotRefusal,
  isLoginUrl
} from './dom-helpers.js';

export class M365CopilotClient {
  constructor(options = {}) {
    const config = loadConfig();
    this.url = options.url || config.url || 'https://m365.cloud.microsoft/chat';
    this.headless = options.headless !== undefined ? options.headless : config.headless;
    this.timeoutMs = options.timeoutMs || config.timeoutMs || 120000;
    this.userAgent = config.userAgent;
    this.browserType = options.browser === 'firefox' ? firefox : chromium;
    this.profileDir = options.profileDir || PROFILE_DIR;

    this.browser = null;
    this.context = null;
    this.page = null;
    this.isReady = false;
    this.activeStreamHandler = null;
  }

  async connect(onStatus = () => {}) {
    ensureDirectories();

    if (!hasSavedSession()) {
      throw new Error(
        'Belum ada sesi login yang tersimpan. Jalankan `m365 login` terlebih dahulu untuk autentikasi akun Microsoft 365 Anda.'
      );
    }

    onStatus('Membuka browser session M365 Copilot...');

    const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
    const useHeadless = !hasDisplay ? true : this.headless;

    const launchArgs =
      this.browserType === firefox
        ? []
        : [
            '--disable-blink-features=AutomationControlled',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-sandbox'
          ];

    try {
      this.context = await this.browserType.launchPersistentContext(this.profileDir, {
        headless: useHeadless,
        viewport: { width: 1280, height: 850 },
        userAgent: this.userAgent,
        args: launchArgs
      });
    } catch (err) {
      // Fallback to isolated browser context with saved storageState if profileDir is locked by another process
      this.browser = await this.browserType.launch({
        headless: useHeadless,
        args: launchArgs
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 850 },
        userAgent: this.userAgent,
        storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined
      });
    }

    if (fs.existsSync(STATE_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (Array.isArray(saved.cookies) && saved.cookies.length > 0) {
          await this.context.addCookies(saved.cookies);
        }
      } catch {
        // ignore invalid state file
      }
    }

    this.page = this.context.pages()[0] || (await this.context.newPage());

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    this._attachNetworkListeners(this.page);

    onStatus(`Menghubungkan ke ${this.url}...`);
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    onStatus('Menunggu antarmuka chat Copilot siap...');
    const readyInput = await this._waitForChatInput(45000);

    const currentUrl = this.page.url();
    if (isLoginUrl(currentUrl)) {
      await this.close();
      throw new Error(
        `Sesi login telah kedaluwarsa (dialihkan ke ${currentUrl}). Silakan jalankan \`m365 login\` untuk memperbarui sesi.`
      );
    }

    if (!readyInput) {
      throw new Error(
        `Halaman terbuka (${currentUrl}), namun kotak input chat Copilot tidak ditemukan. ` +
          `Gunakan \`m365 --headed\` atau \`/screenshot\` untuk memeriksa halaman, atau jalankan \`m365 login\` ulang.`
      );
    }

    this.isReady = true;
    return true;
  }

  _attachNetworkListeners(page) {
    // 1. Intercept SignalR WebSockets (wss://substrate.office.com/m365Copilot/Chathub or sydney.bing.com)
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        if (!this.activeStreamHandler) return;
        const events = parseSignalRPayload(frame.payload);
        for (const ev of events) {
          this.activeStreamHandler(ev);
        }
      });
    });

    // 2. Intercept Server-Sent Events / JSON chat responses if HTTP streaming is used
    page.on('response', async (response) => {
      if (!this.activeStreamHandler) return;
      try {
        const url = response.url().toLowerCase();
        const contentType = (response.headers()['content-type'] || '').toLowerCase();
        if (
          (url.includes('copilot') || url.includes('chathub') || url.includes('conversation')) &&
          contentType.includes('application/json')
        ) {
          const body = await response.json().catch(() => null);
          if (body && typeof body.text === 'string' && body.text.length > 0) {
            this.activeStreamHandler({ type: 'update', text: body.text });
          }
        }
      } catch {
        // ignore
      }
    });
  }

  async _waitForChatInput(timeoutMs = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const currentUrl = this.page.url();
      if (isLoginUrl(currentUrl) && Date.now() - start > 5000) {
        return null;
      }
      const inputTarget = await findChatInputAcrossFrames(this.page);
      if (inputTarget) {
        return inputTarget;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return null;
  }

  async ask(promptText, { onUpdate = () => {}, _retriedNewChat = false } = {}) {
    if (!this.isReady || !this.page) {
      await this.connect();
    }

    // If previous turn hit a refusal/disengagement, start a fresh chat automatically
    if (this.threadDisengaged) {
      this.threadDisengaged = false;
      await this.newChat().catch(() => {});
    }

    let inputTarget = await findChatInputAcrossFrames(this.page);
    if (!inputTarget) {
      await this.newChat().catch(() => {});
      inputTarget = await findChatInputAcrossFrames(this.page);
      if (!inputTarget) {
        throw new Error('Kotak input chat Copilot tidak ditemukan di halaman saat ini.');
      }
    }

    // Snapshot messages before submitting prompt
    let beforeSnapshot = await getConversationSnapshot(this.page);
    if (isCopilotRefusal(beforeSnapshot.lastMessage)) {
      await this.newChat().catch(() => {});
      inputTarget = (await findChatInputAcrossFrames(this.page)) || inputTarget;
      beforeSnapshot = await getConversationSnapshot(this.page);
    }

    const baselineCount = beforeSnapshot.count;
    const baselineLastText = beforeSnapshot.lastMessage;

    let latestText = '';
    let streamCompleted = false;
    let sawWebSocketUpdate = false;
    let streamDisengaged = false;
    let lastChangeTime = Date.now();

    this.activeStreamHandler = (ev) => {
      if (ev.disengaged) {
        streamDisengaged = true;
      }
      if (ev.text) {
        sawWebSocketUpdate = true;
        if (ev.text.length >= latestText.length || ev.type === 'complete') {
          const delta = ev.text.slice(latestText.length);
          latestText = ev.text;
          lastChangeTime = Date.now();
          onUpdate(latestText, delta);
        }
      }
      if (ev.type === 'complete') {
        streamCompleted = true;
      }
    };

    try {
      await submitPromptToInput(inputTarget, promptText);

      const startTime = Date.now();
      let sawNewDomMessage = false;

      while (Date.now() - startTime < this.timeoutMs) {
        await new Promise((r) => setTimeout(r, 400));

        if (streamCompleted && latestText.trim().length > 0) {
          break;
        }

        // Also poll DOM across all frames as fallback or primary when WebSocket isn't used
        const snap = await getConversationSnapshot(this.page);
        const hasNewMessage =
          snap.count > baselineCount ||
          (snap.lastMessage &&
            snap.lastMessage !== baselineLastText &&
            snap.lastMessage !== promptText.trim());

        if (hasNewMessage && snap.lastMessage) {
          sawNewDomMessage = true;
          const candidate = snap.lastMessage;
          if (!sawWebSocketUpdate && candidate !== latestText && candidate.length >= latestText.length) {
            const delta = candidate.slice(latestText.length);
            latestText = candidate;
            lastChangeTime = Date.now();
            onUpdate(latestText, delta);
          }
        }

        const idleTime = Date.now() - lastChangeTime;
        const elapsed = Date.now() - startTime;

        // If nothing has arrived at all after 20s and Copilot is not generating, the chat thread may be stuck/locked
        if (
          !_retriedNewChat &&
          latestText.trim().length === 0 &&
          !sawNewDomMessage &&
          !snap.isGenerating &&
          elapsed > 20000
        ) {
          this.activeStreamHandler = null;
          await this.newChat().catch(() => {});
          return await this.ask(promptText, { onUpdate, _retriedNewChat: true });
        }

        // When WebSocket is streaming, wait for SignalR Type 2 (streamCompleted) or 6.5s of idle + !isGenerating
        // When DOM-only fallback is used, wait for 3.2s of idle + !isGenerating
        const requiredIdleMs = sawWebSocketUpdate ? 6500 : 3200;
        if (
          (sawNewDomMessage || latestText.length > 0) &&
          !snap.isGenerating &&
          latestText.trim().length > 0 &&
          idleTime > requiredIdleMs
        ) {
          break;
        }
      }

      // Persist updated cookies silently
      if (this.context) {
        await this.context.storageState({ path: STATE_FILE }).catch(() => {});
      }

      const finalCleaned = cleanCopilotText(latestText);

      // If Copilot refused/disengaged or returned empty, reset the chat so the next request starts fresh
      if (!finalCleaned || streamDisengaged || isCopilotRefusal(finalCleaned)) {
        this.threadDisengaged = false;
        await this.newChat().catch(() => {});
      }

      return finalCleaned;
    } finally {
      this.activeStreamHandler = null;
    }
  }

  async newChat() {
    if (!this.page) return;
    // Try clicking "New chat" button across frames first, fallback to reloading URL
    const newChatSelectors = [
      'button[aria-label*="New chat" i]',
      'button[aria-label*="Chat baru" i]',
      'button[data-testid*="new-chat" i]',
      'button[title*="New chat" i]'
    ];
    for (const frame of [this.page.mainFrame(), ...this.page.frames()]) {
      for (const sel of newChatSelectors) {
        try {
          const btn = frame.locator(sel).first();
          if ((await btn.count()) > 0 && (await btn.isVisible())) {
            await btn.click();
            await new Promise((r) => setTimeout(r, 1000));
            return;
          }
        } catch {
          // ignore
        }
      }
    }
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this._waitForChatInput(30000);
  }

  async screenshot(filePath = 'm365-screenshot.png') {
    if (!this.page) {
      throw new Error('Browser belum aktif.');
    }
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  /**
   * Antigravity `/browser` command: Open a URL in a secondary tab, extract readable text, and close it.
   */
  async browseUrl(targetUrl) {
    if (!this.context) {
      await this.connect();
    }
    const tab = await this.context.newPage();
    try {
      const normalizedUrl = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`;
      await tab.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 2000));
      const data = await tab.evaluate(() => {
        const title = document.title || '';
        const text = (document.body ? document.body.innerText : '').replace(/\s+\n/g, '\n').trim();
        return { title, url: location.href, text: text.slice(0, 15000) };
      });
      return data;
    } finally {
      await tab.close().catch(() => {});
    }
  }

  async close() {
    this.isReady = false;
    if (this.context) {
      try {
        await this.context.storageState({ path: STATE_FILE });
      } catch {
        // ignore
      }
      try {
        await this.context.close();
      } catch {
        // ignore
      }
      this.context = null;
      this.page = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
    }
  }
}
