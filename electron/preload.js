const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('anextpostDesktop', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
  getTargetUrl: () => ipcRenderer.invoke('desktop:get-target-url'),
  setTargetUrl: (url) => ipcRenderer.invoke('desktop:set-target-url', url),
  navigate: (routePath) => ipcRenderer.invoke('desktop:navigate', routePath),
  retryLoad: () => ipcRenderer.invoke('desktop:retry-load'),
  copyText: (text) => ipcRenderer.invoke('desktop:copy-text', text),
  showNotification: (options) => ipcRenderer.invoke('desktop:notify', options),
  setBadgeCount: (count) => ipcRenderer.invoke('desktop:set-badge-count', count),
  exportDiagnostics: () => ipcRenderer.invoke('desktop:export-diagnostics'),
  onDeepLink: (callback) => subscribe('desktop:deep-link', callback),
  onShortcut: (callback) => subscribe('desktop:shortcut', callback),
  onOpenFile: (callback) => subscribe('desktop:open-file', callback),
  onNetworkStatus: (callback) => subscribe('desktop:network-status', callback),
});
