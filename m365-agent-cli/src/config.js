import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const APP_NAME = 'm365-copilot-cli';
export const DEFAULT_COPILOT_URL = 'https://m365.cloud.microsoft/chat';

export const CONFIG_DIR = process.env.M365_CLI_CONFIG_DIR || path.join(os.homedir(), '.config', APP_NAME);
export const PROFILE_DIR = path.join(CONFIG_DIR, 'browser-profile');
export const STATE_FILE = path.join(CONFIG_DIR, 'storage-state.json');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');
export const RULES_FILE = path.join(CONFIG_DIR, 'MEMORY.md');
export const SKILLS_DIR = path.join(CONFIG_DIR, 'skills');

export function ensureDirectories() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig() {
  ensureDirectories();
  const defaults = {
    url: DEFAULT_COPILOT_URL,
    headless: true,
    timeoutMs: 120000,
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  };
  if (!fs.existsSync(CONFIG_FILE)) {
    return defaults;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...defaults, ...raw };
  } catch {
    return defaults;
  }
}

export function saveConfig(partial) {
  const current = loadConfig();
  const next = { ...current, ...partial };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function hasSavedSession() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (Array.isArray(state.cookies) && state.cookies.length > 0) {
        return true;
      }
    } catch {
      // ignore parse error
    }
  }
  if (fs.existsSync(PROFILE_DIR)) {
    try {
      const entries = fs.readdirSync(PROFILE_DIR);
      return entries.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

export function getSessionInfo() {
  const info = {
    hasStateFile: fs.existsSync(STATE_FILE),
    hasProfileDir: fs.existsSync(PROFILE_DIR) && fs.readdirSync(PROFILE_DIR).length > 0,
    cookieCount: 0,
    microsoftCookies: 0,
    domains: [],
    updatedAt: null
  };

  if (info.hasStateFile) {
    try {
      const stat = fs.statSync(STATE_FILE);
      info.updatedAt = stat.mtime.toISOString();
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      const cookies = state.cookies || [];
      info.cookieCount = cookies.length;
      const msDomains = new Set();
      for (const c of cookies) {
        if (
          c.domain &&
          (c.domain.includes('microsoft') ||
            c.domain.includes('office') ||
            c.domain.includes('live.com') ||
            c.domain.includes('bing.com') ||
            c.domain.includes('sharepoint'))
        ) {
          info.microsoftCookies++;
          msDomains.add(c.domain.replace(/^\./, ''));
        }
      }
      info.domains = Array.from(msDomains);
    } catch {
      // ignore
    }
  }
  return info;
}

export function clearSession() {
  if (fs.existsSync(STATE_FILE)) {
    fs.rmSync(STATE_FILE, { force: true });
  }
  if (fs.existsSync(PROFILE_DIR)) {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  }
}

export function appendHistory(entry) {
  ensureDirectories();
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {
      history = [];
    }
  }
  history.push({
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (history.length > 100) {
    history = history.slice(-100);
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), { mode: 0o600 });
}

export function getHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

export function loadLearnedRules(cwd = process.cwd()) {
  ensureDirectories();
  const rules = [];
  if (fs.existsSync(RULES_FILE)) {
    try {
      const content = fs.readFileSync(RULES_FILE, 'utf8').trim();
      if (content) rules.push(content);
    } catch {
      // ignore
    }
  }
  const projectInstructionFiles = [
    'M365.md',
    'CLAUDE.md',
    'AGENTS.md',
    path.join('.m365', 'rules.md'),
    path.join('.agents', 'rules.md')
  ];
  for (const relFile of projectInstructionFiles) {
    const fullPath = path.join(cwd, relFile);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8').trim();
        if (content) {
          rules.push(`### Project Instructions (${relFile}):\n${content.slice(0, 4000)}`);
        }
      } catch {
        // ignore
      }
    }
  }
  return rules.join('\n\n');
}

export function addLearnedRule(ruleText) {
  ensureDirectories();
  const timestamp = new Date().toISOString().slice(0, 10);
  const line = `- [${timestamp}] ${ruleText.trim()}\n`;
  if (!fs.existsSync(RULES_FILE)) {
    fs.writeFileSync(
      RULES_FILE,
      `# Andi Pangeran M365 CLI - Learned Rules & Memory\n\n${line}`,
      { mode: 0o600 }
    );
  } else {
    fs.appendFileSync(RULES_FILE, line, 'utf8');
  }
  return RULES_FILE;
}

export function clearLearnedRules() {
  if (fs.existsSync(RULES_FILE)) {
    fs.rmSync(RULES_FILE, { force: true });
  }
}

export function listSkills() {
  ensureDirectories();
  const skills = [];
  const scanDir = (dir, scope) => {
    if (!fs.existsSync(dir)) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const skillMd = path.join(dir, entry.name, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            skills.push({ name: entry.name, scope, path: skillMd });
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          skills.push({
            name: entry.name.replace(/\.md$/i, ''),
            scope,
            path: path.join(dir, entry.name)
          });
        }
      }
    } catch {
      // ignore
    }
  };
  scanDir(SKILLS_DIR, 'global');
  scanDir(path.join(process.cwd(), '.m365', 'skills'), 'workspace');
  scanDir(path.join(process.cwd(), '.agents', 'skills'), 'agy-workspace');
  return skills;
}
