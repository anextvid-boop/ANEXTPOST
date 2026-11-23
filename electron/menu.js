const { Menu, Tray, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function buildAppMenu({
  appName,
  onNavigate,
  onNewProjectWindow,
  onReload,
  onCommandPalette,
  onSwitchToLive,
  onSwitchToLocal,
  onExportDiagnostics,
  onCheckUpdates,
}) {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { role: 'about' },
              { label: 'Check for Updates…', click: () => onCheckUpdates() },
              { type: 'separator' },
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => onNavigate('/settings'),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => onReload() },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: () => onCommandPalette() },
        { type: 'separator' },
        { label: 'Calendar', accelerator: 'CmdOrCtrl+1', click: () => onNavigate('/calendar') },
        { label: 'Posts', accelerator: 'CmdOrCtrl+2', click: () => onNavigate('/posts') },
        { label: 'Copywriting', accelerator: 'CmdOrCtrl+3', click: () => onNavigate('/copywriting') },
        { label: 'Agents', accelerator: 'CmdOrCtrl+4', click: () => onNavigate('/agents') },
        { label: 'Analytics', accelerator: 'CmdOrCtrl+5', click: () => onNavigate('/analytics') },
        { label: 'Integrations', accelerator: 'CmdOrCtrl+6', click: () => onNavigate('/integrations') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'New Project Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => onNewProjectWindow(),
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Switch to Live (https://anextpost.com)', click: () => onSwitchToLive() },
        { label: 'Switch to Local Dev (localhost:4200)', click: () => onSwitchToLocal() },
        { label: 'Export Diagnostics Bundle…', click: () => onExportDiagnostics() },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resolveTrayIcon() {
  const candidates = [
    path.resolve(__dirname, 'icon.png'),
    path.resolve(__dirname, '..', 'apps', 'frontend', 'src', 'app', 'icon.png'),
    path.resolve(__dirname, '..', 'apps', 'frontend', 'public', 'icon.png'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const img = nativeImage.createFromPath(filePath);
      if (!img.isEmpty()) {
        return img.resize({ width: 18, height: 18 });
      }
    }
  }
  return nativeImage.createEmpty();
}

function createAppTray({
  appName,
  getTargetUrl,
  getStatusLabel,
  onShowWindow,
  onNavigate,
  onReload,
  onExportDiagnostics,
  onQuit,
}) {
  const icon = resolveTrayIcon();
  const tray = new Tray(icon);
  if (icon.isEmpty() && process.platform === 'darwin') {
    tray.setTitle('AP');
  }
  tray.setToolTip(appName);

  function refreshMenu() {
    const contextMenu = Menu.buildFromTemplate([
      { label: `${appName} — ${getStatusLabel()}`, enabled: false },
      { label: getTargetUrl(), enabled: false },
      { type: 'separator' },
      { label: 'Open ANEXTPOST', click: () => onShowWindow() },
      { label: 'Calendar', click: () => onNavigate('/calendar') },
      { label: 'Posts', click: () => onNavigate('/posts') },
      { label: 'Agents', click: () => onNavigate('/agents') },
      { type: 'separator' },
      { label: 'Retry / Reload', click: () => onReload() },
      { label: 'Export Diagnostics…', click: () => onExportDiagnostics() },
      { type: 'separator' },
      { label: `Quit ${appName}`, click: () => onQuit() },
    ]);
    tray.setContextMenu(contextMenu);
  }

  tray.on('click', () => onShowWindow());
  refreshMenu();
  return { tray, refreshMenu };
}

module.exports = {
  buildAppMenu,
  createAppTray,
};
