const { dialog } = require('electron');

function initAutoUpdater({ app, log, logError }) {
  let autoUpdater = null;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    log('Auto-updater inactive (electron-updater not bundled).');
    return {
      checkForUpdates: async (interactive = false) => {
        if (interactive) {
          await dialog.showMessageBox({
            type: 'info',
            title: 'Updates',
            message: 'Auto-updater is not configured for local dev builds.',
            detail: 'Package a release build with electron-builder to enable automatic updates.',
          });
        }
        return { available: false, reason: 'not-bundled' };
      },
    };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => log('Checking for updates...'));
  autoUpdater.on('update-available', (info) => log(`Update available: ${info.version}`));
  autoUpdater.on('update-not-available', () => log('No updates available.'));
  autoUpdater.on('error', (err) => logError('Auto-updater error:', err.message));
  autoUpdater.on('update-downloaded', async (info) => {
    log(`Update downloaded: ${info.version}`);
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart & Install', 'Later'],
      defaultId: 0,
      title: 'Update Ready',
      message: `ANEXTPOST ${info.version} has been downloaded.`,
      detail: 'Restart the app to apply the update.',
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      logError('Initial update check failed:', err.message);
    });
  }

  return {
    checkForUpdates: async (interactive = false) => {
      if (!app.isPackaged) {
        if (interactive) {
          await dialog.showMessageBox({
            type: 'info',
            title: 'Updates',
            message: 'Running in development mode.',
            detail: 'Auto-updates run only in packaged macOS builds.',
          });
        }
        return { available: false, reason: 'dev-mode' };
      }
      const res = await autoUpdater.checkForUpdates();
      return { available: Boolean(res && res.updateInfo), info: res ? res.updateInfo : null };
    },
  };
}

module.exports = {
  initAutoUpdater,
};
