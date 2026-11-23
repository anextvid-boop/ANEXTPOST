const {
  app,
  BrowserWindow,
  Notification,
  clipboard,
  ipcMain,
  net,
  screen,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_UI_URL,
  LIVE_UI_URL,
  exportDiagnostics,
  isValidHttpUrl,
  loadDesktopConfig,
  loadWindowState,
  recordLog,
  saveTargetUrl,
  saveWindowState,
} = require('./desktop-config');
const { buildAppMenu, createAppTray } = require('./menu');
const { initAutoUpdater } = require('./updater');

const APP_NAME = 'ANEXTPOST';
const PROTOCOL = 'anextpost';
const PRELOAD_PATH = path.resolve(__dirname, 'preload.js');
const ERROR_HTML_PATH = path.resolve(__dirname, 'error.html');
const VERIFY_AND_EXIT = process.env.ANEXTPOST_VERIFY_EXIT === '1';

// Cap V8 heap in renderer/main helper contexts for long-running sessions.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1024');

let mainWindow = null;
let trayHandle = null;
let updaterHandle = null;
let currentTargetUrl = DEFAULT_UI_URL;
let isOnErrorPage = false;
let pendingDeepLink = null;
let pendingOpenFiles = [];
let networkPollTimer = null;
let lastOnlineState = true;
let isQuitting = false;

function log(message, ...args) {
  const text = [message, ...args].map(String).join(' ');
  recordLog('info', text);
  console.log(`[${APP_NAME} Electron] ${text}`);
}

function logError(message, ...args) {
  const text = [message, ...args].map(String).join(' ');
  recordLog('error', text);
  console.error(`[${APP_NAME} Electron] ${text}`);
}

function validatePaths() {
  for (const requiredPath of [PRELOAD_PATH, ERROR_HTML_PATH]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Missing required Electron file at ${requiredPath}`);
    }
    if (!fs.statSync(requiredPath).isFile()) {
      throw new Error(`Expected file but found non-file: ${requiredPath}`);
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildLaunchPage() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(APP_NAME)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #0B1220;
      color: #F3F6FA;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .splash {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      animation: fadeIn 220ms ease-out both;
    }
    .wordmark {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0.16em;
      color: #F3F6FA;
    }
    .bar {
      width: 44px;
      height: 3px;
      border-radius: 999px;
      background: linear-gradient(90deg, #0A66C2, #3B82F6);
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .splash { animation: none; }
    }
  </style>
</head>
<body>
  <div class="splash" role="status" aria-label="Loading ANEXTPOST">
    <div class="wordmark">ANEXTPOST</div>
    <div class="bar"></div>
  </div>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function navigateToRoute(routePath) {
  if (typeof routePath !== 'string' || !routePath.startsWith('/')) {
    throw new Error('Navigation route must start with "/"');
  }
  const cleanOrigin = new URL(currentTargetUrl).origin;
  const destination = `${cleanOrigin}${routePath}`;
  showMainWindow();
  isOnErrorPage = false;
  mainWindow.loadURL(destination).catch((err) => logError('Navigate loadURL failed:', err.message));
}

function loadTargetUrl(url = currentTargetUrl) {
  if (!isValidHttpUrl(url)) {
    throw new Error('Target URL must start with http:// or https://');
  }
  currentTargetUrl = url;
  isOnErrorPage = false;
  if (trayHandle) trayHandle.refreshMenu();
  showMainWindow();
  mainWindow.loadURL(currentTargetUrl).catch((err) => logError('loadURL rejected:', err.message));
}

function showErrorScreen(title, details, nextAction) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isOnErrorPage = true;
  if (trayHandle) trayHandle.refreshMenu();
  mainWindow
    .loadFile(ERROR_HTML_PATH, {
      query: { title, details, nextAction },
    })
    .catch((err) => logError('Failed to render error.html:', err.message));
  mainWindow.show();
  mainWindow.focus();
}

function handleDeepLink(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith(`${PROTOCOL}://`)) return;
  log(`Received deep link: ${rawUrl}`);
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingDeepLink = rawUrl;
    return;
  }
  showMainWindow();
  try {
    const parsed = new URL(rawUrl);
    const route = `/${[parsed.hostname, parsed.pathname.replace(/^\/+/, '')]
      .filter(Boolean)
      .join('/')}${parsed.search}`;
    if (route && route !== '/') {
      navigateToRoute(route);
    }
    mainWindow.webContents.send('desktop:deep-link', { url: rawUrl, route });
  } catch (err) {
    logError('Malformed deep link:', err.message);
  }
}

function handleOpenFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return;
  log(`Received open-file: ${filePath}`);
  if (!mainWindow || mainWindow.isDestroyed() || isOnErrorPage) {
    pendingOpenFiles.push(filePath);
    return;
  }
  showMainWindow();
  mainWindow.webContents.send('desktop:open-file', { path: filePath });
}

function runDiagnosticsExport() {
  const outPath = exportDiagnostics(app.getPath('userData'), {
    appName: APP_NAME,
    appVersion: app.getVersion(),
    targetUrl: currentTargetUrl,
    isOnline: net.isOnline(),
    isOnErrorPage,
  });
  log(`Exported diagnostics bundle to ${outPath}`);
  shell.showItemInFolder(outPath);
  return { path: outPath };
}

function registerIpcHandlers() {
  ipcMain.handle('desktop:get-app-info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    targetUrl: currentTargetUrl,
    isOnline: net.isOnline(),
  }));

  ipcMain.handle('desktop:get-target-url', () => currentTargetUrl);

  ipcMain.handle('desktop:set-target-url', (_event, url) => {
    const saved = saveTargetUrl(app.getPath('userData'), url);
    log(`Updated target URL to ${saved}`);
    loadTargetUrl(saved);
    return saved;
  });

  ipcMain.handle('desktop:navigate', (_event, routePath) => {
    navigateToRoute(routePath);
    return true;
  });

  ipcMain.handle('desktop:retry-load', () => {
    loadTargetUrl(currentTargetUrl);
    return true;
  });

  ipcMain.handle('desktop:copy-text', (_event, text) => {
    if (typeof text !== 'string') {
      throw new Error('copyText requires a string');
    }
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle('desktop:notify', (_event, options) => {
    if (!options || typeof options.title !== 'string') {
      throw new Error('showNotification requires { title }');
    }
    if (!Notification.isSupported()) return false;
    const notification = new Notification({
      title: options.title,
      body: typeof options.body === 'string' ? options.body : '',
    });
    notification.on('click', () => {
      if (typeof options.routePath === 'string' && options.routePath.startsWith('/')) {
        navigateToRoute(options.routePath);
      } else {
        showMainWindow();
      }
    });
    notification.show();
    return true;
  });

  ipcMain.handle('desktop:set-badge-count', (_event, count) => {
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    if (typeof app.setBadgeCount === 'function') {
      app.setBadgeCount(safeCount);
    }
    return safeCount;
  });

  ipcMain.handle('desktop:export-diagnostics', () => runDiagnosticsExport());
}

function startNetworkMonitor() {
  if (networkPollTimer) return;
  lastOnlineState = net.isOnline();
  networkPollTimer = setInterval(() => {
    const online = net.isOnline();
    if (online !== lastOnlineState) {
      lastOnlineState = online;
      log(`Network status changed: ${online ? 'online' : 'offline'}`);
      if (trayHandle) trayHandle.refreshMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop:network-status', { online });
        if (online && isOnErrorPage) {
          loadTargetUrl(currentTargetUrl);
        }
      }
    }
  }, 5000);
}

function createMainWindow() {
  validatePaths();
  const userDataDir = app.getPath('userData');
  const config = loadDesktopConfig(userDataDir, app.isPackaged ? LIVE_UI_URL : DEFAULT_UI_URL);
  currentTargetUrl = config.targetUrl;
  const savedState = loadWindowState(userDataDir, screen);

  log(`Creating main window. Preload: ${PRELOAD_PATH}`);
  log(`Target scheduler UI URL: ${currentTargetUrl}`);

  const windowOptions = {
    width: savedState.width,
    height: savedState.height,
    ...(typeof savedState.x === 'number' && typeof savedState.y === 'number'
      ? { x: savedState.x, y: savedState.y }
      : {}),
    minWidth: 840,
    minHeight: 640,
    title: APP_NAME,
    show: false,
    backgroundColor: '#0B1220',
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  };

  mainWindow = new BrowserWindow(windowOptions);
  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  const preloadErrors = [];
  let verifyRunning = false;
  let splashHandedOff = false;

  const persistBounds = () => saveWindowState(userDataDir, mainWindow);
  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);
  mainWindow.on('maximize', persistBounds);
  mainWindow.on('unmaximize', persistBounds);

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    const msg = `${preloadPath}: ${error && error.stack ? error.stack : error}`;
    preloadErrors.push(msg);
    logError('Preload error:', msg);
  });

  mainWindow.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      log(`[Renderer ${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logError('Renderer process gone:', JSON.stringify(details));
    if (VERIFY_AND_EXIT) {
      app.exit(1);
      return;
    }
    showErrorScreen(
      'ANEXTPOST Renderer Crashed',
      `The renderer process exited unexpectedly (reason: ${details.reason}, exitCode: ${details.exitCode}).`,
      'Click "Retry Connection" to reload the app, or export diagnostics if this repeats.'
    );
  });

  mainWindow.once('ready-to-show', () => {
    log('Window ready-to-show; presenting window.');
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
    if (process.env.ANEXTPOST_DEVTOOLS === '1' && !VERIFY_AND_EXIT) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  function isScreenReady(probe) {
    return Boolean(
      probe &&
      probe.hasDesktopBridge &&
      probe.pathname &&
      probe.pathname !== '/' &&
      probe.hasFormOrMain &&
      probe.bodyTextLength > 0 &&
      probe.bodySample !== 'Loading…' &&
      probe.bodySample !== 'Loading...'
    );
  }

  mainWindow.webContents.on('did-finish-load', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const loadedUrl = mainWindow.webContents.getURL();
    if (loadedUrl.startsWith('data:text/html')) {
      if (!splashHandedOff && loadedUrl.includes('ANEXTPOST')) {
        splashHandedOff = true;
        mainWindow.loadURL(currentTargetUrl).catch((err) => {
          logError('loadURL rejected:', err.message);
        });
      }
      return;
    }

    if (!loadedUrl.startsWith('file://')) {
      isOnErrorPage = false;
      if (trayHandle) trayHandle.refreshMenu();
      log(`Loaded URL: ${loadedUrl}`);

      if (pendingDeepLink) {
        const dl = pendingDeepLink;
        pendingDeepLink = null;
        handleDeepLink(dl);
      }
      while (pendingOpenFiles.length > 0) {
        const fp = pendingOpenFiles.shift();
        mainWindow.webContents.send('desktop:open-file', { path: fp });
      }
    }

    if (VERIFY_AND_EXIT && !verifyRunning) {
      verifyRunning = true;
      try {
        let probe = null;
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          if (!mainWindow || mainWindow.isDestroyed()) break;
          try {
            probe = await mainWindow.webContents.executeJavaScript(`({
              url: window.location.href,
              pathname: window.location.pathname,
              title: document.title,
              bodyTextLength: (document.body && document.body.innerText ? document.body.innerText.trim().length : 0),
              bodySample: (document.body && document.body.innerText ? document.body.innerText.trim().replace(/\\s+/g, ' ').slice(0, 220) : ''),
              hasFormOrMain: Boolean(document.querySelector('form, main, [data-testid], input[type="email"], input[type="password"]')),
              nextjsOverlay: (() => {
                const p = document.querySelector('nextjs-portal');
                return p && p.shadowRoot ? p.shadowRoot.textContent.replace(/\\s+/g, ' ').trim().slice(0, 300) : null;
              })(),
              hasDesktopBridge: Boolean(window.anextpostDesktop && window.anextpostDesktop.isElectron),
              desktopVersions: (window.anextpostDesktop ? window.anextpostDesktop.versions : null)
            })`);
            if (isScreenReady(probe)) {
              break;
            }
          } catch (_navErr) {
            // Frame may be mid-navigation during client redirect (/ -> /calendar -> /login).
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        log('Verification probe:', JSON.stringify({ ...probe, preloadErrors }));
        if (preloadErrors.length > 0 || !isScreenReady(probe)) {
          logError('Verification failed: preload error or screen did not reach ready state.');
          app.exit(1);
          return;
        }
        app.exit(0);
      } catch (err) {
        logError('Verification probe failed:', err);
        app.exit(1);
      }
    }
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // Ignore ERR_ABORTED (-3), which occurs during normal client/server redirects.
      if (!isMainFrame || errorCode === -3) return;
      logError(`Main frame failed to load ${validatedURL} (code ${errorCode}): ${errorDescription}`);
      if (VERIFY_AND_EXIT) {
        app.exit(1);
        return;
      }
      showErrorScreen(
        'Unable to load ANEXTPOST Scheduler UI',
        `Failed to load ${validatedURL} (${errorDescription}, code ${errorCode}).`,
        'Run "pnpm run dev:desktop" locally, or switch to your live ANEXTPOST URL below.'
      );
    }
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url).catch((err) => logError('Failed to open external URL:', err.message));
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', () => {
    persistBounds();
  });

  mainWindow.on('closed', () => {
    log('Main window closed.');
    mainWindow = null;
  });

  mainWindow.loadURL(buildLaunchPage()).catch((err) => {
    logError('Splash loadURL rejected:', err.message);
  });
}

function createProjectWindow() {
  validatePaths();
  const partition = `persist:anextpost-project-${Date.now()}`;
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 840,
    minHeight: 640,
    title: `${APP_NAME} — Project Window`,
    show: false,
    backgroundColor: '#0B1220',
    webPreferences: {
      preload: PRELOAD_PATH,
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url).catch((err) => logError('Failed to open external URL:', err.message));
    }
    return { action: 'deny' };
  });
  win.loadURL(currentTargetUrl).catch((err) => logError('Project window loadURL failed:', err.message));
  return win;
}

const gotSingleInstanceLock = VERIFY_AND_EXIT ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    showMainWindow();
    const deepLinkArg = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (deepLinkArg) handleDeepLink(deepLinkArg);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    handleOpenFile(filePath);
  });

  app.setName(APP_NAME);
  if (!app.isDefaultProtocolClient(PROTOCOL)) {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  app.whenReady()
    .then(() => {
      log(`App ready (platform=${process.platform}, electron=${process.versions.electron})`);
      registerIpcHandlers();
      updaterHandle = initAutoUpdater({ app, log, logError });

      if (!VERIFY_AND_EXIT) {
        buildAppMenu({
          appName: APP_NAME,
          onNavigate: (route) => navigateToRoute(route),
          onNewProjectWindow: () => createProjectWindow(),
          onReload: () => loadTargetUrl(currentTargetUrl),
          onCommandPalette: () => {
            showMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('desktop:shortcut', { action: 'command-palette' });
            }
          },
          onSwitchToLive: () => {
            const saved = saveTargetUrl(app.getPath('userData'), 'https://anextpost.com');
            loadTargetUrl(saved);
          },
          onSwitchToLocal: () => {
            const saved = saveTargetUrl(app.getPath('userData'), DEFAULT_UI_URL);
            loadTargetUrl(saved);
          },
          onExportDiagnostics: () => runDiagnosticsExport(),
          onCheckUpdates: () => updaterHandle.checkForUpdates(true),
        });

        trayHandle = createAppTray({
          appName: APP_NAME,
          getTargetUrl: () => currentTargetUrl,
          getStatusLabel: () => (isOnErrorPage ? 'Offline / Retrying' : net.isOnline() ? 'Connected' : 'Offline'),
          onShowWindow: () => showMainWindow(),
          onNavigate: (route) => navigateToRoute(route),
          onReload: () => loadTargetUrl(currentTargetUrl),
          onExportDiagnostics: () => runDiagnosticsExport(),
          onQuit: () => {
            isQuitting = true;
            app.quit();
          },
        });

        startNetworkMonitor();
      }

      createMainWindow();

      app.on('activate', () => {
        showMainWindow();
      });
    })
    .catch((err) => {
      logError('Fatal startup error:', err);
      app.exit(1);
    });

  app.on('before-quit', () => {
    isQuitting = true;
    if (networkPollTimer) {
      clearInterval(networkPollTimer);
      networkPollTimer = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || isQuitting) {
      app.quit();
    }
  });
}
