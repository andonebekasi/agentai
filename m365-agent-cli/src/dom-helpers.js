/**
 * Helper functions for interacting with https://m365.cloud.microsoft/chat
 * across main document, iframes, Shadow DOM, and SignalR/SSE streams.
 */

export const CHAT_INPUT_SELECTORS = [
  '#m365-chat-editor-target-element',
  '[data-testid="chat-input"]',
  '[data-testid="bizchat-input"]',
  '[data-testid="composer-input"]',
  'textarea[aria-label*="Copilot" i]',
  'textarea[placeholder*="Copilot" i]',
  'textarea[placeholder*="Message" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Tanyakan" i]',
  'textarea[placeholder*="Ketik" i]',
  'div[contenteditable="true"][aria-label*="Copilot" i]',
  'div[contenteditable="true"][aria-label*="Message" i]',
  'div[contenteditable="true"][aria-label*="chat" i]',
  'div[contenteditable="true"][role="textbox"]',
  '[role="textbox"][contenteditable="true"]',
  '#userInput',
  '#searchbox',
  'textarea'
];

export const SEND_BUTTON_SELECTORS = [
  'button.fai-SendButton',
  'button[data-testid="send-button"]',
  'button[data-testid="submit-button"]',
  'button[aria-label*="Send" i]',
  'button[aria-label*="Submit" i]',
  'button[aria-label*="Kirim" i]',
  'button[title*="Send" i]',
  'button[title*="Kirim" i]',
  'button[type="submit"]'
];

/**
 * Clean M365 Copilot internal citation markers (\ue200cite...\ue201) and entity XML tags (<Person>, <Event>, etc.)
 */
export function cleanCopilotText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/\ue200[\s\S]*?\ue201/g, '')
    .replace(/<\/?(?:Person|Organization|Event|Location|Product|Work|Topic|Entity)(?:\s[^>]*)?>/gi, '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Detect if M365 Copilot returned a topic guardrail refusal / thread disengagement response
 */
export function isCopilotRefusal(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  return (
    /sorry,?\s+it looks like i can'?t chat about this/i.test(clean) ||
    /let'?s try a different topic/i.test(clean) ||
    /maaf,?\s+sepertinya saya tidak (?:bisa|dapat) membahas/i.test(clean) ||
    /i'?m sorry,?\s+i can'?t continue this conversation/i.test(clean)
  );
}

export function isLoginUrl(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('login.microsoftonline.com') ||
    lower.includes('login.live.com') ||
    lower.includes('login.windows.net') ||
    lower.includes('account.live.com') ||
    lower.includes('device.login.microsoftonline.com') ||
    lower.includes('/common/oauth2/')
  );
}

/**
 * Searches main frame and all child frames (including piercing Shadow DOM via Playwright locators)
 * for an active, visible chat input box.
 */
export async function findChatInputAcrossFrames(page) {
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

  for (const frame of frames) {
    try {
      const frameUrl = frame.url();
      if (!frameUrl || frameUrl === 'about:blank' || isLoginUrl(frameUrl)) {
        continue;
      }

      for (const selector of CHAT_INPUT_SELECTORS) {
        try {
          const locator = frame.locator(selector).first();
          const count = await locator.count();
          if (count > 0 && (await locator.isVisible())) {
            return { frame, locator, selector };
          }
        } catch {
          // try next selector
        }
      }
    } catch {
      // frame might have detached
    }
  }
  return null;
}

/**
 * Sends a prompt into the discovered chat input box and submits it.
 */
export async function submitPromptToInput(inputTarget, promptText) {
  const { frame, locator } = inputTarget;
  const page = frame.page();

  // If a previous generation is still active ("Stop" button visible), stop it first so Send button is available
  try {
    const stopBtn = frame.locator('button[aria-label*="Stop" i], button[aria-label*="Hentikan" i]').first();
    if ((await stopBtn.count()) > 0 && (await stopBtn.isVisible())) {
      await stopBtn.click({ timeout: 2000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    // ignore
  }

  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 5000 });

  const tagName = await locator
    .evaluate((el) => el.tagName.toLowerCase())
    .catch(() => 'div');

  if (tagName === 'textarea' || tagName === 'input') {
    await locator.fill(promptText);
  } else {
    // Reliably clear Lexical / Fluent UI contenteditable editor before inserting new prompt
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await locator
      .evaluate((el) => {
        el.focus();
        if (el.innerText && el.innerText.trim().length > 0) {
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
        }
      })
      .catch(() => {});

    // Use insertText so React/Lexical state updates properly without premature Enter submission
    await page.keyboard.insertText(promptText);
  }

  // Wait until M365 Copilot's Chathub/SignalR connection enables the Send button (up to 8s on cold start)
  const waitStart = Date.now();
  let sendClicked = false;
  while (Date.now() - waitStart < 8000) {
    await new Promise((r) => setTimeout(r, 300));
    for (const btnSelector of SEND_BUTTON_SELECTORS) {
      try {
        const btn = frame.locator(btnSelector).first();
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          const isDisabled = await btn.evaluate(
            (b) => Boolean(b.disabled || b.getAttribute('aria-disabled') === 'true')
          );
          if (!isDisabled) {
            await btn.click();
            sendClicked = true;
            break;
          }
        }
      } catch {
        // ignore
      }
    }
    if (sendClicked) {
      break;
    }
    // Nudge Lexical editor state with a space + Backspace so it re-evaluates Send button readiness
    try {
      await page.keyboard.type(' ');
      await page.keyboard.press('Backspace');
    } catch {
      // ignore
    }
  }

  if (!sendClicked) {
    await locator.press('Enter').catch(() => {});
  }

  // Verify editor actually emptied (message submitted). If text is still sitting in editor after 800ms, press Enter / click Send again
  await new Promise((r) => setTimeout(r, 600));
  const remainingLen = await locator
    .evaluate((el) => (el.innerText || el.value || '').trim().length)
    .catch(() => 0);
  if (remainingLen > 10) {
    for (const btnSelector of SEND_BUTTON_SELECTORS) {
      try {
        const btn = frame.locator(btnSelector).first();
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await btn.click({ timeout: 1500 });
          break;
        }
      } catch {
        // ignore
      }
    }
    await locator.press('Enter').catch(() => {});
  }
}

/**
 * Extracts all rendered assistant messages and generation status across all frames in the page.
 */
export async function getConversationSnapshot(page) {
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
  const allMessages = [];
  let isGenerating = false;

  for (const frame of frames) {
    try {
      const frameUrl = frame.url();
      if (!frameUrl || frameUrl === 'about:blank') continue;

      const frameResult = await frame.evaluate(() => {
        // Recursive shadow DOM query helper
        function queryAllDeep(selector, root = document) {
          const results = Array.from(root.querySelectorAll(selector));
          const allNodes = root.querySelectorAll('*');
          for (const node of allNodes) {
            if (node.shadowRoot) {
              results.push(...queryAllDeep(selector, node.shadowRoot));
            }
          }
          return results;
        }

        // Check if "Stop generating" / "Stop responding" button is visible
        const stopSelectors = [
          'button[aria-label*="Stop" i]',
          'button[aria-label*="Hentikan" i]',
          'button[data-testid*="stop" i]',
          '[data-testid="stop-generating-button"]'
        ];
        let generating = false;
        for (const sel of stopSelectors) {
          const btns = queryAllDeep(sel);
          if (btns.some((b) => b.offsetParent !== null && !b.disabled)) {
            generating = true;
            break;
          }
        }

        // Candidate selectors for M365 Copilot / BizChat / Sydney assistant message containers
        // Prioritize `.fai-CopilotMessage__content` and `[data-testid="copilot-message-reply-div"]` to avoid follow-up chips
        const messageSelectors = [
          '.fai-CopilotMessage__content',
          '[data-testid="copilot-message-reply-div"]',
          '[data-testid="copilot-message"]',
          '[data-testid="bot-message"]',
          '[data-testid="assistant-message"]',
          '[data-testid*="chat-message-assistant"]',
          '[data-author="bot"]',
          '[data-content="ai-message"]',
          '.fai-CopilotMessage',
          '.cib-message-main[type="bot"]',
          'div[class*="CopilotMessage"]',
          'div[class*="botMessage"]',
          'div[class*="assistantMessage"]',
          'div[role="article"]',
          'div[role="region"][aria-label*="Copilot" i]'
        ];

        const texts = [];
        for (const sel of messageSelectors) {
          const nodes = queryAllDeep(sel);
          for (const node of nodes) {
            const rawText = (node.innerText || '').trim();
            if (!rawText || rawText.length <= 1) continue;
            if (/^(you said|anda berkata)\s*:/i.test(rawText)) continue;
            const cleaned = rawText.replace(/^(copilot said|copilot berkata)\s*:\s*/i, '').trim();
            if (cleaned && cleaned.length > 0) {
              texts.push(cleaned);
            }
          }
          if (texts.length > 0) break;
        }

        return { texts, generating };
      });

      if (frameResult.generating) {
        isGenerating = true;
      }
      if (frameResult.texts && frameResult.texts.length > 0) {
        allMessages.push(...frameResult.texts);
      }
    } catch {
      // ignore detached frame
    }
  }

  const cleanedMessages = allMessages.map((m) => cleanCopilotText(m)).filter(Boolean);

  return {
    messages: cleanedMessages,
    lastMessage: cleanedMessages.length > 0 ? cleanedMessages[cleanedMessages.length - 1] : '',
    count: cleanedMessages.length,
    isGenerating
  };
}

const IGNORED_SIGNALR_MESSAGE_TYPES = new Set([
  'internalsearchquery',
  'internalsearchresult',
  'internalloadermessage',
  'rendercardrequest',
  'generatinganswers',
  'searchquery',
  'loader',
  'suggestedresponses',
  ' truthfulness',
  ' diagnostics'
]);

/**
 * Parses SignalR WebSocket frames used by M365 Copilot (`\x1e` delimited JSON objects).
 * Extracts streaming text and completion status.
 */
export function parseSignalRPayload(rawPayload) {
  if (typeof rawPayload !== 'string' || !rawPayload.trim()) {
    return [];
  }

  const events = [];
  const parts = rawPayload.split('\x1e').filter(Boolean);

  for (const part of parts) {
    try {
      const data = JSON.parse(part);

      // SignalR Type 1: Streaming invocation update
      if (data.type === 1 && Array.isArray(data.arguments)) {
        for (const arg of data.arguments) {
          const isDisengagedCursor = Boolean(arg?.cursor?.isDisengaged || arg?.isDisengaged);
          if (Array.isArray(arg?.messages)) {
            for (const msg of arg.messages) {
              const author = (msg.author || msg.sender || 'bot').toLowerCase();
              const msgType = String(msg.messageType || '').toLowerCase().trim();
              if (author !== 'user' && msg.text && !IGNORED_SIGNALR_MESSAGE_TYPES.has(msgType)) {
                const isDisengaged = isDisengagedCursor || msgType === 'disengaged' || isCopilotRefusal(msg.text);
                events.push({
                  type: isDisengaged ? 'complete' : 'update',
                  text: cleanCopilotText(msg.text),
                  disengaged: isDisengaged
                });
              }
            }
          } else if (typeof arg?.text === 'string' && arg.text.length > 0) {
            events.push({
              type: 'update',
              text: cleanCopilotText(arg.text),
              disengaged: isCopilotRefusal(arg.text)
            });
          }
        }
      }

      // SignalR Type 2: Final invocation result
      if (data.type === 2 && data.item) {
        const messages = data.item.messages || [];
        const resultValue = String(data.item.result?.value || '').toLowerCase();
        let bestText = data.item.result?.message || '';
        let disengaged = resultValue === 'disengaged' || resultValue === 'throttled';
        for (const msg of messages) {
          const author = (msg.author || 'bot').toLowerCase();
          const msgType = String(msg.messageType || '').toLowerCase().trim();
          if (author !== 'user' && msg.text && !IGNORED_SIGNALR_MESSAGE_TYPES.has(msgType)) {
            bestText = msg.text;
            if (msgType === 'disengaged') disengaged = true;
          }
        }
        const cleaned = cleanCopilotText(bestText);
        if (isCopilotRefusal(cleaned)) disengaged = true;
        events.push({
          type: 'complete',
          text: cleaned,
          disengaged
        });
      }
    } catch {
      // Not valid JSON or binary frame
    }
  }

  return events;
}
