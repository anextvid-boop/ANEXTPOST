const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_UI_URL = 'http://localhost:4200';
const LIVE_UI_URL = 'https://anextpost.com';
const DEFAULT_WINDOW_STATE = {
  width: 1280,
  height: 840,
  isMaximized: false,
};
const MAX_LOG_LINES = 500;

const logBuffer = [];

function recordLog(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.shift();
  }
}

function getLogHistory() {
  return [...logBuffer];
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    return true;
  } catch (err) {
    recordLog('error', `Failed writing ${filePath}: ${err.message}`);
    return false;
  }
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getConfigPath(userDataDir) {
  return path.join(userDataDir, 'desktop-config.json');
}

function loadDesktopConfig(userDataDir, fallbackUrl = DEFAULT_UI_URL) {
  const saved = readJsonSafe(getConfigPath(userDataDir), {});
  const envUrl = process.env.ANEXTPOST_UI_URL;
  const targetUrl = isValidHttpUrl(envUrl)
    ? envUrl.trim()
    : isValidHttpUrl(saved.targetUrl)
      ? saved.targetUrl.trim()
      : fallbackUrl;
  return {
    targetUrl,
    customTargetUrl: isValidHttpUrl(saved.targetUrl) ? saved.targetUrl.trim() : null,
  };
}

function saveTargetUrl(userDataDir, url) {
  if (!isValidHttpUrl(url)) {
    throw new Error('Target URL must start with http:// or https://');
  }
  const normalized = new URL(url.trim()).toString().replace(/\/$/, '');
  const configPath = getConfigPath(userDataDir);
  const current = readJsonSafe(configPath, {});
  const ok = writeJsonSafe(configPath, { ...current, targetUrl: normalized });
  if (!ok) {
    throw new Error('Failed to persist desktop-config.json');
  }
  return normalized;
}

function getWindowStatePath(userDataDir) {
  return path.join(userDataDir, 'window-state.json');
}

function isWithinAnyDisplay(bounds, displays) {
  if (!Array.isArray(displays) || displays.length === 0) return true;
  if (typeof bounds.x !== 'number' || typeof bounds.y !== 'number') return false;
  const minVisible = 100;
  return displays.some((d) => {
    const area = d.workArea;
    if (!area) return false;
    const overlapX =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return overlapX >= minVisible && overlapY >= minVisible;
  });
}

function loadWindowState(userDataDir, screen) {
  const saved = readJsonSafe(getWindowStatePath(userDataDir), {});
  const width =
    typeof saved.width === 'number' && saved.width >= 840 ? Math.round(saved.width) : DEFAULT_WINDOW_STATE.width;
  const height =
    typeof saved.height === 'number' && saved.height >= 640 ? Math.round(saved.height) : DEFAULT_WINDOW_STATE.height;
  const isMaximized = Boolean(saved.isMaximized);

  const candidate = { x: saved.x, y: saved.y, width, height, isMaximized };
  const displays = screen ? screen.getAllDisplays() : [];
  if (!isWithinAnyDisplay(candidate, displays)) {
    return { width, height, isMaximized };
  }
  return candidate;
}

function saveWindowState(userDataDir, win) {
  if (!win || win.isDestroyed()) return;
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
  writeJsonSafe(getWindowStatePath(userDataDir), {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  });
}

function exportDiagnostics(userDataDir, metadata = {}) {
  const diagDir = path.join(userDataDir, 'diagnostics');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(diagDir, `anextpost-diagnostics-${stamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
    memoryUsage: process.memoryUsage(),
    ...metadata,
    logs: getLogHistory(),
  };
  if (!writeJsonSafe(outPath, payload)) {
    throw new Error('Unable to write diagnostics bundle');
  }
  return outPath;
}

module.exports = {
  DEFAULT_UI_URL,
  LIVE_UI_URL,
  exportDiagnostics,
  getLogHistory,
  isValidHttpUrl,
  loadDesktopConfig,
  loadWindowState,
  recordLog,
  saveTargetUrl,
  saveWindowState,
};
