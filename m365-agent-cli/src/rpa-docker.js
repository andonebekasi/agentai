import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import chalk from 'chalk';

const execAsync = promisify(exec);

export const DEFAULT_CDP_URL = process.env.CDP_URL || 'http://localhost:9222';

/**
 * Connect to Docker Chromium RPA via Chrome DevTools Protocol (CDP)
 */
export async function withCdpBrowser(cdpUrl = DEFAULT_CDP_URL, fn) {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP(cdpUrl, { timeout: 6000 });
    return await fn(browser);
  } finally {
    if (browser) {
      // Closing a CDP browser connection in Playwright disconnects without killing the remote browser
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Get active or matching page from CDP browser
 */
export async function getCdpPage(browser, targetMatch = null) {
  const contexts = browser.contexts();
  if (!contexts || contexts.length === 0) {
    throw new Error('Tidak ditemukan browser context pada CDP.');
  }
  const allPages = [];
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      allPages.push(p);
    }
  }

  if (allPages.length === 0) {
    const page = await contexts[0].newPage();
    return { page, allPages: [page], index: 0 };
  }

  if (targetMatch !== null && targetMatch !== undefined && String(targetMatch).trim() !== '') {
    const q = String(targetMatch).trim();
    // If numeric index
    if (/^\d+$/.test(q)) {
      const idx = Number(q);
      if (idx >= 0 && idx < allPages.length) {
        return { page: allPages[idx], allPages, index: idx };
      }
    }
    // Match by URL or Title
    const lower = q.toLowerCase();
    for (let i = 0; i < allPages.length; i++) {
      const p = allPages[i];
      const title = (await p.title().catch(() => '')) || '';
      if (p.url().toLowerCase().includes(lower) || title.toLowerCase().includes(lower)) {
        return { page: p, allPages, index: i };
      }
    }
  }

  // Prefer non-blank page, or last tab
  for (let i = allPages.length - 1; i >= 0; i--) {
    const u = allPages[i].url();
    if (u && u !== 'about:blank' && !u.startsWith('chrome://')) {
      return { page: allPages[i], allPages, index: i };
    }
  }

  return { page: allPages[allPages.length - 1], allPages, index: allPages.length - 1 };
}

/**
 * List all open tabs in the Docker RPA browser
 */
export async function rpaListTabs(cdpUrl = DEFAULT_CDP_URL) {
  return withCdpBrowser(cdpUrl, async (browser) => {
    const { allPages } = await getCdpPage(browser);
    const tabs = [];
    for (let i = 0; i < allPages.length; i++) {
      const p = allPages[i];
      const title = await p.title().catch(() => '');
      tabs.push({ index: i, title, url: p.url() });
    }
    return tabs;
  });
}

/**
 * Extract full readable content + interactive elements from Docker RPA browser page (including iframes)
 */
export async function rpaGetContent(targetMatch = null, cdpUrl = DEFAULT_CDP_URL) {
  return withCdpBrowser(cdpUrl, async (browser) => {
    const { page, index } = await getCdpPage(browser, targetMatch);
    const title = await page.title().catch(() => '');
    const url = page.url();

    // Extract text from main frame + any accessible child frames
    const frameTexts = [];
    const interactiveElements = [];

    const frames = page.frames();
    for (let fIdx = 0; fIdx < frames.length; fIdx++) {
      const frame = frames[fIdx];
      try {
        const frameData = await frame.evaluate(() => {
          const bodyText = document.body ? document.body.innerText.trim() : '';
          const els = Array.from(
            document.querySelectorAll(
              'button, a, input, select, textarea, [role="button"], [role="tab"], [class*="challenge"], [class*="step"], h1, h2, h3'
            )
          );
          const items = els
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none'
              );
            })
            .map((el) => {
              const tag = el.tagName.toLowerCase();
              const text = (
                el.innerText ||
                el.value ||
                el.getAttribute('aria-label') ||
                el.getAttribute('placeholder') ||
                ''
              )
                .replace(/\s+/g, ' ')
                .trim();
              const href = el.getAttribute('href') || '';
              const role = el.getAttribute('role') || '';
              return { tag, text: text.slice(0, 120), href, role };
            })
            .filter((x) => x.text.length > 0);
          return {
            frameUrl: window.location.href,
            bodyText,
            items: items.slice(0, 80)
          };
        });

        if (frameData.bodyText) {
          frameTexts.push(
            frames.length > 1 && fIdx > 0
              ? `--- [Iframe #${fIdx}: ${frameData.frameUrl}] ---\n${frameData.bodyText}`
              : frameData.bodyText
          );
        }
        for (const it of frameData.items) {
          interactiveElements.push({ frameIndex: fIdx, ...it });
        }
      } catch {
        // cross-origin frame that blocked evaluate, ignore
      }
    }

    return {
      tabIndex: index,
      title,
      url,
      text: frameTexts.join('\n\n'),
      interactiveElements: interactiveElements.slice(0, 80)
    };
  });
}

/**
 * Take screenshot from Docker RPA browser
 */
export async function rpaScreenshot(outputPath = 'screenshot.png', targetMatch = null, fullPage = false, cdpUrl = DEFAULT_CDP_URL) {
  return withCdpBrowser(cdpUrl, async (browser) => {
    const { page } = await getCdpPage(browser, targetMatch);
    const resolved = path.resolve(process.cwd(), outputPath);
    await page.screenshot({ path: resolved, fullPage });
    return { path: resolved, url: page.url(), title: await page.title().catch(() => '') };
  });
}

/**
 * Click element in Docker RPA browser (by text or CSS selector, across main page and frames)
 */
export async function rpaClick(selectorOrText, { byText = false, targetMatch = null, cdpUrl = DEFAULT_CDP_URL } = {}) {
  return withCdpBrowser(cdpUrl, async (browser) => {
    const { page } = await getCdpPage(browser, targetMatch);
    const autoByText =
      byText ||
      (!selectorOrText.startsWith('#') &&
        !selectorOrText.startsWith('.') &&
        !selectorOrText.startsWith('[') &&
        !selectorOrText.includes('>') &&
        !selectorOrText.includes(':'));

    let clicked = false;
    const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

    for (const frame of frames) {
      try {
        if (byText) {
          const loc = frame.getByText(selectorOrText, { exact: false }).first();
          if ((await loc.count()) > 0) {
            await loc.click({ timeout: 5000 });
            clicked = true;
            break;
          }
        } else {
          const loc = frame.locator(selectorOrText).first();
          if ((await loc.count()) > 0) {
            await loc.click({ timeout: 5000 });
            clicked = true;
            break;
          } else if (autoByText) {
            const textLoc = frame.getByText(selectorOrText, { exact: false }).first();
            if ((await textLoc.count()) > 0) {
              await textLoc.click({ timeout: 5000 });
              clicked = true;
              break;
            }
          }
        }
      } catch {
        // try next frame
      }
    }

    if (!clicked) {
      throw new Error(`Elemen "${selectorOrText}" tidak ditemukan di halaman (${page.url()}).`);
    }

    await page.waitForTimeout(2000).catch(() => {});
    return {
      url: page.url(),
      title: await page.title().catch(() => '')
    };
  });
}

/**
 * Type/fill text into an input in Docker RPA browser
 */
export async function rpaType(selector, text, { targetMatch = null, cdpUrl = DEFAULT_CDP_URL } = {}) {
  return withCdpBrowser(cdpUrl, async (browser) => {
    const { page } = await getCdpPage(browser, targetMatch);
    const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
    let typed = false;

    for (const frame of frames) {
      try {
        const loc = frame.locator(selector).first();
        if ((await loc.count()) > 0) {
          await loc.fill(text, { timeout: 5000 });
          typed = true;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!typed) {
      throw new Error(`Input selector "${selector}" tidak ditemukan di halaman (${page.url()}).`);
    }

    return { url: page.url(), title: await page.title().catch(() => '') };
  });
}

/**
 * Navigate Docker RPA browser to URL
 */
export async function rpaGoto(targetUrl, { targetMatch = null, cdpUrl = DEFAULT_CDP_URL } = {}) {
  return withCdpBrowser(cdpUrl, async (browser) => {
    const { page } = await getCdpPage(browser, targetMatch);
    const normalized = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`;
    await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500).catch(() => {});
    return { url: page.url(), title: await page.title().catch(() => '') };
  });
}

/**
 * Evaluate JS expression in Docker RPA browser
 */
export async function rpaEval(expression, { targetMatch = null, cdpUrl = DEFAULT_CDP_URL } = {}) {
  return withCdpBrowser(cdpUrl, async (browser) => {
    const { page } = await getCdpPage(browser, targetMatch);
    const result = await page.evaluate(expression);
    return { result, url: page.url() };
  });
}

/**
 * Gather live Docker & RPA context automatically for Antigravity Agent Mode
 */
export async function getDockerAndRpaContext(cwd = process.cwd(), { includeRpaContent = true } = {}) {
  const sections = [];

  // 1. Check running Docker containers
  try {
    const { stdout } = await execAsync(
      'docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"',
      { cwd, timeout: 4000 }
    );
    if (stdout && stdout.trim()) {
      sections.push(`### Running Docker Containers (\`docker ps\`):\n\`\`\`text\n${stdout.trim()}\n\`\`\``);
    }
  } catch {
    // docker not running or unavailable
  }

  // 2. Check cloudflare_url.txt or docker-compose.yml in cwd
  const cfFile = path.join(cwd, 'cloudflare_url.txt');
  if (fs.existsSync(cfFile)) {
    try {
      const cfUrl = fs.readFileSync(cfFile, 'utf8').trim();
      if (cfUrl) {
        sections.push(`### Active Cloudflare Tunnel URL (\`cloudflare_url.txt\`): ${cfUrl}`);
      }
    } catch {
      // ignore
    }
  }

  const composeFile = path.join(cwd, 'docker-compose.yml');
  if (fs.existsSync(composeFile)) {
    try {
      const composeContent = fs.readFileSync(composeFile, 'utf8').trim();
      sections.push(`### \`docker-compose.yml\` in ${cwd}:\n\`\`\`yaml\n${composeContent.slice(0, 2500)}\n\`\`\``);
    } catch {
      // ignore
    }
  }

  // 3. Check if CDP RPA Browser (http://localhost:9222) is active and reachable
  try {
    const tabs = await rpaListTabs(DEFAULT_CDP_URL);
    if (tabs.length > 0) {
      const tabLines = tabs.map((t) => `[${t.index}] ${t.title} -> ${t.url}`).join('\n');
      sections.push(
        `### Browser RPA Docker Aktif (CDP \`${DEFAULT_CDP_URL}\`) — Open Tabs (${tabs.length}):\n\`\`\`text\n${tabLines}\n\`\`\``
      );

      if (includeRpaContent) {
        const pageData = await rpaGetContent(null, DEFAULT_CDP_URL);
        if (pageData && pageData.text) {
          const previewText = formatInteractivePreview(pageData.interactiveElements);
          sections.push(
            `### Konten Layar Browser RPA Saat Ini (Tab [${pageData.tabIndex}]: ${pageData.title} — ${pageData.url}):\n` +
              `\`\`\`text\n${pageData.text.slice(0, 7500)}\n\`\`\`\n` +
              (previewText
                ? `#### Elemen Interaktif di Halaman RPA:\n\`\`\`text\n${previewText}\n\`\`\``
                : '')
          );
        }
      }
    }
  } catch {
    // CDP port 9222 not active right now
  }

  return sections.join('\n\n');
}

function formatInteractivePreview(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return '';
  return elements
    .slice(0, 35)
    .map((e) => `[${e.tag.toUpperCase()}${e.role ? ` role="${e.role}"` : ''}] ${e.text}`)
    .join('\n');
}

/**
 * Pretty-print RPA status in CLI
 */
export async function printRpaDockerStatus(cwd = process.cwd()) {
  console.log(chalk.cyan.bold('\n🤖 Status Docker & Browser RPA (Antigravity Mode):'));
  try {
    const { stdout } = await execAsync(
      'docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"',
      { cwd, timeout: 4000 }
    );
    console.log(chalk.white.bold('\n🐳 Container Docker Aktif:'));
    console.log(stdout.trim() || chalk.gray('  Tidak ada container aktif.'));
  } catch (err) {
    console.log(chalk.red(`  Gagal mengecek Docker: ${err.message}`));
  }

  const cfFile = path.join(cwd, 'cloudflare_url.txt');
  if (fs.existsSync(cfFile)) {
    const cfUrl = fs.readFileSync(cfFile, 'utf8').trim();
    if (cfUrl) {
      console.log(chalk.white.bold('\n🌐 Cloudflare Tunnel GUI Browser: ') + chalk.green.underline(cfUrl));
    }
  }

  try {
    const tabs = await rpaListTabs(DEFAULT_CDP_URL);
    console.log(
      chalk.white.bold(`\n🌏 Browser RPA (CDP ${DEFAULT_CDP_URL}) — ${tabs.length} Tab Terbuka:`)
    );
    for (const t of tabs) {
      console.log(`  ${chalk.yellow(`[${t.index}]`)} ${chalk.bold(t.title || '(Tanpa Judul)')} -> ${chalk.cyan(t.url)}`);
    }
  } catch {
    console.log(
      chalk.yellow(`\n⚠ Browser RPA CDP (${DEFAULT_CDP_URL}) belum terhubung atau tidak aktif.`)
    );
  }
  console.log('');
}
